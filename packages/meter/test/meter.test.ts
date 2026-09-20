import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  FacilitatorError,
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_RESPONSE_V1,
  chargeFor,
  decodeHeader,
  encodeHeader,
  reinkey,
  type FetchLike,
  type MeterRequest,
  type PaymentRequiredBody,
} from "../src/index.ts";

const FACILITATOR = "https://facilitator.test";
const PAY_TO = "GSELLER";
const ASSET = "CUSDC";
const CHANNEL = "CCHANNEL";
const SIG = "ab".repeat(64);

const receipt = {
  scheme: "channel",
  channelId: "7",
  accepted: "5000",
  delta: "5000",
  remaining: "495000",
  latencyMs: 1.5,
};

type Route = (body: any) => { status?: number; json: unknown };

/** Facilitator'ı taklit eden fetch. Çağrıları kaydeder. */
function mockFetch(routes: Record<string, Route>) {
  const calls: { url: string; method: string; body: any }[] = [];
  const fn: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const route = routes[`${method} ${url.replace(FACILITATOR, "")}`];
    const r = route ? route(body) : { status: 404, json: { error: "NOT_FOUND", source: "gateway", message: "no route" } };
    const status = r.status ?? 200;
    const text = r.json === undefined ? "" : JSON.stringify(r.json);
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text };
  };
  return { fn, calls };
}

const supported: Route = () => ({
  json: { kinds: [{ x402Version: 2, scheme: "channel", network: "stellar:testnet" }] },
});
const demoInfo: Route = () => ({ json: { usdc: ASSET, channelContract: CHANNEL } });

function fakeRes() {
  const headers: Record<string, string> = {};
  const out = { headers, status: 0, body: undefined as any };
  const res = {
    setHeader: (k: string, v: string) => void (headers[k] = v),
    status(code: number) {
      out.status = code;
      return { json: (b: unknown) => void (out.body = b) };
    },
  };
  return { res, out };
}

function fakeReq(headers: Record<string, string> = {}, url = "/book?depth=5"): MeterRequest {
  return { headers: { host: "seller.test", ...headers }, originalUrl: url, protocol: "https" };
}

const voucherHeader = (cumulative = "5000") =>
  encodeHeader({
    x402Version: 2,
    scheme: "channel",
    network: "stellar:testnet",
    payload: { channelId: "7", cumulative, signature: SIG },
  });

describe("reinkey() discovery", () => {
  it("reads network from /supported and contracts from /demo/info", async () => {
    const { fn, calls } = mockFetch({ "GET /supported": supported, "GET /demo/info": demoInfo });
    const rk = await reinkey({ facilitator: `${FACILITATOR}/`, payTo: PAY_TO, fetch: fn });
    expect(rk.network).toBe("stellar:testnet");
    expect(rk.asset).toBe(ASSET);
    expect(rk.channelContract).toBe(CHANNEL);
    expect(rk.exactEnabled).toBe(false);
    expect(calls.map((c) => c.url)).toEqual([`${FACILITATOR}/supported`, `${FACILITATOR}/demo/info`]);
  });

  it("prefers explicit options and /supported extra, skipping /demo/info", async () => {
    const { fn, calls } = mockFetch({
      "GET /supported": () => ({
        json: { kinds: [{ scheme: "channel", network: "stellar:testnet", extra: { asset: "CFROMEXTRA" } }] },
      }),
    });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, channelContract: "CEXPLICIT", fetch: fn });
    expect(rk.asset).toBe("CFROMEXTRA");
    expect(rk.channelContract).toBe("CEXPLICIT");
    expect(calls).toHaveLength(1);
  });

  it("fails clearly when contracts cannot be discovered", async () => {
    const { fn } = mockFetch({ "GET /supported": supported });
    await expect(reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: fn })).rejects.toThrow(/asset/);
  });

  it("fails when the channel scheme is not advertised", async () => {
    const { fn } = mockFetch({ "GET /supported": () => ({ json: { kinds: [] } }) });
    await expect(reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: fn })).rejects.toThrow(/channel/);
  });
});

