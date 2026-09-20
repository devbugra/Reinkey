// reinkey(): kendi backend'imizi çalıştırmayan dış satıcı için hazır giriş noktası.
// `MeterDeps`'i facilitator'ın HTTP API'si üzerinden kurar (/supported, /verify, /settle).
// İstek/yanıt biçimleri: backend/src/x402/facilitator.controller.ts.

import { createHash } from "node:crypto";
import { statusForCode } from "./codes.ts";
import {
  meter,
  requestOrigin,
  type MeterContext,
  type MeterDeps,
  type MeterError,
  type MeterOptions,
} from "./meter.ts";
import { openPaidStream, type PaidStream, type StreamOptions, type StreamsClient } from "./stream.ts";
import type { ChannelReceipt, MeterMiddleware, MeterRequest, MeterResponse } from "./types.ts";

/** Minimum depozito önerisi: bu uçta 1000 çağrı (backend'deki varsayılanla aynı). */
const MIN_DEPOSIT_CALLS = 1000n;

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ReinkeyOptions {
  /** Facilitator kök URL'si, ör. `https://api.reinkey.dev`. */
  facilitator: string;
  /** Satıcının Stellar adresi (G… ya da C…). Kanalın `payee`si bu olmalı. */
  payTo: string;
  /** Kaynak URL'lerinin kökü. Verilmezse her istekten türetilir. */
  publicUrl?: string;
  /** Test ya da özel ağ katmanı için. Varsayılan: `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Ödeme varlığının kontrat kimliği. Verilmezse facilitator'dan öğrenilir. */
  asset?: string;
  /** Kanal kontratının kimliği. Verilmezse facilitator'dan öğrenilir. */
  channelContract?: string;
  /** 402'de önerilen minimum depozito. Varsayılan: uç başına 1000 × çağrı bedeli. */
  minDeposit?: bigint;
  /** Facilitator çağrısı zaman aşımı (ms). Varsayılan 10000. */
  timeoutMs?: number;
}

export interface VoucherInput {
  channelId: string | bigint;
  cumulative: string | bigint;
  /** 128 hex karakter (ed25519). */
  signature: string;
}

export interface Reinkey {
  readonly network: string;
  readonly asset: string;
  readonly channelContract: string;
  readonly payTo: string;
  readonly facilitator: string;
  readonly exactEnabled: boolean;
  /** İmzalı makbuzları doğrulayacak açık anahtar; facilitator `/supported` ile ilan eder. */
  readonly receiptSigner: string | null;
  /** Bir ucu ücretli yapan middleware. */
  meter(opts: MeterOptions): MeterMiddleware;
  /** Düşük seviye `meter(opts, deps)` için bağımlılıklar. */
  deps(opts?: MeterOptions): MeterDeps;
  /**
   * Başlıksız çıplak bir kuponu facilitator'a kabul ettirir (kümülatif ilerler).
   * Kendi akış oturumunu yöneten satıcılar içindir: sonraki dilimin kuponu.
   * Ret durumunda `FacilitatorError` fırlatır.
   */
  acceptVoucher(
    v: VoucherInput,
    ctx: { price: bigint; resource: string; unit?: string },
  ): Promise<ChannelReceipt>;
  /**
   * Token ya da saniye başına satılan SSE akışı. `rk.meter()` ilk dilimi aldıktan
   * sonra çağrılır; facilitator'da bir akış oturumu açar ve dilim bittikçe
   * kuponu orada bekler. Bkz. `PaidStream`.
   */
  stream(req: MeterRequest, res: MeterResponse, opts: StreamOptions): Promise<PaidStream>;
}

