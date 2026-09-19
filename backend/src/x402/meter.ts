// meter(): x402 ile korunan uçlar için Express middleware'i. Nest'e bağımlı DEĞİL;
// Hat 1 bunu `packages/x402`ye taşıyacak. Bağımlılıklar `MeterDeps` ile verilir.

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