describe("rk.meter()", () => {
  const setup = async (verify?: Route) => {
    const m = mockFetch({
      "GET /supported": supported,
      "GET /demo/info": demoInfo,
      ...(verify ? { "POST /verify": verify } : {}),
    });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: m.fn });
    return { rk, ...m };
  };

  it("402 carries Bazaar discovery metadata derived from method and unit", async () => {
    const { rk } = await setup();
    const { res, out } = fakeRes();
    await rk.meter({ price: 200n, unit: "token", sliceTokens: 50, description: "Chat" })(
      { ...fakeReq({}, "/chat"), method: "POST" },
      res,
      vi.fn(),
    );
    const body = out.body as { resource: { mimeType?: string }; extensions?: { bazaar: { info: { input: unknown; output: unknown } } } };
    expect(body.resource.mimeType).toBe("text/event-stream");
    expect(body.extensions?.bazaar.info.input).toEqual({ type: "http", method: "POST", bodyType: "json", body: {} });
    expect(body.extensions?.bazaar.info.output).toEqual({ type: "sse", mimeType: "text/event-stream" });
  });

  it("forwards method, description and extensions to /verify so the facilitator can catalog the resource", async () => {
    const { rk, calls } = await setup(() => ({ json: { isValid: true, receipt: { channelId: "7", delta: "5000" } } }));
    const { res } = fakeRes();
    await rk.meter({ price: 5000n, unit: "request", description: "Order book" })(
      fakeReq({ "payment-signature": voucherHeader() }),
      res,
      vi.fn(),
    );
    const verify = calls.find((c) => c.url.endsWith("/verify"));
    const sent = verify?.body as {
      paymentRequirements: { method?: string; description?: string };
      extensions?: { bazaar?: unknown };
    };
    expect(sent.paymentRequirements.method).toBe("GET");
    expect(sent.paymentRequirements.description).toBe("Order book");
    expect(sent.extensions?.bazaar).toBeTruthy();
  });

  it("no header → 402 with channel requirements, resource derived from the request", async () => {
    const { rk } = await setup();
    const { res, out } = fakeRes();
    const next = vi.fn();
    await rk.meter({ price: 5000n, unit: "request", description: "Order book" })(fakeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(402);
    const body = out.body as PaymentRequiredBody;
    expect(body).toMatchObject({
      x402Version: 2,
      error: "PAYMENT_REQUIRED",
      source: "gateway",
      resource: { url: "https://seller.test/book", description: "Order book" },
    });
    expect(body.accepts).toEqual([
      {
        scheme: "channel",
        network: "stellar:testnet",
        asset: ASSET,
        payTo: PAY_TO,
        amount: "5000",
        unit: "request",
        resource: "https://seller.test/book",
        description: "Order book",
        maxTimeoutSeconds: 60,
        extra: {
          channelContract: CHANNEL,
          minDeposit: "5000000",
          facilitator: FACILITATOR,
          areFeesSponsored: true,
        },
      },
    ]);
    expect(decodeHeader(out.headers[HEADER_REQUIRED])).toEqual(body);
  });

  it("token / second units advertise slice fields", async () => {
    const { rk } = await setup();
    const token = fakeRes();
    await rk.meter({ price: 200n, unit: "token", sliceTokens: 50 })(fakeReq(), token.res, vi.fn());
    expect(token.out.body.accepts[0]).toMatchObject({
      amount: "200",
      unit: "token",
      extra: { sliceTokens: 50, sliceAmount: "10000" },
    });
    const second = fakeRes();
    await rk.meter({ price: 1000n, unit: "second", sliceSeconds: 10 })(fakeReq(), second.res, vi.fn());
    expect(second.out.body.accepts[0]).toMatchObject({
      amount: "1000",
      unit: "second",
      extra: { sliceSeconds: 10, sliceAmount: "10000" },
    });
    expect(chargeFor({ price: 1000n, unit: "second", sliceSeconds: 10 })).toBe(10000n);
  });

  it("publicUrl overrides the derived origin", async () => {
    const m = mockFetch({ "GET /supported": supported, "GET /demo/info": demoInfo });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, publicUrl: "https://api.example.com/", fetch: m.fn });
    const { res, out } = fakeRes();
    await rk.meter({ price: 1n, unit: "request" })(fakeReq(), res, vi.fn());
    expect(out.body.resource.url).toBe("https://api.example.com/book");
  });

  it("malformed header → 400 PAYMENT_MALFORMED, facilitator not called", async () => {
    const { rk, calls } = await setup();
    const before = calls.length;
    const { res, out } = fakeRes();
    const next = vi.fn();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "payment-signature": "%%%not-base64-json" }), res, next);
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("PAYMENT_MALFORMED");
    expect(out.body.accepts).toHaveLength(1);
    expect(next).not.toHaveBeenCalled();
    expect(calls.length).toBe(before);
  });

  it("facilitator accepts → next(), receipt on req.payment and PAYMENT-RESPONSE", async () => {
    const { rk, calls } = await setup(() => ({ json: { isValid: true, receipt } }));
    const { res, out } = fakeRes();
    const req = fakeReq({ "payment-signature": voucherHeader() });
    const next = vi.fn();
    await rk.meter({ price: 5000n, unit: "request" })(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0);
    expect(req.payment).toEqual(receipt);
    expect(decodeHeader(out.headers[HEADER_RESPONSE])).toEqual(receipt);
    expect(out.headers[HEADER_RESPONSE_V1]).toBeUndefined();

    const sent = calls.at(-1)!;
    expect(sent.url).toBe(`${FACILITATOR}/verify`);
    expect(sent.body.paymentPayload.payload).toEqual({ channelId: "7", cumulative: "5000", signature: SIG });
    expect(sent.body.paymentRequirements).toMatchObject({
      scheme: "channel",
      payTo: PAY_TO,
      amount: "5000",
      resource: "https://seller.test/book",
      unit: "request",
    });
  });

  it("v1 X-PAYMENT header also gets X-PAYMENT-RESPONSE", async () => {
    const { rk } = await setup(() => ({ json: { isValid: true, receipt } }));
    const { res, out } = fakeRes();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "x-payment": voucherHeader() }), res, vi.fn());
    expect(out.headers[HEADER_RESPONSE_V1]).toBe(out.headers[HEADER_RESPONSE]);
  });

  it("sliced units charge the slice amount at the facilitator", async () => {
    const { rk, calls } = await setup(() => ({ json: { isValid: true, receipt } }));
    const { res } = fakeRes();
    await rk.meter({ price: 1000n, unit: "second", sliceSeconds: 10 })(
      fakeReq({ "payment-signature": voucherHeader("10000") }),
      res,
      vi.fn(),
    );
    expect(calls.at(-1)!.body.paymentRequirements).toMatchObject({ amount: "10000", unit: "second" });
  });

  it("facilitator rejection → 402 with the reason code passed through", async () => {
    const { rk } = await setup(() => ({
      json: { isValid: false, invalidReason: "CHANNEL_EXHAUSTED", message: "cumulative exceeds deposit" },
    }));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "payment-signature": voucherHeader() }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(402);
    expect(out.body).toMatchObject({
      x402Version: 2,
      error: "CHANNEL_EXHAUSTED",
      source: "facilitator",
      message: "cumulative exceeds deposit",
    });
    expect(out.body.accepts).toHaveLength(1);
    expect(out.headers[HEADER_REQUIRED]).toBeDefined();
  });

  it("RATE_LIMITED → 429 plain error body (no accepts)", async () => {
    const { rk } = await setup(() => ({ json: { isValid: false, invalidReason: "RATE_LIMITED", message: "slow down" } }));
    const { res, out } = fakeRes();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "payment-signature": voucherHeader() }), res, vi.fn());
    expect(out.status).toBe(429);
    expect(out.body).toEqual({ error: "RATE_LIMITED", source: "facilitator", message: "slow down" });
  });

  it("HTTP error body from the facilitator is mapped (CHAIN_UNAVAILABLE → 503)", async () => {
    const { rk } = await setup(() => ({
      status: 503,
      json: { error: "CHAIN_UNAVAILABLE", source: "chain", message: "rpc down" },
    }));
    const { res, out } = fakeRes();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "payment-signature": voucherHeader() }), res, vi.fn());
    expect(out.status).toBe(503);
    expect(out.body).toEqual({ error: "CHAIN_UNAVAILABLE", source: "chain", message: "rpc down" });
  });

  it("network failure → 503 FACILITATOR_UNAVAILABLE", async () => {
    const m = mockFetch({ "GET /supported": supported, "GET /demo/info": demoInfo });
    let down = false;
    const rk = await reinkey({
      facilitator: FACILITATOR,
      payTo: PAY_TO,
      fetch: (u, i) => (down ? Promise.reject(new Error("ECONNREFUSED")) : m.fn(u, i)),
    });
    down = true;
    const { res, out } = fakeRes();
    const next = vi.fn();
    await rk.meter({ price: 5000n, unit: "request" })(fakeReq({ "payment-signature": voucherHeader() }), res, next);
    expect(out.status).toBe(503);
    expect(out.body.error).toBe("FACILITATOR_UNAVAILABLE");
    expect(next).not.toHaveBeenCalled();
  });

  it("exact payload is refused when the facilitator does not advertise it", async () => {
    const { rk, calls } = await setup();
    const before = calls.length;
    const { res, out } = fakeRes();
    await rk.meter({ price: 5000n, unit: "request" })(
      fakeReq({ "payment-signature": encodeHeader({ x402Version: 2, accepted: { scheme: "exact" }, payload: {} }) }),
      res,
      vi.fn(),
    );
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("PAYMENT_MALFORMED");
    expect(calls.length).toBe(before);
  });

  it("works without Express helpers (statusCode + end)", async () => {
    const { rk } = await setup();
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => void (headers[k] = v), statusCode: 200, end: vi.fn() };
    await rk.meter({ price: 5000n, unit: "request" })({ headers: { host: "h" }, url: "/x" }, res, vi.fn());
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.end.mock.calls[0][0]).resource.url).toBe("http://h/x");
  });
});

