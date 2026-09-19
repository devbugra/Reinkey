/**
 * x402 `channel` şeması istemcisi.
 *
 * - `ChannelSigner`: kanalın kümülatif sayacını tutar ve kupon imzalar.
 *   Kümülatif tutar tek yönlü artar; her kupon bir öncekini geçersizleştirir.
 * - `x402Fetch`: 402 → şartları oku → kupon imzala → isteği tekrarla.
 * - `streamPaid`: dilimli SSE akışı (docs/BACKEND.md §6.3, §14.1). Ödenen dilim
 *   bitince sunucu durur, istemci yeni kupon gönderir, akış devam eder.
 */
import {
  bytesToHex,
  isChannelRequirement,
  signVoucher,
  type ChannelPayload,
  type ChannelReceipt,
  type ChannelRequirement,
  type PaymentRequired,
} from "@reinkey/core";

export class VoucherLimitError extends Error {
  constructor(
    readonly code: string,
    readonly cumulative: bigint,
  ) {
    super(`kupon reddedildi: ${code}`);
    this.name = "VoucherLimitError";
  }
}

export class ChannelSigner {
  private cumulative: bigint;

  constructor(
    readonly opts: {
      networkPassphrase: string;
      channelContract: string;
      channelId: bigint;
      secret: Uint8Array;
      deposit: bigint;
      /** Zincirde tahsil edilmiş tutar; sayaç buradan başlar. */
      claimed?: bigint;
    },
  ) {
    this.cumulative = opts.claimed ?? 0n;
  }

  get current(): bigint {
    return this.cumulative;
  }

  get remaining(): bigint {
    return this.opts.deposit - this.cumulative;
  }

  /** Kümülatif tutarı `delta` kadar artırıp kupon imzalar. */
  next(delta: bigint): ChannelPayload["payload"] {
    return this.at(this.cumulative + delta);
  }

  /** Belirli bir kümülatif tutar için kupon imzalar (sunucu `requiredCumulative` verdiğinde). */
  at(cumulative: bigint): ChannelPayload["payload"] {
    if (cumulative <= this.cumulative && cumulative !== 0n) {
      // Aynı tutarı yeniden imzalamak facilitator'da VOUCHER_NOT_INCREASING olur.
      if (cumulative < this.cumulative) throw new Error("kümülatif tutar geriye gidemez");
    }
    if (cumulative > this.opts.deposit) {
      throw new VoucherLimitError("CHANNEL_EXHAUSTED", cumulative);
    }
    const sig = signVoucher(
      {
        networkPassphrase: this.opts.networkPassphrase,
        channelContract: this.opts.channelContract,
        channelId: this.opts.channelId,
        cumulative,
      },
      this.opts.secret,
    );
    this.cumulative = cumulative;
    return {
      channelId: this.opts.channelId.toString(),
      cumulative: cumulative.toString(),
      signature: bytesToHex(sig),
    };
  }

  payload(p: ChannelPayload["payload"], network: string): ChannelPayload {
    return { x402Version: 2, scheme: "channel", network, payload: p };
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

export function encodePaymentHeader(payload: ChannelPayload): Record<string, string> {
  const value = b64(JSON.stringify(payload));
  // v2 adı ve v1 adı birlikte gönderilir: backend hangisini bekliyorsa onu okur.
  return { "PAYMENT-SIGNATURE": value, "X-PAYMENT": value };
}

export function decodeReceipt(res: Response): ChannelReceipt | null {
  const raw = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (!raw) return null;
  try {
    return JSON.parse(unb64(raw)) as ChannelReceipt;
  } catch {
    return null;
  }
}

export function pickChannelRequirement(body: PaymentRequired): ChannelRequirement | null {
  return body.accepts?.find(isChannelRequirement) ?? null;
}

export type X402FetchOptions = RequestInit & {
  signer: ChannelSigner;
  network: string;
  /** 402 geldiğinde çağrılır; kanal açma gibi işler için. */
  onPaymentRequired?: (req: ChannelRequirement) => void;
};

/**
 * Ücretli bir kaynağı çağırır. İlk istek ödemesiz gider; 402 dönerse şartları
 * okur, kuponu imzalar ve isteği tekrarlar.
 */
export async function x402Fetch(
  url: string,
  o: X402FetchOptions,
): Promise<{ res: Response; receipt: ChannelReceipt | null; paid: bigint }> {
  const { signer, network, onPaymentRequired, ...init } = o;
  const first = await fetch(url, init);
  if (first.status !== 402) return { res: first, receipt: decodeReceipt(first), paid: 0n };

  const body = (await first.json()) as PaymentRequired;
  const req = pickChannelRequirement(body);
  if (!req) throw new Error("402 yanıtında channel şeması yok");
  onPaymentRequired?.(req);

  const amount = BigInt(req.amount);
  const voucher = signer.next(amount);
  const headers = {
    ...(init.headers as Record<string, string> | undefined),
    ...encodePaymentHeader(signer.payload(voucher, network)),
  };
  const res = await fetch(url, { ...init, headers });
  return { res, receipt: decodeReceipt(res), paid: amount };
}

/* ------------------------------------------------------------------ akış */

export type StreamEvent =
  | { type: "session"; data: Record<string, unknown> }
  | { type: "token"; data: { text: string; index: number; paidThrough?: string } }
  | { type: "tick"; data: { pair: string; price: string; index: number; ts?: string } }
  | { type: "payment-required"; data: { streamId: string; requiredCumulative: string } }
  | { type: "error"; data: { code: string } }
  | { type: "done"; data: Record<string, unknown> };

/** SSE gövdesini olaylara ayırır (fetch tabanlı, EventSource yok: başlık gerekiyor). */
export async function* parseSse(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) throw new Error("akış gövdesi yok");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let type = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        // ":" ile başlayan satırlar yorum (ping)
      }
      if (dataLines.length === 0) continue;
      try {
        yield { type, data: JSON.parse(dataLines.join("\n")) } as StreamEvent;
      } catch {
        /* bozuk olay: atla */
      }
    }
  }
}

