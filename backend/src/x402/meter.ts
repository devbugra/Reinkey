// meter(): x402 ile korunan uçlar için Express middleware'i. Nest'e bağımlı DEĞİL;
// Hat 1 bunu `packages/x402`ye taşıyacak. Bağımlılıklar `MeterDeps` ile verilir.

import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_RESPONSE_V1,
  encodeHeader,
  payloadScheme,
  readPaymentHeader,
} from './headers';

export interface MeterOptions {
  /** Birim fiyat (taban birim). */
  price: bigint;
  unit: 'request' | 'token' | 'second';
  description?: string;
  /**
   * Bazaar keşif meta verisi (x402 `extensions.bazaar`): istek örneği ve çıktı
   * biçimi. Verilmezse yöntem ve birimden asgari bir tanım türetilir.
   */
  bazaar?: { info?: Record<string, unknown>; schema?: Record<string, unknown> };
  /** `unit: token` için: ödeme dilim başına alınır (sliceTokens × price). */
  sliceTokens?: number;
  /** `unit: second` için: ödeme dilim başına alınır (sliceSeconds × price). */
  sliceSeconds?: number;
}

export interface MeterContext {
  price: bigint;
  payTo: string;
  resource: string;
  unit: string;
  method?: string;
  /** İstek özeti: yöntem + tam adres + (varsa) gövde. Makbuza girer. */
  requestHash?: string;
}

/**
 * İstek özeti: alıcının NE istediğini sabitler. Yöntem, sorgu dizesi dahil tam
 * adres ve gövde (varsa) alınır; başlıklar alınmaz (ödeme başlığı her çağrıda değişir).
 */
export function requestHashOf(
  req: { method?: string; originalUrl?: string; url?: string; body?: unknown },
  resource: string,
): string {
  const url = req.originalUrl ?? req.url ?? '';
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const body =
    req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0
      ? JSON.stringify(req.body)
      : '';
  return createHash('sha256')
    .update(`${(req.method ?? 'GET').toUpperCase()}\n${resource}${query}\n${body}`)
    .digest('hex');
}

/** Zincir dışı bir hata: §3.3 gövdesi + HTTP durumu. */
export interface MeterError {
  status: number;
  code: string;
  source: string;
  message: string;
  tx?: string;
}

export interface MeterDeps {
  /**
   * Satıcı yanıtı gönderdikten sonra çağrılır: makbuza yanıt özeti taahhüt edilir.
   * Yalnızca `unit: request` için; akışlarda gövde tek bir belge değildir.
   */
  attest?(receiptId: string, body: Buffer): void;
  network: string;
  asset: string;
  payTo: string;
  channelContract: string;
  facilitatorUrl: string;
  publicUrl: string;
  minDeposit: bigint;
  exactEnabled: boolean;
  verifyChannel(payload: unknown, ctx: MeterContext): Promise<object>;
  verifyExact(payload: unknown, ctx: MeterContext): Promise<object>;
  /** Bilinmeyen hatayı §3.3 biçimine çevirir. */
  toError(e: unknown): MeterError;
}

export interface PaidRequest extends Request {
  payment?: Record<string, unknown>;
}

/** Bu çağrı için alınacak tutar: dilimli uçlarda ilk dilimin bedeli. */
export function chargeFor(opts: MeterOptions): bigint {
  if (opts.unit === 'token') return opts.price * BigInt(opts.sliceTokens ?? 1);
  if (opts.unit === 'second')
    return opts.price * BigInt(opts.sliceSeconds ?? 1);
  return opts.price;
}

/**
 * x402 Bazaar uzantısı (specs/extensions/bazaar.md). Facilitator bunu
 * kataloğa yazar; ajanlar kaynağı çağırmadan önce girdi/çıktıyı buradan öğrenir.
 * Akışlı birimlerde çıktı SSE'dir; uzantı bunun için ad tanımlamadığından
 * `type: "sse"` ve mimeType birlikte verilir.
 */
export function bazaarExtension(
  opts: Pick<MeterOptions, 'unit' | 'bazaar'>,
  method: string,
): Record<string, unknown> {
  const m = method.toUpperCase();
  const body = ['POST', 'PUT', 'PATCH'].includes(m);
  const stream = opts.unit !== 'request';
  return {
    info: {
      input: {
        type: 'http',
        method: m,
        ...(body ? { bodyType: 'json', body: {} } : { queryParams: {} }),
        ...opts.bazaar?.info?.input as object,
      },
      output: stream
        ? { type: 'sse', mimeType: 'text/event-stream' }
        : { type: 'json', mimeType: 'application/json' },
      ...(opts.bazaar?.info ?? {}),
    },
    schema: opts.bazaar?.schema ?? {},
  };
}