describe("rk.acceptVoucher()", () => {
  it("posts a bare voucher to /verify and returns the receipt", async () => {
    const m = mockFetch({
      "GET /supported": supported,
      "GET /demo/info": demoInfo,
      "POST /verify": () => ({ json: { isValid: true, receipt } }),
    });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: m.fn });
    const r = await rk.acceptVoucher(
      { channelId: 7n, cumulative: 20000n, signature: SIG },
      { price: 10000n, resource: "https://seller.test/stream", unit: "second" },
    );
    expect(r).toEqual(receipt);
    expect(m.calls.at(-1)!.body).toMatchObject({
      paymentPayload: { scheme: "channel", network: "stellar:testnet", payload: { channelId: "7", cumulative: "20000" } },
      paymentRequirements: { amount: "10000", payTo: PAY_TO, unit: "second" },
    });
  });

  it("throws FacilitatorError with the reason code on rejection", async () => {
    const m = mockFetch({
      "GET /supported": supported,
      "GET /demo/info": demoInfo,
      "POST /verify": () => ({ json: { isValid: false, invalidReason: "VOUCHER_UNDERPAID", message: "too small" } }),
    });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: m.fn });
    const err = await rk
      .acceptVoucher({ channelId: "7", cumulative: "1", signature: SIG }, { price: 10000n, resource: "r" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(FacilitatorError);
    expect(err).toMatchObject({ code: "VOUCHER_UNDERPAID", status: 402, source: "facilitator" });
  });
});

