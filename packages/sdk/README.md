# Reinkey Reins

`@reinkey/sdk` — the agent side of Reinkey: on-chain spending authority for AI agents, payment channels, the x402 `channel` scheme and sliced, metered streams on Stellar.

An agent gets a key that can only spend what an on-chain policy allows (per-transaction cap, daily cap, allowed payees and contexts, expiry, owner freeze). The limits are enforced by the Reinkey Account contract, not by the SDK, so a compromised agent cannot exceed them. The seller-side counterpart is [Reinkey Meter](../meter/README.md) (`@reinkey/meter`).

> **Status: pre-release.** Stellar **testnet only**. The smart contracts are **unaudited**. The package is **not yet published to npm**; the install line below is what it will be.

## Pay with any asset

```ts
const { channelId, swap } = await account.openChannelWith({
  payee, deposit: 100_000n, voucherSecret, payWith: "XLM",
});
```

Quotes the XLM needed (`quoteIn`, Soroswap `router_get_amounts_in`), swaps it with `minOut = deposit`, then opens the channel. Two transactions, both inside the account's policy; surplus USDC stays in the account. Verified on testnet with `agents/tools/paywith-check.ts`.

## Install

```sh
npm i @reinkey/sdk
```

Node 20+. ESM only. Depends on `@stellar/stellar-sdk` and `@reinkey/core`.

## Usage

```ts
import { ReinkeyAccount, ChannelSigner, x402Fetch, streamPaid } from "@reinkey/sdk";
import { randomBytes } from "node:crypto";

const account = new ReinkeyAccount({
  rpcUrl, networkPassphrase,
  accountId,            // C… Reinkey Account
  channelContractId, usdcContractId,
  agent,                // the agent's Keypair (the policy's agent_key)
  relayer,              // G-account that pays the fee; the agent holds no XLM
  dexRouterId, xlmContractId,
});

// 1) open a channel (a single on-chain transaction)
const voucherSecret = randomBytes(32);
const { channelId } = await account.openChannel({ payee, deposit: 500_000n, voucherSecret });

// 2) pay per call
const signer = new ChannelSigner({ networkPassphrase, channelContract: channelContractId, channelId, secret: voucherSecret, deposit: 500_000n });
const { res, receipt } = await x402Fetch(`${api}/demo/book`, { signer, network: "stellar:testnet" });

// 3) stream metered per second / per token
await streamPaid({ url: `${api}/demo/ticker/stream`, apiUrl: api, signer, network: "stellar:testnet",
  onEvent: (e) => e.type === "tick" && console.log(e.data) });

// 4) trade on the DEX (the limit is enforced on-chain)
await account.swap({ amountIn: 1_000_000n, minOut: 1n });
```

- `ReinkeyAccount` — the on-chain spending authority: open channels, swap, read policy and channel state.
- `ChannelSigner` — keeps the channel's cumulative counter and signs vouchers. The cumulative amount only ever increases; each voucher supersedes the previous one.
- `x402Fetch` — 402 → read the requirements → sign a voucher → retry the request.
- `streamPaid` — consumes a sliced SSE stream. When the paid slice runs out the server pauses and emits `payment-required`; the client posts the next voucher to `POST {apiUrl}/channels/:id/voucher` and the stream continues. The same client works for per-token and per-second streams.
- `invokeWithAuth`, `simulateView`, `SorobanCallError` — the Soroban plumbing underneath.
- `loadDeployment`, `loadSecrets` — helpers for **this monorepo's** `deployments/` directory. Outside the monorepo, pass contract ids and keys explicitly.

Everything exported by `@reinkey/core` you are likely to need (voucher signing, reason codes, wire types) is a direct dependency and can be imported from there.

## Things to know

- **The agent is not the transaction source.** The `relayer` submits the transaction and pays the fee; the agent only signs the auth entry (`Sig::Agent`).
- **Two simulations.** The first simulation, in recording mode, does not run `__check_auth`; the second one, made with the signed auth entry, does, and yields the correct resource estimate. A policy rejection shows up here, before anything is sent to the chain (`SorobanCallError.contractError`).
- **Deliberately submitting a failing transaction** (the "the rejection came from the chain" proof in the demo): pass the `probe*` parameters; the footprint of a sibling call that does satisfy the policy is borrowed.
- **The voucher key is per channel**; it is separate from the agent key. The cumulative amount increases monotonically.
- **Sequence number collisions**: if another process uses the same G-account, a transaction can be dropped; `invokeWithAuth` detects this and retries up to two more times. The agents use a relayer separate from the facilitator's (`agents/relayer.ts`).
- Tests: `pnpm --filter @reinkey/sdk test`. Verification against the real chain: the scripts under `agents/tools/`.

## License

MIT
