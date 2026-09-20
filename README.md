# Reinkey

**Metered x402 payments and on-chain spending authority for AI agents, on Stellar.**

*Give your agent the keys. Keep the reins.*

With x402's `exact` scheme every payment is its own Stellar transaction and waits about five seconds. Reinkey adds a **payment channel scheme**: the buyer locks a deposit once, pays with signed vouchers verified off-chain in under a millisecond, and the seller settles thousands of payments in a single transaction. The buyer is a smart account whose limits are enforced by the network, not by a server.

> **Status: Stellar testnet, unaudited, pre-1.0.** Don't send mainnet funds.

## What makes this different

Guarding an agent's spending is a crowded idea. Three things decide whether a guard actually holds.

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
   swap one-for-one — so a swap can't smuggle a second transfer out. Opening a payment channel is
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
| `reinkey-account` (demo) | `CDGT6UG26GHXKTFTX6YX2Z3QUDLZZYGRPLA2SZTSIOTX4DFGRZRPBX5J` | `59b36bb454222de3…112b10` | 18 |
| `credit-pool` | `CDIYNPCABLAUOAHEFKC6LCWUCBUTVHATDF2A7KECX5G6GSZ35FXIDE3U` | `105092e00e2a0475…b389fc` | 9 |

The hashes above were read from the network, not from a local build. Check them yourself:

```bash
stellar contract fetch --id <address> --network testnet --out-file /tmp/c.wasm
shasum -a 256 /tmp/c.wasm
```

`channel` and `credit-pool` reproduce byte-for-byte from `stellar contract build` in this
repository. The deployed `reinkey-account` does not: its source was edited after that account was
deployed, so the account running the demo is an earlier build of the same contract. Everything the
demo claims about it is exercised against the deployed bytecode, not the newer source.

## Three products

| | **Reinkey Meter** | **Reinkey Reins** |
|---|---|---|
| For | Sellers: APIs, data feeds, inference | Agent owners |
| Does | Charges per request, per token or per second | An agent account with caps, allowed payees and allowed trading pairs, enforced in `__check_auth` |
| Package | [`@reinkey/meter`](packages/meter) | [`@reinkey/sdk`](packages/sdk) |

**Reinkey Float** is the finance layer: a lending pool (`contracts/credit-pool`) where agents work on uncollateralized credit. Funds in a Reins account handed to the pool cannot leave its policy, so capital that can't escape needs no collateral. Read-only over `GET /float` and the console's Float view.

```ts
// Seller: one line per endpoint
const rk = await reinkey({ facilitator, payTo: "G…" });
app.get("/book", rk.meter({ price: 5000n, unit: "request" }), handler);
```

```ts
// Agent: one transaction to open, then every call is a signed voucher
const { channelId } = await account.openChannel({ payee, deposit: 500_000n, voucherSecret });
const { res } = await x402Fetch(`${api}/book`, { signer, network: "stellar:testnet" });
```

## Repository

| Path | What |
|---|---|
| `contracts/` | Soroban contracts: `channel`, `reinkey-account`, `credit-pool` |
| `packages/core` | `@reinkey/core`: voucher encoding and signing, reason codes, types |
| `packages/meter` | `@reinkey/meter`: seller middleware (Reinkey Meter): per-request `rk.meter()`, per-token/per-second `rk.stream()` |
| `packages/sdk` | `@reinkey/sdk`: agent SDK (Reinkey Reins) |
| `backend/` | The facilitator: voucher verification, automatic claims, audit ledger, SSE, x402 Bazaar catalog (`/discovery/resources`), OpenAPI, `llms.txt`, MCP, demo seller |
| `app.mandate/` | Reinkey Console: live feed, Meter (seller), Reins (account) and Float (credit pool) views |
| `landing-page/` | Marketing site, product pages and the documentation (`/docs`) |
| `agents/` | Demo agents: a trader, and a compromised agent that gets stopped by the chain |
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

Run the site and open `/docs`, or read the sources in `landing-page/app/(docs)/docs`. The facilitator describes itself at `/openapi.json`, `/llms.txt` and `/mcp`.

## License

MIT