describe("rk.stream()", () => {
  function sseRes() {
    const chunks: string[] = [];
    const headers: Record<string, string> = {};
    let ended = false;
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
      statusCode: 0,
      write: (c: string) => void chunks.push(c),
      end: () => void (ended = true),
      on: () => undefined,
    };
    const events = () =>
      chunks.map((c) => {
        const m = /^event: (\S+)\ndata: (.*)\n\n$/.exec(c)!;
        return { type: m[1], data: JSON.parse(m[2]) as Record<string, unknown> };
      });
    return { res, headers, events, isEnded: () => ended };
  }

  const setup = async (extra: Record<string, Route>) => {
    const m = mockFetch({ "GET /supported": supported, "GET /demo/info": demoInfo, ...extra });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: m.fn });
    return { rk, ...m };
  };
  const paidReq = () => ({ ...fakeReq({}, "/ticker"), payment: { scheme: "channel", channelId: "7", accepted: "1000", delta: "1000", remaining: "9000" } });

  it("opens a session, streams the first slice, asks for the next voucher and continues when paid", async () => {
    const waits = [{ json: { kind: "paid", receipt: { channelId: "7", accepted: "2000" }, requiredCumulative: "3000" } }];
    const { rk, calls } = await setup({
      "POST /streams": () => ({ status: 201, json: { streamId: "s1", requiredCumulative: "2000" } }),
      "POST /streams/s1/wait": () => waits.shift()!,
      "DELETE /streams/s1": () => ({ json: { charged: "2000", vouchers: 2 } }),
    });
    const { res, headers, events, isEnded } = sseRes();
    const s = await rk.stream(paidReq(), res as never, { price: 1000n, unit: "second", sliceSeconds: 1 });

    expect(headers["Content-Type"]).toMatch(/text\/event-stream/);
    expect(events()[0]).toEqual({ type: "session", data: { streamId: "s1", channelId: "7", unit: "second", sliceSeconds: 1, pricePerSecond: "1000" } });

    expect(await s.next()).toBe(true); // 1. saniye: peşin ödenmiş
    s.send("tick", { price: "0.13" });
    expect(await s.next()).toBe(true); // 2. saniye: payment-required → paid
    const ev = events();
    expect(ev.find((e) => e.type === "payment-required")?.data).toEqual({ streamId: "s1", requiredCumulative: "2000" });
    expect(s.units).toBe(2);

    await s.end();
    expect(events().at(-1)).toEqual({ type: "done", data: { units: 2, charged: "2000", vouchers: 2 } });
    expect(isEnded()).toBe(true);
    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.body).toEqual({ reason: "done", units: 2 });
  });

  it("ends with CHANNEL_EXHAUSTED when the facilitator reports the deposit cannot cover the next slice", async () => {
    const { rk, calls } = await setup({
      "POST /streams": () => ({ status: 201, json: { streamId: "s2", requiredCumulative: "2000" } }),
      "POST /streams/s2/wait": () => ({ json: { kind: "exhausted" } }),
      "DELETE /streams/s2": () => ({ json: { charged: "1000", vouchers: 1 } }),
    });
    const { res, events, isEnded } = sseRes();
    const s = await rk.stream(paidReq(), res as never, { price: 1000n, unit: "second" });
    expect(await s.next()).toBe(true);
    expect(await s.next()).toBe(false);
    expect(s.ended).toBe("CHANNEL_EXHAUSTED");
    expect(events().at(-1)).toEqual({ type: "error", data: { code: "CHANNEL_EXHAUSTED", units: 1 } });
    expect(isEnded()).toBe(true);
    expect(calls.find((c) => c.method === "DELETE")?.body).toEqual({ reason: "CHANNEL_EXHAUSTED", units: 1 });
  });

  it("refuses to start without a verified payment on the request", async () => {
    const { rk } = await setup({});
    const { res } = sseRes();
    await expect(rk.stream(fakeReq({}, "/ticker"), res as never, { price: 1000n, unit: "token" })).rejects.toThrow(/rk.meter\(\)/);
  });
});

