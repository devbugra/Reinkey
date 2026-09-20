# Reinkey

**The session layer for machine payments on Stellar.**

*Give your agent the keys. Keep the reins.*

x402 lets software pay per HTTP call. On Stellar every `exact` payment is its own transaction — about five seconds and one ledger entry each — which can carry neither agent traffic nor per-second or per-token pricing.

Reinkey adds an x402 scheme called **`channel`**. One transaction opens a **session**: a deposit locked in a Soroban contract, naming one payee. Every call after that is a signed cumulative voucher, verified off-chain in about 0.2 ms. The seller settles hundreds of payments with one `claim`. Measured on testnet: **468 payments, 3 chain transactions.**

A session carries:

- an **on-chain budget** — the payer is a Soroban custom account that enforces a per-transaction cap, a daily cap, allowed payees, allowed trading pairs with mandatory slippage protection and an expiry, in `__check_auth`;
- **metering** by request, by second or by token, including SSE streams;
- **signed receipts** committing to the request and response hashes;
- **funding with any asset** — `openChannelWith({ payWith: "XLM" })` swaps and opens in one call;
- **exchange access** through `GET /dex/quote`: route, price impact, suggested `minOut`, and a free pre-verdict on whether the agent's own policy would accept the trade;
- an **uncollateralized credit pool** (Float);
- **discovery** — the x402 Bazaar catalog, `llms.txt` and MCP.

The wire format is written down as an open specification, so a second implementation can interoperate without reading this code: [`docs/spec/scheme_channel_stellar.md`](docs/spec/scheme_channel_stellar.md).

> **Status: Stellar testnet, unaudited, pre-1.0.** Don't send mainnet funds.

## Self-serve, not a demo

