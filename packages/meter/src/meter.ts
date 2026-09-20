// meter(): x402 ile korunan uçlar için middleware. Framework'e bağımlı DEĞİL;
// bağımlılıklar `MeterDeps` ile verilir. Kaynak: backend/src/x402/meter.ts.

import { createHash } from "node:crypto";
import {
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_RESPONSE_V1,
  encodeHeader,
  payloadScheme,
  readPaymentHeader,
} from "./headers.ts";
import type { MeterMiddleware, MeterRequest, MeterResponse, PaymentReceipt } from "./types.ts";

export interface MeterOptions {
  /** Birim fiyat (taban birim; USDC için 7 ondalık). */
  price: bigint;
  unit: "request" | "token" | "second";
  description?: string;
  /**
   * x402 Bazaar keşif meta verisi (`extensions.bazaar`): istek örneği ve çıktı
   * biçimi. Facilitator, ilk doğrulanmış ödemeden sonra kaynağı kataloğa yazar.
   * Verilmezse yöntem ve birimden asgari bir tanım türetilir.
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
  /** İstek özeti (sha256 hex): makbuza girer, "ne için ödendi"yi sabitler. */
  requestHash?: string;
  /** Facilitator kataloğu için: HTTP yöntemi, açıklama ve 402'deki uzantılar. */
  method?: string;
  description?: string;
  extensions?: Record<string, unknown>;
}

/** Zincir dışı bir hata: sebep kodu gövdesi + HTTP durumu. */
export interface MeterError {
  status: number;
  code: string;
  source: string;
  message: string;
  tx?: string;
}

export interface MeterDeps {
  /**
   * Satıcı yanıtı gönderdikten sonra çağrılır: teslim edilen gövdenin özeti
   * makbuza taahhüt edilir. Yalnızca tek gövdeli yanıtlarda (`unit: request`).
   */
  attest?(receiptId: string, body: Buffer): void;
  network: string;
  asset: string;
  payTo: string;
  channelContract: string;
  facilitatorUrl: string;
  /** Kaynak URL'sinin kökü. Verilmezse istekten türetilir (protokol + host). */
  publicUrl?: string;
  minDeposit: bigint;
  exactEnabled: boolean;
  verifyChannel(payload: unknown, ctx: MeterContext): Promise<object>;
  verifyExact(payload: unknown, ctx: MeterContext): Promise<object>;
  /** Bilinmeyen hatayı sebep kodu biçimine çevirir. */
  toError(e: unknown): MeterError;
}

/** 402 yanıtının gövdesi (aynısı base64 olarak `PAYMENT-REQUIRED` başlığında). */
export interface PaymentRequiredBody {
  x402Version: 2;
  error: string;
  source: string;
  message: string;
  tx?: string;
  resource: { url: string; description: string; mimeType?: string };
  accepts: Record<string, unknown>[];
  extensions?: Record<string, unknown>;
}

/**
 * x402 Bazaar uzantısı (specs/extensions/bazaar.md). Akışlı birimlerde çıktı
 * SSE'dir; uzantı bunun için ad tanımlamadığından `type: "sse"` + mimeType verilir.
 */
export function bazaarExtension(
  opts: Pick<MeterOptions, "unit" | "bazaar">,
  method: string,
): Record<string, unknown> {
  const m = method.toUpperCase();
  const body = ["POST", "PUT", "PATCH"].includes(m);
  const stream = opts.unit !== "request";
  return {
    info: {
      input: {
        type: "http",
        method: m,
        ...(body ? { bodyType: "json", body: {} } : { queryParams: {} }),
        ...((opts.bazaar?.info?.input as object | undefined) ?? {}),
      },
      output: stream
        ? { type: "sse", mimeType: "text/event-stream" }
        : { type: "json", mimeType: "application/json" },
      ...(opts.bazaar?.info ?? {}),
    },
    schema: opts.bazaar?.schema ?? {},
  };
}

/** Bu çağrı için alınacak tutar: dilimli uçlarda ilk dilimin bedeli. */
export function chargeFor(opts: MeterOptions): bigint {
  if (opts.unit === "token") return opts.price * BigInt(opts.sliceTokens ?? 1);
  if (opts.unit === "second") return opts.price * BigInt(opts.sliceSeconds ?? 1);
  return opts.price;
}

