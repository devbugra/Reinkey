/**
 * rk.stream(): token ya da saniye başına satılan SSE akışı.
 *
 * Satıcı tarafındaki döngü şudur: ilk dilim `rk.meter()` ile peşin alınmıştır;
 * dilim tükenince alıcıya `payment-required` denir ve kupon facilitator'da
 * beklenir (`POST /streams/:id/wait`). Kupon gelirse devam, gelmezse akış
 * sebep koduyla biter. Olay adları facilitator'ın demo satıcısıyla ve
 * @reinkey/sdk `streamPaid()` ile birebirdir; alıcı tarafı değişmez.
 *
 *   app.get("/ticker", rk.meter({ price: 1000n, unit: "second" }), async (req, res) => {
 *     const s = await rk.stream(req, res, { price: 1000n, unit: "second" });
 *     while (await s.next()) {            // false: akış bitti (s.ended sebebi söyler)
 *       s.send("tick", { price: await quote() });
 *       await sleep(1000);
 *     }
 *     await s.end();
 *   });
 */
import type { MeterOptions } from "./meter.ts";
import type { MeterRequest, MeterResponse, PaymentReceipt } from "./types.ts";

export type StreamEndReason = "done" | "CHANNEL_EXHAUSTED" | "TIMEOUT" | "ACCOUNT_FROZEN" | "ABORTED";

export interface StreamOptions extends Pick<MeterOptions, "price" | "sliceTokens" | "sliceSeconds"> {
  unit: "token" | "second";
  /** Bir dilim için kupon beklenecek süre (ms). Facilitator tek çağrıda en çok 30 sn bekler. */
  voucherTimeoutMs?: number;
}

export interface StreamsClient {
  open(body: Record<string, unknown>): Promise<{ streamId: string; requiredCumulative: string }>;
  wait(streamId: string, timeoutMs: number): Promise<{ kind: string; receipt?: PaymentReceipt; requiredCumulative?: string }>;
  end(streamId: string, reason: StreamEndReason, units: number): Promise<{ charged: string; vouchers: number }>;
}

export class PaidStream {
  /** Teslim edilen birim sayısı (token ya da saniye). */
  units = 0;
  /** Akış bittiyse sebebi. */
  ended: StreamEndReason | null = null;
  private paidThrough: number;
  private requiredCumulative: string;
  private closed = false;
  /** Yanıt kapatıldı; artık hiçbir olay yazılmaz. */
  private finished = false;
  private readonly slice: number;

  constructor(
    private readonly client: StreamsClient,
    readonly streamId: string,
    private readonly res: MeterResponse,
    private readonly opts: StreamOptions,
    requiredCumulative: string,
    readonly channelId: string,
  ) {
    this.slice = opts.unit === "token" ? (opts.sliceTokens ?? 1) : (opts.sliceSeconds ?? 1);
    this.paidThrough = this.slice;
    this.requiredCumulative = requiredCumulative;
    res.on?.("close", () => {
      this.closed = true;
    });
  }

  /** SSE olayı yazar. Bağlantı kapandıysa ya da yanıt bittiyse sessizce atlar. */
  send(event: string, data: unknown) {
    if (this.closed || this.finished) return;
    this.res.write?.(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Bir sonraki birimi teslim etmeden önce çağrılır. Ödenmişse `true` döner ve
   * sayaç ilerler; dilim bittiyse kuponu bekler; alıcı ödemezse ya da bağlantıyı
   * kestiyse akışı bitirip `false` döner.
   */
  async next(): Promise<boolean> {
    if (this.closed) return this.finish("done"), this.close(), false;
    if (this.ended) return false;
    if (this.units >= this.paidThrough) {
      this.send("payment-required", { streamId: this.streamId, requiredCumulative: this.requiredCumulative });
      const r = await this.client.wait(this.streamId, this.opts.voucherTimeoutMs ?? 10_000);
      if (this.closed) return this.finish("done"), this.close(), false;
      if (r.kind !== "paid") {
        const code: StreamEndReason =
          r.kind === "timeout" ? "TIMEOUT" : r.kind === "frozen" ? "ACCOUNT_FROZEN" : r.kind === "exhausted" ? "CHANNEL_EXHAUSTED" : "ABORTED";
        this.send("error", { code, units: this.units });
        await this.finish(code);
        this.close();
        return false;
      }
      this.paidThrough += this.slice;
      if (r.requiredCumulative) this.requiredCumulative = r.requiredCumulative;
    }
    this.units++;
    return true;
  }

  /** Akışı bitirir: facilitator'a toplamı kapattırır, `done` olayını yazar, yanıtı kapatır. */
  async end(reason: StreamEndReason = "done") {
    if (this.finished) return;
    const totals = await this.finish(reason);
    if (reason === "done" && totals) this.send("done", { units: this.units, charged: totals.charged, vouchers: totals.vouchers });
    this.close();
  }

  /** Oturumu facilitator'da kapatır (stream.ended yayınlanır); yanıta dokunmaz. */
  private async finish(reason: StreamEndReason) {
    if (this.ended) return null;
    this.ended = reason;
    try {
      return await this.client.end(this.streamId, reason, this.units);
    } catch {
      return null;
    }
  }

  private close() {
    if (this.finished) return;
    this.finished = true;
    this.res.end?.();
  }
}

/** SSE başlıklarını yazar ve `session` olayını gönderir; rk.stream() kullanır. */
export function beginSse(res: MeterResponse) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.statusCode !== undefined) res.statusCode = 200;
  res.flushHeaders?.();
}

/** rk.meter() makbuzundan akış oturumu açar. */
export async function openPaidStream(
  client: StreamsClient,
  req: MeterRequest,
  res: MeterResponse,
  opts: StreamOptions,
  seller: { payTo: string; resource: string },
): Promise<PaidStream> {
  const receipt = req.payment;
  if (!receipt?.channelId) throw new Error("rk.stream(): call rk.meter() first; no verified payment on the request");
  const slice = opts.unit === "token" ? (opts.sliceTokens ?? 1) : (opts.sliceSeconds ?? 1);
  const sliceCost = (opts.price * BigInt(slice)).toString();
  const opened = await client.open({
    channelId: String(receipt.channelId),
    payTo: seller.payTo,
    resource: seller.resource,
    unit: opts.unit,
    sliceCost,
    initialCharge: String(receipt.delta ?? sliceCost),
  });
  beginSse(res);
  const stream = new PaidStream(client, opened.streamId, res, opts, opened.requiredCumulative, String(receipt.channelId));
  stream.send("session", {
    streamId: opened.streamId,
    channelId: String(receipt.channelId),
    unit: opts.unit,
    ...(opts.unit === "second" ? { sliceSeconds: slice, pricePerSecond: opts.price.toString() } : { sliceTokens: slice, pricePerToken: opts.price.toString() }),
  });
  return stream;
}
