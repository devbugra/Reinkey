# @reinkey/mcp

Paid tool calls for any MCP client. An AI assistant pays **per request, per second or per token** on Stellar — inside a budget that is written on-chain, not in a prompt.

MCP has no payments. x402 has payments, but one chain transaction per call. This server joins them with a **session**: the first call to a seller opens an x402 `channel` with one Stellar transaction; every call after that is a signed voucher verified in well under a millisecond; the seller settles them all with one `claim`.

```
assistant ──MCP──▶ reinkey-mcp ──HTTP + voucher──▶ any x402 seller
                        │
                        └─ Reinkey account (Soroban): per-tx cap, daily cap,
                           allowed payees, allowed pairs — enforced by Stellar
```

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `reinkey_discover` | free | Lists paid resources from the facilitator's Bazaar catalog |
| `reinkey_call` | resource price | One paid HTTP request; returns the body, the amount paid and a verifiable receipt link |
| `reinkey_stream` | per second / token | Consumes a paid stream for a bounded time; pays only for what was delivered |
| `reinkey_quote` | free | USDC/XLM quote with the account's policy pre-verdict |
| `reinkey_swap` | one transaction | Trade with mandatory slippage protection |
| `reinkey_budget` | free | On-chain limits, what is left today, open sessions, payments vs. chain transactions |

A policy rejection is returned as a result, not an error: `{ ok: false, code: "PER_TX_CAP_EXCEEDED", … }`. The assistant can explain it; it cannot get around it.

## Setup

Create an agent account at [reinkey.io](https://www.reinkey.io) → **Reins** → *Create your own agent account* (your wallet is the owner; the agent secret is shown once), send it some testnet USDC, and fund a fee-paying account with friendbot.

```json
{
  "mcpServers": {
    "reinkey": {
      "command": "npx",
      "args": ["tsx", "/path/to/Reinkey/packages/mcp/src/index.ts"],
      "env": {
        "REINKEY_API": "https://reinkey.onrender.com",
        "REINKEY_ACCOUNT": "C…",
        "AGENT_SECRET": "S…",
        "RELAYER_SECRET": "S…"
      }
    }
  }
}
```

Pre-release: the package is not on npm yet; run it from the monorepo (`pnpm install` at the root). `REINKEY_SESSION_DEPOSIT` sets the default session deposit in base units (default `100000` = 0.01 USDC).

## Verified

`pnpm --filter @reinkey/mcp exec tsx check.ts` starts the server from a real MCP client over stdio and, on testnet: opens a session in one transaction, makes three paid calls and a five-slice per-second stream with vouchers only, and gets `PER_TX_CAP_EXCEEDED` for a trade above the cap. 20 Sep 2026: sessions #17 (`4cac65d6…`) and #18 (`57510316…`) — 8 payments, 2 chain transactions.

## What the agent key can do

Only what the account's policy allows. The secret in this config can pay the allowed payees within the caps and trade the allowed pairs; it cannot move funds anywhere else, raise its own limits, or unfreeze the account. Those belong to the owner wallet.