export function paymentRequirements(
  opts: MeterOptions,
  deps: MeterDeps,
  resource: string,
): Record<string, unknown>[] {
  const charge = chargeFor(opts);
  const accepts: Record<string, unknown>[] = [
    {
      scheme: "channel",
      network: deps.network,
      asset: deps.asset,
      payTo: deps.payTo,
      amount: opts.price.toString(),
      unit: opts.unit,
      resource,
      description: opts.description ?? "",
      maxTimeoutSeconds: 60,
      extra: {
        channelContract: deps.channelContract,
        minDeposit: deps.minDeposit.toString(),
        facilitator: deps.facilitatorUrl,
        areFeesSponsored: true,
        ...(opts.unit === "token"
          ? { sliceTokens: opts.sliceTokens ?? 1, sliceAmount: charge.toString() }
          : {}),
        ...(opts.unit === "second"
          ? { sliceSeconds: opts.sliceSeconds ?? 1, sliceAmount: charge.toString() }
          : {}),
      },
    },
  ];
  if (deps.exactEnabled) {
    accepts.push({
      scheme: "exact",
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

/** İsteğin kök URL'si: dış satıcının `publicUrl` ayarı olmayabilir. */
export function requestOrigin(req: MeterRequest): string {
  const fwd = req.headers["x-forwarded-proto"];
  const proto =
    req.protocol ??
    ((req.socket as { encrypted?: boolean } | null | undefined)?.encrypted ? "https" : ((Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() ?? "http"));
  const h = req.headers["host"];
  const host = (Array.isArray(h) ? h[0] : h) ?? "localhost";
  return `${proto}://${host}`;
}

function sendJson(res: MeterResponse, status: number, body: unknown) {
  if (typeof res.status === "function") {
    res.status(status).json(body);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end?.(JSON.stringify(body));
}

/**
 * İstek özeti: alıcının NE istediğini sabitler. Yöntem, sorgu dizesi dahil tam
 * adres ve (varsa) gövde; başlıklar girmez, ödeme başlığı her çağrıda değişir.
 */
export function requestHashOf(req: MeterRequest & { body?: unknown }, resource: string): string {
  const url = req.originalUrl ?? req.url ?? "";
  const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const body =
    req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0
      ? JSON.stringify(req.body)
      : "";
  return createHash("sha256")
    .update(`${(req.method ?? "GET").toUpperCase()}\n${resource}${query}\n${body}`)
    .digest("hex");
}

/** Yanıt gövdesini yakalar; yanıtın kendisine dokunmaz. */
function captureBody(res: MeterResponse, done: (body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const push = (c: unknown) => {
    if (typeof c === "string") chunks.push(Buffer.from(c, "utf8"));
    else if (Buffer.isBuffer(c)) chunks.push(c);
  };
  // Express `res.json` gövdeyi `res.send` üzerinden yazar; ikisini de sarmak yerine
  // en alttaki `write`/`end` sarılır: her iki yolda da aynı baytlar geçer.
  const origWrite = res.write?.bind(res);
  const origEnd = res.end?.bind(res);
  if (origWrite) {
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      push(chunk);
      return (origWrite as (...a: unknown[]) => unknown)(chunk, ...rest);
    }) as MeterResponse["write"];
  }
  if (origEnd) {
    res.end = ((chunk: unknown, ...rest: unknown[]) => {
      push(chunk);
      try {
        done(Buffer.concat(chunks));
      } catch {
        /* taahhüt yazılamadı: yanıtı etkilemez */
      }
      return (origEnd as (...a: unknown[]) => unknown)(chunk, ...rest);
    }) as MeterResponse["end"];
  }
}

export function meter(opts: MeterOptions, deps: MeterDeps): MeterMiddleware {
  if (opts.price <= 0n) throw new RangeError("meter(): price must be a positive bigint (base units)");
  return async (req, res, next) => {
    const base = (deps.publicUrl ?? requestOrigin(req)).replace(/\/+$/, "");
    const path = (req.originalUrl ?? req.url ?? "/").split("?")[0];
    const resource = `${base}${path}`;
    const accepts = paymentRequirements(opts, deps, resource);
    const method = (req.method ?? "GET").toUpperCase();
    const extensions = { bazaar: bazaarExtension(opts, method) };

    const send402 = (e: MeterError) => {
      const body: PaymentRequiredBody = {
        x402Version: 2,
        error: e.code,
        source: e.source,
        message: e.message,
        ...(e.tx ? { tx: e.tx } : {}),
        resource: {
          url: resource,
          description: opts.description ?? "",
          mimeType: opts.unit === "request" ? "application/json" : "text/event-stream",
        },
        accepts,
        extensions,
      };
      res.setHeader(HEADER_REQUIRED, encodeHeader(body));
      sendJson(res, e.status, body);
    };

    const header = readPaymentHeader(req.headers);
    if (header === undefined) {
      return send402({
        status: 402,
        code: "PAYMENT_REQUIRED",
        source: "gateway",
        message: "This resource is paid. Send a payment in the PAYMENT-SIGNATURE header.",
      });
    }
    if (header === null) {
      return send402({
        status: 400,
        code: "PAYMENT_MALFORMED",
        source: "gateway",
        message: "The payment header could not be decoded as base64 JSON",
      });
    }

    const ctx: MeterContext = {
      price: chargeFor(opts),
      payTo: deps.payTo,
      resource,
      unit: opts.unit,
      method,
      description: opts.description,
      extensions,
      requestHash: requestHashOf(req, resource),
    };
    let receipt: object;
    try {
      const scheme = payloadScheme(header.payload);
      receipt =
        scheme === "exact"
          ? await deps.verifyExact(header.payload, ctx)
          : await deps.verifyChannel(header.payload, ctx);
    } catch (e) {
      const err = deps.toError(e);
      if (err.status === 402 || err.code === "PAYMENT_MALFORMED") send402(err);
      else sendJson(res, err.status, { error: err.code, source: err.source, message: err.message });
      return;
    }
    // `next()` try bloğunun dışında: handler'ın hatası ödeme hatası sanılmasın.
    req.payment = receipt as PaymentReceipt;
    const encoded = encodeHeader(receipt);
    res.setHeader(HEADER_RESPONSE, encoded);
    if (header.version === 1) res.setHeader(HEADER_RESPONSE_V1, encoded);
    const id = (receipt as { receipt?: { id?: string } }).receipt?.id;
    if (id && deps.attest && opts.unit === "request") captureBody(res, (body) => deps.attest!(id, body));
    next();
  };
}