export type PaidStreamOptions = {
  url: string;
  /**
   * Kuponların gönderileceği facilitator. Verilmezse 402 şartlarındaki
   * `extra.facilitator` kullanılır: dış bir satıcının alıcısı onu ancak oradan öğrenir.
   */
  apiUrl?: string;
  signer: ChannelSigner;
  network: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** İlk dilim için peşin ödenecek tutar; 402 şartlarından da okunabilir. */
  firstSlice?: bigint;
  onEvent?: (e: StreamEvent) => void;
};

export type PaidStreamResult = {
  events: number;
  charged: bigint;
  vouchers: number;
  endedWith: "done" | "error";
  code?: string;
};

/**
 * Dilimli ücretli akışı tüketir. Sunucu `payment-required` dediğinde yeni
 * kuponu `POST /channels/:id/voucher` ile gönderir ve akış devam eder.
 * Aynı istemci hem token hem saniye başı akışta çalışır.
 */
export async function streamPaid(o: PaidStreamOptions): Promise<PaidStreamResult> {
  const init: RequestInit = {
    method: o.method ?? "GET",
    headers: o.body ? { "content-type": "application/json" } : undefined,
    body: o.body ? JSON.stringify(o.body) : undefined,
  };

  // İlk istek: şartları öğren (402) ve ilk dilimi peşin öde.
  const probe = await fetch(o.url, init);
  let firstSlice = o.firstSlice;
  let apiUrl = o.apiUrl;
  if (probe.status === 402) {
    const body = (await probe.json()) as PaymentRequired;
    const req = pickChannelRequirement(body);
    if (!req) throw new Error("402 yanıtında channel şeması yok");
    apiUrl ??= (req.extra as { facilitator?: string }).facilitator;
    if (firstSlice === undefined) {
      const perUnit = BigInt(req.amount);
      const slice = Number(
        (req.extra as { sliceSeconds?: number; sliceTokens?: number }).sliceSeconds ??
          (req.extra as { sliceTokens?: number }).sliceTokens ??
          1,
      );
      firstSlice = perUnit * BigInt(slice);
    }
  } else if (probe.status >= 400) {
    throw new Error(`akış başlatılamadı: ${probe.status} ${await probe.text()}`);
  } else {
    // Ücretsiz akış: doğrudan tüket.
    return consume(probe, { ...o, apiUrl: apiUrl ?? "" }, null);
  }
  if (!apiUrl) throw new Error("facilitator adresi yok: apiUrl verin ya da 402 extra.facilitator taşımalı");

  const voucher = o.signer.next(firstSlice!);
  const res = await fetch(o.url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...encodePaymentHeader(o.signer.payload(voucher, o.network)) },
  });
  if (!res.ok) throw new Error(`akış reddedildi: ${res.status} ${await res.text()}`);
  return consume(res, { ...o, apiUrl }, firstSlice!);
}

async function consume(
  res: Response,
  o: PaidStreamOptions & { apiUrl: string },
  firstCharged: bigint | null,
): Promise<PaidStreamResult> {
  let events = 0;
  let charged = firstCharged ?? 0n;
  let vouchers = firstCharged === null ? 0 : 1;
  let channelId = o.signer.opts.channelId.toString();

  for await (const ev of parseSse(res)) {
    o.onEvent?.(ev);
    if (ev.type === "session") {
      channelId = String((ev.data as { channelId?: string }).channelId ?? channelId);
    } else if (ev.type === "token" || ev.type === "tick") {
      events++;
    } else if (ev.type === "payment-required") {
      const required = BigInt(ev.data.requiredCumulative);
      let payload;
      try {
        payload = o.signer.at(required);
      } catch (e) {
        if (e instanceof VoucherLimitError) {
          return { events, charged, vouchers, endedWith: "error", code: e.code };
        }
        throw e;
      }
      const sent = await fetch(`${o.apiUrl}/channels/${channelId}/voucher`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streamId: ev.data.streamId, ...payload }),
      });
      if (!sent.ok) {
        const body = (await sent.json().catch(() => ({}))) as { error?: string };
        return { events, charged, vouchers, endedWith: "error", code: body.error ?? `HTTP_${sent.status}` };
      }
      charged = required;
      vouchers++;
    } else if (ev.type === "error") {
      return { events, charged, vouchers, endedWith: "error", code: ev.data.code };
    } else if (ev.type === "done") {
      const d = ev.data as { charged?: string; vouchers?: number };
      if (d.charged) charged = BigInt(d.charged);
      if (typeof d.vouchers === "number") vouchers = d.vouchers;
      return { events, charged, vouchers, endedWith: "done" };
    }
  }
  return { events, charged, vouchers, endedWith: "done" };
}
