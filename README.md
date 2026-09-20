# Reinkey

**Metered x402 payments and on-chain spending authority for AI agents, on Stellar.**

*Give your agent the keys. Keep the reins.*

With x402's `exact` scheme every payment is its own Stellar transaction and waits about five seconds. Reinkey adds a **payment channel scheme**: the buyer locks a deposit once, pays with signed vouchers verified off-chain in under a millisecond, and the seller settles thousands of payments in a single transaction. The buyer is a smart account whose limits are enforced by the network, not by a server.

> **Status: Stellar testnet, unaudited, pre-1.0.** Don't send mainnet funds.

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

