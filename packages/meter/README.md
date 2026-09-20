# Reinkey Meter

`@reinkey/meter` — usage-based billing middleware. Put a price on any HTTP endpoint and get paid per request, per token or per second in USDC on Stellar, over [x402](https://github.com/x402-foundation/x402).

Buyers (typically AI agents using [Reinkey Reins](../sdk/README.md), `@reinkey/sdk`) open a payment channel to your Stellar address once, then attach a signed, off-chain voucher to every call. The middleware hands each voucher to a Reinkey facilitator, which verifies it in a few milliseconds and later claims the accumulated amount on-chain to your address in a single transaction. You never hold a key, run a node or touch Soroban.

> **Status: pre-release.** Stellar **testnet only**. The smart contracts are **unaudited**. The package is **not yet published to npm**; the install line below is what it will be. Until then, build it from the monorepo ([github.com/devbugra/Reinkey](https://github.com/devbugra/Reinkey)): `pnpm install` at the root, then `pnpm build && pnpm pack` in `packages/meter`. `https://reinkey.onrender.com` is the hosted testnet facilitator; you can also run your own (`backend/` in this repository).

## Install

```sh
npm i @reinkey/meter
```

Node 20+. ESM only. Zero runtime dependencies. Express is **not** a dependency: the middleware only uses `req.headers`, `req.originalUrl`/`req.url`, `res.setHeader` and `res.status().json()` (falling back to `res.statusCode` + `res.end()`), so it works with Express 4/5, NestJS on platform-express, and Connect-style servers.

## 60-second quickstart

```ts
import express from "express";
import { reinkey, EXPOSED_HEADERS, type PaidRequest } from "@reinkey/meter";

const rk = await reinkey({
  facilitator: "https://reinkey.onrender.com", // your facilitator's base URL
  payTo: "G…SELLER",                      // your Stellar address; channels must name it as payee
});

const app = express();

app.get(
  "/book",
  rk.meter({ price: 5000n, unit: "request", description: "Order book" }),
  (req: PaidRequest<express.Request>, res) => {
    // Runs only after the voucher was accepted. The receipt is on req.payment.
    res.json({ bids: [], asks: [], paid: req.payment });
  },
);

app.listen(8080);
```

Prices are `bigint` base units of the asset. USDC on Stellar has 7 decimals, so `5000n` is 0.0005 USDC.

What happens on a call:

1. No payment header → **402** with the payment requirements (body below, also base64 in the `PAYMENT-REQUIRED` header).
2. The buyer retries with a `PAYMENT-SIGNATURE` header (x402 v2; v1 `X-PAYMENT` is also read) carrying a channel voucher.
3. The middleware `POST`s it to `{facilitator}/verify`. If accepted, your handler runs, `req.payment` holds the receipt and the response carries `PAYMENT-RESPONSE`. If rejected, the buyer gets a 402 with the facilitator's reason code.

If browsers call your API, expose the x402 headers in CORS: `cors({ exposedHeaders: EXPOSED_HEADERS })`.

## Options

### `reinkey(options)` → `Promise<Reinkey>`

| Option | Type | Default | |
|---|---|---|---|
| `facilitator` | `string` | required | Facilitator base URL. `GET /supported` is fetched once at startup. |
| `payTo` | `string` | required | Your Stellar address. The facilitator rejects vouchers from channels whose payee is someone else (`WRONG_PAYEE`). |
| `publicUrl` | `string` | derived per request | Origin used to build the `resource` URL in the 402. By default it is `req.protocol` + `Host` header; set it when you are behind a proxy that rewrites either (or configure Express `trust proxy`). |
| `asset` | `string` | discovered | Payment asset contract id (USDC). See [Facilitator contract](#facilitator-contract) for how discovery works today. |
| `channelContract` | `string` | discovered | Channel contract id. |
| `minDeposit` | `bigint` | `1000 × price` per route | Deposit suggested to buyers in the 402 (`extra.minDeposit`). Advisory. |
| `timeoutMs` | `number` | `10000` | Timeout for each facilitator call. |
| `fetch` | `FetchLike` | `globalThis.fetch` | Custom fetch (tests, proxies, retries). |

The returned object has `meter(opts)`, `stream(req, res, opts)`, `deps(opts?)`, `acceptVoucher(voucher, ctx)` and the resolved `network`, `asset`, `channelContract`, `payTo`, `facilitator`, `receiptSigner` and `exactEnabled`.

### `rk.meter(options)`

| Option | Type | |
|---|---|---|
| `price` | `bigint` | Price per unit, in base units. Must be positive. |
| `unit` | `"request" \| "token" \| "second"` | What one `price` buys. |
| `description` | `string?` | Shown to buyers in the 402. |
| `sliceTokens` | `number?` | `unit: "token"` only: tokens per paid slice. The call is charged `sliceTokens × price` up front. |
| `sliceSeconds` | `number?` | `unit: "second"` only: seconds per paid slice. The call is charged `sliceSeconds × price` up front. |

### Low-level API

`meter(opts, deps)` is the same middleware with every dependency injected (`MeterDeps`: network, asset, `verifyChannel`, `verifyExact`, `toError`, …). Use it if you verify vouchers in-process instead of over HTTP. Also exported: `paymentRequirements`, `chargeFor`, `requestOrigin`, the header helpers (`encodeHeader`, `decodeHeader`, `readPaymentHeader`, `payloadScheme`, `HEADER_*`, `EXPOSED_HEADERS`), `REASON_STATUS`, `statusForCode`, `FacilitatorError` and all types (`PaidRequest`, `ChannelReceipt`, `PaymentRequiredBody`, `MeterRequest`, `MeterResponse`, …).

## The 402 body

```json
{
  "x402Version": 2,
  "error": "PAYMENT_REQUIRED",
  "source": "gateway",
  "message": "This resource is paid. Send a payment in the PAYMENT-SIGNATURE header.",
  "resource": { "url": "https://seller.example/book", "description": "Order book" },
  "accepts": [
    {
      "scheme": "channel",
      "network": "stellar:testnet",
      "asset": "C…USDC",
      "payTo": "G…SELLER",
      "amount": "5000",
      "unit": "request",
      "resource": "https://seller.example/book",
      "description": "Order book",
      "maxTimeoutSeconds": 60,
      "extra": {
        "channelContract": "C…CHANNEL",
        "minDeposit": "5000000",
        "facilitator": "https://reinkey.onrender.com",
        "areFeesSponsored": true
      }
    }
  ]
}
```

For `unit: "token"` / `"second"`, `extra` also carries `sliceTokens` / `sliceSeconds` and `sliceAmount` (the amount the first voucher must cover). If the facilitator advertises the `exact` scheme, a second `accepts` entry is added for it.

The same body shape is used for rejected payments, with `error` set to the reason code, `source` to who rejected it (`gateway`, `facilitator` or `chain`) and, when relevant, `tx`.

The receipt on `req.payment` / `PAYMENT-RESPONSE` for the channel scheme:

```json
{ "scheme": "channel", "channelId": "7", "accepted": "5000", "delta": "5000", "remaining": "495000", "latencyMs": 1.8 }
```

## Reason codes

| Code | HTTP | Meaning |
|---|---|---|
| `PAYMENT_REQUIRED` | 402 | No payment header. |
| `PAYMENT_MALFORMED` | 400 | Header is not base64 JSON, wrong scheme/network, or bad payload. |
| `CHANNEL_NOT_FOUND`, `CHANNEL_CLOSED`, `CHANNEL_EXPIRING` | 402 | Channel state. |
| `WRONG_PAYEE`, `WRONG_ASSET` | 402 | The channel does not pay you / is not in the facilitator's asset. |
| `VOUCHER_BAD_SIGNATURE`, `VOUCHER_NOT_INCREASING`, `VOUCHER_UNDERPAID` | 402 | Voucher problems. |
| `CHANNEL_EXHAUSTED` | 402 | Cumulative would exceed the deposit. |
| `ACCOUNT_FROZEN` | 402 | The owner froze the paying account. |
| `RATE_LIMITED` | 429 | Per-channel rate limit at the facilitator. |
| `CHAIN_UNAVAILABLE` | 503 | The facilitator could not read the chain. |
| `FACILITATOR_UNAVAILABLE` | 503 | This package only: the facilitator could not be reached over HTTP. |

The authoritative list lives in [`backend/src/common/reason-codes.ts`](../../backend/src/common/reason-codes.ts) and [`packages/core/src/codes.ts`](../core/src/codes.ts). Codes are passed through verbatim; unknown rejection codes are returned as 402. The `message` of a facilitator rejection is passed through as the facilitator wrote it (the current facilitator writes these in Turkish); rely on `error`, not on `message`.

Non-402 failures (429, 5xx) are returned as a plain `{ error, source, message }` body without `accepts`.

## Streams: per token, per second

`rk.meter()` charges the first slice; `rk.stream()` runs the slice loop. It opens a session on the facilitator (`POST /streams`), writes the SSE headers and the `session` event, and whenever a slice is used up it emits `payment-required` and waits for the buyer's voucher on the facilitator (`POST /streams/:id/wait`, long-poll). The buyer side is `@reinkey/sdk`'s `streamPaid()`, which finds the facilitator in the 402's `extra.facilitator`.

```ts
app.get(
  "/ticker",
  rk.meter({ price: 1000n, unit: "second", sliceSeconds: 1 }),
  async (req, res) => {
    const s = await rk.stream(req, res, { price: 1000n, unit: "second", sliceSeconds: 1 });
    while (await s.next()) {          // false once the buyer stops paying or disconnects
      s.send("tick", await quote());
      await sleep(1000);
    }
    await s.end();                    // settles the session on the facilitator, emits `done`
  },
);
```

`s.ended` tells you why a stream stopped: `CHANNEL_EXHAUSTED` (decided before waiting, from the channel's remaining deposit), `TIMEOUT` (`voucherTimeoutMs`, default 10 s), `ACCOUNT_FROZEN`, or `done`. Each stream is recorded as `stream.started` / `stream.ended` in the facilitator's ledger.

## Verified against the live facilitator

`agents/tools/meter-check.ts` runs this package on a separate `node:http` server against the testnet facilitator: a real on-chain channel opened by a Reinkey account, three paid calls (402 → voucher → 200 with `PAYMENT-RESPONSE`), a forged signature rejected with `VOUCHER_BAD_SIGNATURE`, the endpoint appearing in the Bazaar catalog, and a per-second stream of 5 ticks paid with 5 vouchers, ending `done` with the right total in the ledger.

## Not yet in this package

- The `exact` scheme. The client code path exists (`/verify` then `/settle`) but the current facilitator does not enable `exact`, so it is **untested**; `reinkey()` refuses `exact` payloads unless `/supported` advertises them.
- Retries / circuit breaking for facilitator calls. A facilitator outage yields `503 FACILITATOR_UNAVAILABLE`; your endpoint is unavailable, never free.
- Seller authentication towards the facilitator (there is none on the facilitator side yet).
- Non-Express adapters (Fastify, Hono, Web `Request`/`Response`).

## Facilitator contract

This is what `reinkey()` relies on, as implemented in `backend/src/x402/facilitator.controller.ts` at the time of writing.

**`GET /supported`** → `{ "kinds": [{ "x402Version": 2, "scheme": "channel", "network": "stellar:testnet", "extra": { "asset": "C…", "channelContract": "C…", "areFeesSponsored": true } }] }`. The network, the asset, the channel contract and whether `exact` is enabled are all read from here.

> `reinkey()` resolves the asset and channel contract in this order: (1) the `asset` / `channelContract` options, (2) `kinds[].extra`, (3) `GET /demo/info` as a fallback for facilitators older than the `extra` field. If none works it throws and asks you to pass them.

**`POST /verify`** with

```json
{
  "x402Version": 2,
  "paymentPayload": { "x402Version": 2, "scheme": "channel", "network": "stellar:testnet",
                      "payload": { "channelId": "7", "cumulative": "5000", "signature": "<128 hex>" } },
  "paymentRequirements": { "scheme": "channel", "network": "stellar:testnet", "asset": "C…", "payTo": "G…SELLER",
                           "amount": "5000", "maxAmountRequired": "5000", "resource": "https://…/book", "unit": "request" }
}
```

`paymentPayload` is the decoded payment header, forwarded untouched. `amount` is the charge for this call (the slice amount for sliced units). The facilitator only reads `payTo`, `amount`/`maxAmountRequired`, `resource`, `unit` and `scheme` from the requirements.

- **`/verify` verifies *and accepts*.** For the `channel` scheme a successful call advances the channel's `lastAccepted` cumulative in the facilitator and queues the voucher for the automatic on-chain claim. It is not idempotent: sending the same voucher twice yields `VOUCHER_NOT_INCREASING`. This is what makes a single HTTP call sufficient for a seller; `/settle` is not needed for channels (for `channel` it only reports whether the voucher was already accepted).
- Accepted → `200 { "isValid": true, "receipt": { … } }`.
- Rejected → `200 { "isValid": false, "invalidReason": "CHANNEL_EXHAUSTED", "message": "…" }`. There is no `source` or HTTP status in this shape; the package sets `source: "facilitator"` and takes the status from the reason-code table, which reproduces what the backend's in-process middleware returns.
- Malformed request or infrastructure failure → non-2xx with `{ "error", "source", "message", "tx"? }` (e.g. `400 PAYMENT_MALFORMED`, `503 CHAIN_UNAVAILABLE`). Status and fields are passed through.

**On-chain claim.** The channel contract's `claim` is permissionless and always pays the channel's `payee`, so the facilitator's claim scheduler settles to your address without your signature. Claim timing (threshold / expiry margin) is the facilitator operator's configuration, not yours.

**Trust model, plainly.** Until the claim lands, your revenue exists as the latest voucher held in the facilitator's store. You are trusting the facilitator to keep it and to claim before the channel expires. `/verify` is unauthenticated and is rate-limited per channel, not per seller. The `WRONG_ASSET` check compares against the facilitator's configured asset, not the `asset` you send.

## License

MIT