describe("signed receipts", () => {
  it("sends a request hash to /verify and attests the response body it delivered", async () => {
    const attested: { url: string; body: unknown }[] = [];
    const m = mockFetch({
      "GET /supported": () => ({
        json: { kinds: [{ scheme: "channel", network: "stellar:testnet", extra: { asset: ASSET, channelContract: CHANNEL, receiptSigner: "GSIGNER" } }] },
      }),
      "POST /verify": () => ({ json: { isValid: true, receipt: { channelId: "7", delta: "5000", receipt: { id: "r1" } } } }),
      "POST /receipts/r1/attest": (body: unknown) => {
        attested.push({ url: "/receipts/r1/attest", body });
        return { json: {} };
      },
    });
    const rk = await reinkey({ facilitator: FACILITATOR, payTo: PAY_TO, fetch: m.fn });
    expect(rk.receiptSigner).toBe("GSIGNER");

    const { res } = fakeRes();
    const chunks: string[] = [];
    // node:http tarzı yanıt: gövde `end` ile yazılır.
    const seller = { ...res, write: (c: string) => void chunks.push(c), end: (c?: string) => void (c && chunks.push(c)) };
    await rk.meter({ price: 5000n, unit: "request" })(
      fakeReq({ "payment-signature": voucherHeader() }),
      seller as never,
      () => seller.end('{"ok":true}'),
    );

    const verify = m.calls.find((c) => c.url.endsWith("/verify"));
    const sent = verify?.body as { paymentRequirements: { requestHash?: string } };
    expect(sent.paymentRequirements.requestHash).toMatch(/^[0-9a-f]{64}$/);
    // Aynı istek aynı özeti vermeli (kanonik biçim kararlı).
    expect(sent.paymentRequirements.requestHash).toBe(
      createHash("sha256").update('GET\nhttps://seller.test/book?depth=5\n').digest("hex"),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(attested).toHaveLength(1);
    expect((attested[0].body as { responseHash: string }).responseHash).toBe(
      createHash("sha256").update('{"ok":true}').digest("hex"),
    );
  });
});