/** Facilitator'ın reddi ya da ulaşılamaması. `MeterError` alanlarını taşır. */
export class FacilitatorError extends Error implements MeterError {
  readonly status: number;
  readonly code: string;
  readonly source: string;
  readonly tx?: string;
  constructor(e: MeterError) {
    super(e.message);
    this.name = "FacilitatorError";
    this.status = e.status;
    this.code = e.code;
    this.source = e.source;
    this.tx = e.tx;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export async function reinkey(options: ReinkeyOptions): Promise<Reinkey> {
  const base = options.facilitator.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new TypeError("reinkey(): `facilitator` must be an http(s) URL");
  if (!options.payTo) throw new TypeError("reinkey(): `payTo` is required");
  const doFetch: FetchLike = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof doFetch !== "function") throw new TypeError("reinkey(): no fetch available; pass `fetch`");
  const timeoutMs = options.timeoutMs ?? 10_000;

  const call = async (method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeout = timeoutMs) => {
    try {
      const res = await doFetch(`${base}${path}`, {
        method,
        headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeout),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      throw new FacilitatorError({
        status: 503,
        code: "FACILITATOR_UNAVAILABLE",
        source: "gateway",
        message: `Facilitator unreachable (${method} ${path}): ${(e as Error).message}`,
      });
    }
  };

  /** 2xx olmayan yanıt: `{ error, source, message, tx? }` gövdesi beklenir. */
  const httpError = (r: { status: number; json: unknown }, path: string): FacilitatorError => {
    const b = isRecord(r.json) ? r.json : {};
    return new FacilitatorError({
      status: r.status,
      code: str(b.error) ?? (r.status >= 500 ? "FACILITATOR_UNAVAILABLE" : "PAYMENT_MALFORMED"),
      source: str(b.source) ?? "facilitator",
      message: str(b.message) ?? `Facilitator ${path} returned HTTP ${r.status}`,
      ...(str(b.tx) ? { tx: str(b.tx) } : {}),
    });
  };

  // 1) /supported: ağ ve etkin şemalar.
  const sup = await call("GET", "/supported");
  if (!sup.ok) throw httpError(sup, "/supported");
  const kinds = isRecord(sup.json) && Array.isArray(sup.json.kinds) ? sup.json.kinds.filter(isRecord) : [];
  const channelKind = kinds.find((k) => k.scheme === "channel");
  if (!channelKind || !str(channelKind.network))
    throw new Error(`reinkey(): ${base}/supported does not advertise the 'channel' scheme`);
  const network = str(channelKind.network)!;
  const exactEnabled = kinds.some((k) => k.scheme === "exact" && k.network === network);

  // 2) Varlık ve kanal kontratı. Öncelik: seçenekler → /supported `extra` →
  //    /demo/info (`extra` alanından eski facilitator'lar için yedek; README'ye bakın).
  const extra = isRecord(channelKind.extra) ? channelKind.extra : {};
  const receiptSigner = str(extra.receiptSigner) ?? null;
  let asset = options.asset ?? str(extra.asset);
  let channelContract = options.channelContract ?? str(extra.channelContract);
  if (!asset || !channelContract) {
    const info = await call("GET", "/demo/info").catch(() => undefined);
    if (info?.ok && isRecord(info.json)) {
      asset ??= str(info.json.usdc);
      channelContract ??= str(info.json.channelContract);
    }
  }
  if (!asset || !channelContract)
    throw new Error(
      "reinkey(): could not discover `asset` / `channelContract` from the facilitator; pass them explicitly",
    );

  const verify = async (payload: unknown, ctx: MeterContext, scheme: "channel" | "exact") => {
    const body = {
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: {
        scheme,
        network,
        asset,
        payTo: ctx.payTo,
        amount: ctx.price.toString(),
        maxAmountRequired: ctx.price.toString(),
        resource: ctx.resource,
        unit: ctx.unit,
        ...(ctx.method ? { method: ctx.method } : {}),
        ...(ctx.requestHash ? { requestHash: ctx.requestHash } : {}),
        ...(ctx.description !== undefined ? { description: ctx.description } : {}),
      },
      // Bazaar: facilitator doğrulanan ilk ödemeden sonra kaynağı kataloğa yazar.
      ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
    };
    const r = await call("POST", "/verify", body);
    if (!r.ok) throw httpError(r, "/verify");
    const j = isRecord(r.json) ? r.json : {};
    if (j.isValid === true && isRecord(j.receipt)) return { receipt: j.receipt, body };
    // Ret: 200 + { isValid:false, invalidReason, message }. Durum kod tablosundan gelir.
    const code = str(j.invalidReason) ?? "PAYMENT_MALFORMED";
    throw new FacilitatorError({
      status: statusForCode(code),
      code,
      source: "facilitator",
      message: str(j.message) ?? `Payment rejected: ${code}`,
    });
  };

  const verifyChannel = async (payload: unknown, ctx: MeterContext) =>
    (await verify(payload, ctx, "channel")).receipt;

  const verifyExact = async (payload: unknown, ctx: MeterContext) => {
    if (!exactEnabled)
      throw new FacilitatorError({
        status: 400,
        code: "PAYMENT_MALFORMED",
        source: "gateway",
        message: "The 'exact' scheme is not enabled on this facilitator; use 'channel'",
      });
    const { receipt, body } = await verify(payload, ctx, "exact");
    // exact: doğrulamadan sonra uzlaştırma (standart x402 akışı).
    const s = await call("POST", "/settle", body);
    if (!s.ok) throw httpError(s, "/settle");
    const sj = isRecord(s.json) ? s.json : {};
    if (sj.success === false) {
      const code = str(sj.errorReason) ?? "PAYMENT_MALFORMED";
      throw new FacilitatorError({
        status: statusForCode(code),
        code,
        source: "facilitator",
        message: str(sj.message) ?? `Settlement failed: ${code}`,
      });
    }
    return { ...receipt, ...(str(sj.transaction) ? { transaction: sj.transaction } : {}) };
  };

  const toError = (e: unknown): MeterError =>
    e instanceof FacilitatorError
      ? { status: e.status, code: e.code, source: e.source, message: e.message, ...(e.tx ? { tx: e.tx } : {}) }
      : { status: 500, code: "INTERNAL", source: "gateway", message: "Unexpected server error" };

  const deps = (opts?: MeterOptions): MeterDeps => ({
    network,
    asset: asset!,
    payTo: options.payTo,
    channelContract: channelContract!,
    facilitatorUrl: base,
    publicUrl: options.publicUrl,
    minDeposit: options.minDeposit ?? (opts ? opts.price * MIN_DEPOSIT_CALLS : 0n),
    exactEnabled,
    verifyChannel,
    verifyExact,
    toError,
    // Makbuza yanıt özetini taahhüt et; başarısızlığı yanıtı etkilemez.
    attest: (id, body) => {
      void call("POST", `/receipts/${id}/attest`, {
        responseHash: createHash("sha256").update(body).digest("hex"),
      }).catch(() => undefined);
    },
  });

  // Dış satıcı akış oturumları: POST /streams, POST /streams/:id/wait, DELETE /streams/:id
  const streams: StreamsClient = {
    open: async (body) => {
      const r = await call("POST", "/streams", body);
      if (!r.ok) throw httpError(r, "/streams");
      return r.json as { streamId: string; requiredCumulative: string };
    },
    wait: async (streamId, timeoutMs) => {
      // Uzun sorgu: facilitator en çok 30 sn bekler; HTTP zaman aşımı onun üstünde olmalı.
      const waitMs = Math.min(timeoutMs, 30_000);
      const r = await call("POST", `/streams/${streamId}/wait`, { timeoutMs: waitMs }, waitMs + 5_000);
      if (!r.ok) throw httpError(r, "/streams/:id/wait");
      return r.json as { kind: string; receipt?: ChannelReceipt; requiredCumulative?: string };
    },
    end: async (streamId, reason, units) => {
      const r = await call("DELETE", `/streams/${streamId}`, { reason, units });
      if (!r.ok) throw httpError(r, "/streams/:id");
      return r.json as { charged: string; vouchers: number };
    },
  };

  return {
    network,
    asset,
    channelContract,
    payTo: options.payTo,
    facilitator: base,
    exactEnabled,
    receiptSigner,
    deps,
    meter: (opts) => meter(opts, deps(opts)),
    stream: (req, res, opts) => {
      const base = (options.publicUrl ?? requestOrigin(req)).replace(/\/+$/, "");
      const path = (req.originalUrl ?? req.url ?? "/").split("?")[0];
      return openPaidStream(streams, req, res, opts, { payTo: options.payTo, resource: `${base}${path}` });
    },
    acceptVoucher: async (v, ctx) =>
      (await verifyChannel(
        {
          x402Version: 2,
          scheme: "channel",
          network,
          payload: {
            channelId: v.channelId.toString(),
            cumulative: v.cumulative.toString(),
            signature: v.signature,
          },
        },
        { price: ctx.price, payTo: options.payTo, resource: ctx.resource, unit: ctx.unit ?? "request" },
      )) as unknown as ChannelReceipt,
  };
}