export function paymentRequirements(
  opts: MeterOptions,
  deps: MeterDeps,
  resource: string,
) {
  const charge = chargeFor(opts);
  const accepts: Record<string, unknown>[] = [
    {
      scheme: 'channel',
      network: deps.network,
      asset: deps.asset,
      payTo: deps.payTo,
      amount: opts.price.toString(),
      unit: opts.unit,
      resource,
      description: opts.description ?? '',
      maxTimeoutSeconds: 60,
      extra: {
        channelContract: deps.channelContract,
        minDeposit: deps.minDeposit.toString(),
        facilitator: deps.facilitatorUrl,
        areFeesSponsored: true,
        ...(opts.unit === 'token'
          ? {
              sliceTokens: opts.sliceTokens ?? 1,
              sliceAmount: charge.toString(),
            }
          : {}),
        ...(opts.unit === 'second'
          ? {
              sliceSeconds: opts.sliceSeconds ?? 1,
              sliceAmount: charge.toString(),
            }
          : {}),
      },
    },
  ];
  if (deps.exactEnabled) {
    accepts.push({
      scheme: 'exact',
      network: deps.network,
      asset: deps.asset,
      payTo: deps.payTo,
      amount: charge.toString(),
      maxAmountRequired: charge.toString(),
      resource,
      maxTimeoutSeconds: 60,
      extra: { areFeesSponsored: true },
    });
  }
  return accepts;
}

/**
 * Yanıt gövdesini yakalar: `res.json`/`res.send`/`res.end` sarılır, gövde tek
 * parça hâlinde toplanır ve geri çağrıya verilir. Yanıtın kendisine dokunulmaz.
 */
function captureBody(res: Response, done: (body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const push = (c: unknown) => {
    if (typeof c === 'string') chunks.push(Buffer.from(c, 'utf8'));
    else if (Buffer.isBuffer(c)) chunks.push(c);
  };
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    push(chunk);
    return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as Response['write'];
  res.end = ((chunk: unknown, ...rest: unknown[]) => {
    push(chunk);
    try {
      done(Buffer.concat(chunks));
    } catch {
      /* taahhüt yazılamadı: yanıtı etkilemez */
    }
    return (origEnd as (...a: unknown[]) => Response)(chunk, ...rest);
  }) as Response['end'];
}

export function meter(opts: MeterOptions, deps: MeterDeps) {
  return async (req: PaidRequest, res: Response, next: NextFunction) => {
    const resource = `${deps.publicUrl}${req.originalUrl.split('?')[0]}`;
    const accepts = paymentRequirements(opts, deps, resource);

    const send402 = (e: MeterError) => {
      const body = {
        x402Version: 2,
        error: e.code,
        source: e.source,
        message: e.message,
        ...(e.tx ? { tx: e.tx } : {}),
        resource: {
          url: resource,
          description: opts.description ?? '',
          mimeType: opts.unit === 'request' ? 'application/json' : 'text/event-stream',
        },
        accepts,
        extensions: { bazaar: bazaarExtension(opts, req.method) },
      };
      res.setHeader(HEADER_REQUIRED, encodeHeader(body));
      res.status(e.status).json(body);
    };

    const header = readPaymentHeader(req.headers);
    if (header === undefined) {
      return send402({
        status: 402,
        code: 'PAYMENT_REQUIRED',
        source: 'gateway',
        message:
          'Bu kaynak ücretli. PAYMENT-SIGNATURE başlığıyla ödeme gönderin.',
      });
    }
    if (header === null) {
      return send402({
        status: 400,
        code: 'PAYMENT_MALFORMED',
        source: 'gateway',
        message: 'Ödeme başlığı base64 JSON olarak çözülemedi',
      });
    }

    const ctx: MeterContext = {
      price: chargeFor(opts),
      payTo: deps.payTo,
      resource,
      unit: opts.unit,
      method: req.method,
      requestHash: requestHashOf(req, resource),
    };
    try {
      const scheme = payloadScheme(header.payload);
      const receipt =
        scheme === 'exact'
          ? await deps.verifyExact(header.payload, ctx)
          : await deps.verifyChannel(header.payload, ctx);
      req.payment = receipt as Record<string, unknown>;
      const encoded = encodeHeader(receipt);
      res.setHeader(HEADER_RESPONSE, encoded);
      if (header.version === 1) res.setHeader(HEADER_RESPONSE_V1, encoded);

      // Yanıt gönderilince özetini makbuza taahhüt et (yalnızca tek gövdeli yanıtlar).
      const id = (receipt as { receipt?: { id?: string } }).receipt?.id;
      if (id && deps.attest && opts.unit === 'request') captureBody(res, (body) => deps.attest!(id, body));
      next();
    } catch (e) {
      const err = deps.toError(e);
      if (err.status === 402 || err.code === 'PAYMENT_MALFORMED') send402(err);
      else
        res
          .status(err.status)
          .json({ error: err.code, source: err.source, message: err.message });
    }
  };
}