Connect a wallet at [reinkey.io](https://www.reinkey.io) → **Reins** → *Create your own agent account*. One transaction deploys the same account code with **your wallet as owner**; the agent key is generated in your browser and shown once. From then on you change caps, payees, expiry and exchange permission, or freeze the account, from the console — each write is authorized by your wallet as `Sig::Owner` and goes straight to the chain. Our server is not in that path and could not change a limit if it wanted to.

## What makes this different

Guarding an agent's spending is a crowded idea. Four things decide whether a guard actually holds.

1. **The limit lives in the account, not in a service.** The cap, the allowed payees and the allowed
   trading pairs are fields inside a Soroban smart account, checked in `__check_auth` on every
   authorization the agent signs. Nothing off-chain sits in the trust path: if our facilitator is
   down, seized or hostile, the limit still holds, because the network is what rejects the
   transaction. A rejection is a failed transaction with a hash and a reason code anyone can
   look up — not a screen that said no.
2. **Built for agents, not for a human watching a popup.** There is no extension to install and no
   confirmation dialog in the loop. A headless agent gets a key, signs, and the chain decides.
   `pnpm demo:injected` feeds an agent a poisoned response, the agent obeys it and signs three
   harmful transactions, and all three fail on-chain with `PAYEE_NOT_ALLOWED`,
   `PER_TX_CAP_EXCEEDED` and `SLIPPAGE_UNBOUNDED`.
3. **The policy knows what kind of action it is, not just who and how much.** A payment is checked
   against the payee allow-list; a trade is checked against the allowed pair, must name the account
   itself as recipient, must carry slippage protection, and its inner token transfer must match the
   swap one-for-one — so a swap can't smuggle a second transfer out. Opening a session is
   only valid when the deposit transfer sits in the same authorization tree.
4. **Paying is metered, and every payment carries a proof of what it bought.** Payments are signed
   vouchers verified off-chain in under a millisecond and settled in one transaction for hundreds
   of them; each one produces a receipt signed by the facilitator's key, binding the request and
   the delivered response. Verification needs only the signer's public key, in the browser or
   offline — never our word.

## Deployed on Stellar testnet

| Contract | Address | On-chain wasm (sha256) | Unit tests |
|---|---|---|---|
| `channel` | `CD2GXK3IYEWRPZAJKQEHO7XO5CVZDKVEK7W2TIGDR6LSEYD52V7EGGHL` | `0064fa39559df3df…0ca532` | 7 |
| `reinkey-account` (current code) | deployed per account from wasm hash `717675c3a94daf93fc0de32b16a311c13c80ac5adc7220a0c653eed6e1ab8242` | `717675c3a94daf93…ab8242` | 18 |
| `reinkey-account` (original example) | `CDGT6UG26GHXKTFTX6YX2Z3QUDLZZYGRPLA2SZTSIOTX4DFGRZRPBX5J` | `59b36bb454222de3…112b10` | 18 |
| `credit-pool` | `CDIYNPCABLAUOAHEFKC6LCWUCBUTVHATDF2A7KECX5G6GSZ35FXIDE3U` | `105092e00e2a0475…b389fc` | 9 |

The hashes above were read from the network, not from a local build. Check them yourself:

```bash
stellar contract fetch --id <address> --network testnet --out-file /tmp/c.wasm
shasum -a 256 /tmp/c.wasm
```

**Reproducibility, precisely.** `channel`, `credit-pool` and the account code now in use —
`717675c3a94daf93fc0de32b16a311c13c80ac5adc7220a0c653eed6e1ab8242`, the hash the console deploys
for every new account and the one `GET /demo/info` reports as `accountWasm` — all reproduce
byte-for-byte from `stellar contract build` in this repository. The single exception is the
**original example account** `CDGT6UG26GHXKTFTX6YX2Z3QUDLZZYGRPLA2SZTSIOTX4DFGRZRPBX5J`: it was
deployed before a later source edit and still runs the older `59b36bb4…` build, so anything the
example demonstrates is exercised against that bytecode rather than today's source. Every account
created since runs code that reproduces from this tree.

## Three products

| | **Reinkey Meter** | **Reinkey Reins** |
|---|---|---|
| For | Sellers: APIs, data feeds, inference | Agent owners |
| Does | Charges per request, per token or per second | An agent account with caps, allowed payees and allowed trading pairs, enforced in `__check_auth` |
| Package | [`@reinkey/meter`](packages/meter) | [`@reinkey/sdk`](packages/sdk) |

**Reinkey Float** is the finance layer: a lending pool (`contracts/credit-pool`) where agents work on uncollateralized credit. Funds in a Reins account handed to the pool cannot leave its policy, so capital that can't escape needs no collateral. The HTTP API (`GET /float`) is **read-only** — everything there is read by simulation; **deposit and withdraw are live in the console**, signed by your own wallet. Opening a credit line is the pool admin's call, so there is no permissionless borrowing.

```ts
// Seller: one line per endpoint
const rk = await reinkey({ facilitator, payTo: "G…" });
app.get("/book", rk.meter({ price: 5000n, unit: "request" }), handler);
```

```ts
// Agent: one transaction to open the session, then every call is a signed voucher
const { channelId } = await account.openChannel({ payee, deposit: 500_000n, voucherSecret });
const { res } = await x402Fetch(`${api}/book`, { signer, network: "stellar:testnet" });
```

## Paid tool calls for AI assistants

[`@reinkey/mcp`](packages/mcp/README.md) is an MCP server. It gives any MCP client — Claude among them — tools that buy things: `reinkey_discover`, `reinkey_call`, `reinkey_stream`, `reinkey_quote`, `reinkey_swap`, `reinkey_budget`. The first call to a seller opens a session; every call after that is a voucher. A policy rejection comes back as a result (`{ ok: false, code: "PER_TX_CAP_EXCEEDED" }`), not an error — the assistant can explain it, it cannot get around it, because the rejection came from Stellar.

Verified on testnet: sessions #17 and #18, 8 payments, 2 chain transactions.

## Repository

| Path | What |
|---|---|
| `contracts/` | Soroban contracts: `channel`, `reinkey-account`, `credit-pool` |
| `packages/core` | `@reinkey/core`: voucher encoding and signing, reason codes, types |
| `packages/meter` | `@reinkey/meter`: seller middleware (Reinkey Meter): per-request `rk.meter()`, per-token/per-second `rk.stream()` |
| `packages/sdk` | `@reinkey/sdk`: agent SDK (Reinkey Reins) |
| `packages/mcp` | `@reinkey/mcp`: MCP server with paid tool calls |
| `backend/` | The facilitator: voucher verification, automatic claims, audit ledger, signed receipts, SSE, `GET /dex/quote`, x402 Bazaar catalog (`/discovery/resources`), OpenAPI, `llms.txt`, MCP, demo seller |
| `app.mandate/` | Reinkey Console: live feed, Meter (seller), Reins (account), Float (credit pool) and Exchange views |
| `landing-page/` | Marketing site, product pages and the documentation (`/docs`) |
| `agents/` | Demo agents: a trader, and a compromised agent that gets stopped by the chain |
| `docs/spec/` | The open `channel` scheme specification |
| `scripts/`, `deployments/` | Testnet deploy scripts and the deployed contract ids |

## Develop

```bash
pnpm install
pnpm build        # core → sdk, meter
pnpm test
pnpm typecheck
```

The backend, the console and the site are separate apps with their own `README.md` and `.env.example`:

```bash
cd backend      && npm i && npm run start:dev   # :3000
cd landing-page && npm i && npm run dev         # :3001
cd app.mandate  && npm i && npm run dev         # :3002
```

## Documentation

**[www.reinkey.com/docs](https://www.reinkey.com/docs)** — quickstarts for Meter and Reins, the console guide, testnet setup, the MCP server, limits, the security model, the full reason-code table and the facilitator API. The sources are in `landing-page/app/(docs)/docs`.

The scheme itself: [`docs/spec/scheme_channel_stellar.md`](docs/spec/scheme_channel_stellar.md). The facilitator also describes itself at `/openapi.json`, `/llms.txt` and `/mcp`.

## License

MIT
