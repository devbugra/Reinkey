# x402 scheme: `channel` on Stellar

**Status:** draft 1 · implemented and live on Stellar testnet · reference implementation in this repository
(`contracts/channel`, `backend/src/channel`, `packages/meter`, `packages/sdk`).

## Summary

`exact` settles every payment with its own on-chain transaction. On Stellar that is ~5 seconds
and one ledger entry per call, which rules out the payments machines actually make: thousands of
calls, a fraction of a cent each, often priced per second of a stream or per token of a response.

`channel` moves the payment off-chain and keeps the guarantee on-chain:

1. **Open** — one transaction locks a deposit for one payee in the channel contract and registers
   an ed25519 *voucher key*.
2. **Pay** — each payment is a voucher: the channel id and a **cumulative** amount, signed with the
   voucher key. Verification is one signature check and one comparison; no chain access.
3. **Settle** — the payee (or anyone, on its behalf) submits the latest voucher in one `claim`.
   The contract verifies the signature and pays `cumulative − already_claimed` to the payee.
4. **Close** — the payee may close at any time; the payer may close after expiry and recovers the
   unclaimed remainder.

N payments cost 2–3 transactions regardless of N. A seller that is never paid more than it
delivered loses at most one slice; a buyer can never lose more than the deposit.

## `PaymentRequirements`

```json
{
  "scheme": "channel",
  "network": "stellar:testnet",
  "asset": "C… (SEP-41 token contract, e.g. the USDC SAC)",
  "payTo": "G… or C…",
  "amount": "5000",
  "unit": "request | second | token",
  "resource": "https://seller.example/book",
  "maxTimeoutSeconds": 60,
  "extra": {
    "channelContract": "C…",
    "minDeposit": "100000",
    "facilitator": "https://facilitator.example",
    "areFeesSponsored": true,
    "sliceSeconds": 1, "sliceAmount": "1000"
  }
}
```

`amount` is the price of one `unit` in the asset's base units. For `second` and `token` the
resource is delivered in slices; `sliceSeconds`/`sliceTokens` and `sliceAmount` give the size and
price of one slice, which is also the most a seller can lose to a buyer that stops paying.

## `PaymentPayload`

Sent base64-encoded in the `PAYMENT-SIGNATURE` header (`X-PAYMENT` is accepted for v1 clients).

```json
{
  "x402Version": 2,
  "scheme": "channel",
  "network": "stellar:testnet",
  "payload": { "channelId": "17", "cumulative": "15000", "signature": "<128 hex>" }
}
```

### Voucher signature

```
message   = "reinkey:voucher:v1" ‖ network_id ‖ contract_id ‖ u64_be(channel_id) ‖ i128_be(cumulative)
signature = ed25519_sign(voucher_key, sha256(message))
```

`network_id` is the SHA-256 of the network passphrase and `contract_id` is the 32-byte id of the
channel contract; binding both makes a voucher worthless on any other network or contract. The
amount is cumulative, so vouchers need no nonce: a replayed or older voucher is simply not
increasing, and only the latest one matters at settlement.

## Verification (off-chain)

A facilitator or seller MUST reject a voucher unless all hold:

| Check | Reason code |
|---|---|
| channel exists, is open, and `payee == payTo`, `asset` matches | `CHANNEL_NOT_FOUND`, `CHANNEL_CLOSED`, `WRONG_PAYEE`, `WRONG_ASSET` |
| signature valid for the channel's voucher key | `VOUCHER_BAD_SIGNATURE` |
| `cumulative > last_accepted` | `VOUCHER_NOT_INCREASING` |
| `cumulative − last_accepted ≥ price` of this request or slice | `VOUCHER_UNDERPAID` |
| `cumulative ≤ deposit` | `CHANNEL_EXHAUSTED` |
| channel expiry is further away than the facilitator's settlement margin | `CHANNEL_EXPIRING` |

On success the response carries `PAYMENT-RESPONSE` with the accepted cumulative amount and, in this
implementation, a signed receipt committing to the request hash and the seller-attested response hash.

## Streaming (`unit: second | token`)

The first slice is paid up front with the request. The server streams (SSE) and, before each
further slice, emits `payment-required { streamId, requiredCumulative }`. The client answers with
`POST {facilitator}/channels/{id}/voucher`. If no voucher arrives, the stream ends: the buyer paid
for what it received and the seller delivered at most one unpaid slice.

## Settlement (on-chain)

```
claim(id: u64, cumulative: i128, sig: BytesN<64>) -> i128     // anyone may call; funds go to the payee
close(id: u64, caller: Address) -> i128                        // payee: any time · payer: after expiry + grace
top_up(id: u64, amount: i128)
```

`claim` needs no authorization because it can only move funds to the channel's payee and only up
to a payer-signed amount. A facilitator therefore never has custody and is replaceable: if it
disappears, the seller claims with the last voucher it holds.

## Security considerations

- **Buyer's maximum loss** is the deposit; **seller's maximum loss** is one slice.
- The voucher key is per channel and can only authorize payment to that channel's payee. It is not
  the payer's account key.
- The payer may be a Soroban custom account. In the reference implementation the deposit transfer
  is authorized by an account whose policy (per-transaction cap, daily cap, allowed payees,
  expiry) is enforced in `__check_auth`, so an agent cannot open a channel outside its budget.
- A seller SHOULD claim before `expiry − margin`; after expiry plus a grace period the payer can
  close and recover unclaimed funds.
- Facilitators SHOULD rate-limit per source and count a voucher against a channel's rate only
  after its signature verifies.

## Relationship to `exact`

`channel` does not replace `exact`; a resource may offer both. `exact` suits a single, larger
payment with no prior relationship. `channel` suits any relationship with more than a handful of
payments, and is the only option for per-second or per-token pricing.
