import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { priceList } from './price-list';

/**
 * Belgelerin herkese açık adresi. Sebep kodlarının tam listesi (zincir ve
 * politika kodları dahil) burada durur; llms.txt yalnızca zincir dışı olanları
 * sayar ve gerisi için buraya yollar.
 */
const DOCS = 'https://www.reinkey.com/docs';

@ApiExcludeController()
@Controller()
export class LlmsController {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  llms(): string {
    const c = this.cfg;
    const prices = priceList(c)
      .resources.map(
        (r) =>
          `- ${r.method} ${r.url} — ${r.description}. ${r.price} base units per ${r.unit}` +
          ('sliceTokens' in r
            ? ` (paid in slices of ${r.sliceTokens} tokens = ${r.sliceAmount})`
            : '') +
          `. Schemes: ${r.schemes.join(', ')}`,
      )
      .join('\n');

    return `# Reinkey

> The session layer for machine payments on Stellar. x402's \`exact\` scheme makes every payment
> its own transaction (~5 s each). Reinkey adds the x402 scheme \`channel\`: ONE transaction opens
> a session (a deposit locked in a Soroban contract), every call after that is a signed cumulative
> voucher verified off-chain in well under a millisecond, and the seller settles hundreds of
> payments with a single \`claim\`. Measured on testnet: 468 payments, 3 chain transactions.
> This is payment infrastructure, not a security product and not a simulation.

Network: ${c.network} (passphrase: "${c.networkPassphrase}")
Asset: USDC SAC ${c.usdcContractId} (7 decimals; all amounts are integer base units, sent as strings)
Channel contract: ${c.channelContractId}
Seller payTo: ${c.sellerPayTo}
Facilitator: ${c.publicUrl}
Chain mode: ${c.chainMode}
Documentation: ${DOCS}

Contract identifiers change; do not hard-code them. \`GET ${c.publicUrl}/demo/info\` returns the
network, rpcUrl, channelContract, usdc, xlm, dexRouter, dexFactory, accountWasm (the hash of the
deployed agent-account code) and the demo seller's prices. \`GET ${c.publicUrl}/health\` is the
liveness probe and is never rate-limited.

## Paid resources

${prices}

Credit pool (Reinkey Float): \`GET ${c.publicUrl}/float\` returns pool size, share price,
utilization, credit lines with on-chain health, and investor positions. The HTTP API is read-only
(everything is read by simulation); depositing and withdrawing are wallet-signed contract calls in
the console.

Discovery (x402 Bazaar): \`GET ${c.publicUrl}/discovery/resources\` lists every resource that has
received at least one verified payment through this facilitator, with its 402 terms and
\`extensions.bazaar\` input/output metadata. Filter with \`?payTo=\`. There is no registration
endpoint: a verified payment is the listing.

## Reinkey Reins: the agent's on-chain budget

The payer may be a Soroban custom account (\`reinkey-account\`) whose policy is enforced in
\`__check_auth\` on every authorization the agent signs: per-transaction cap, daily cap, allowed
payees, the one channel contract it may use, allowed DEX router/factory and \`(sell, buy)\` pairs
with MANDATORY slippage protection, and an expiry ledger. An agent that steps outside the policy
gets a failed Stellar transaction with a reason code — no server said no, the network did.

Anyone can create one with no sign-up: connect a Stellar wallet at https://www.reinkey.io ->
Reins -> "Create your own agent account". One transaction deploys the same account code with the
connected wallet as owner; the agent key is generated in the browser and shown once. Caps, payees,
expiry, exchange permission and freeze/unfreeze are then edited from the console, each write
authorized by the owner wallet and sent straight to Stellar.

\`GET ${c.publicUrl}/accounts/<C-address>\` returns owner, policy (including \`pairIds\`),
\`spentToday\`, \`frozen\`, balances and open channels. The agent key is never the transaction
source: a relayer G-account that the operator funds pays the agent's transaction fees, while the
facilitator pays for settlement.

## MCP: paid tool calls

\`@reinkey/mcp\` is a separate MCP server that gives any MCP client (Claude and others) tools that
actually pay: \`reinkey_discover\`, \`reinkey_call\`, \`reinkey_stream\`, \`reinkey_quote\`,
\`reinkey_swap\`, \`reinkey_budget\`. It opens one session per seller and pays with vouchers after
that; a policy rejection is returned as a result (\`{ ok: false, code: "PER_TX_CAP_EXCEEDED" }\`),
not an error. Pre-release, run from the monorepo: https://github.com/devbugra/Reinkey
Docs: ${DOCS}/mcp

Note: \`POST ${c.publicUrl}/mcp\` below is a different, READ-ONLY MCP endpoint on this facilitator.

## How to pay with the \`channel\` scheme

1. Call a paid resource without payment. You get HTTP 402 with a JSON body (also base64 in the
   \`PAYMENT-REQUIRED\` header). Pick the entry with \`scheme: "channel"\`.
2. Open a channel on the channel contract (\`open(payer, payee=payTo, asset, deposit, voucher_key, expiry_ledger)\`).
   \`voucher_key\` is an ed25519 public key you control. One on-chain transaction.
3. For every call send header \`PAYMENT-SIGNATURE\` (v2) or \`X-PAYMENT\` (v1) = base64(JSON):
   {"x402Version":2,"scheme":"channel","network":"${c.network}",
    "payload":{"channelId":"<u64>","cumulative":"<i128>","signature":"<128 hex>"}}
   \`cumulative\` is the TOTAL owed on this channel so far; it must grow by at least the price
   on every call and never exceed the deposit.
4. The response carries a \`PAYMENT-RESPONSE\` header: base64 JSON receipt
   {"scheme":"channel","channelId","accepted","delta","remaining","latencyMs"}.

## Voucher format (byte exact)

message = "reinkey:voucher:v1"            (18 bytes ASCII)
        || sha256(network_passphrase)     (32 bytes)
        || channel_contract_id            (32 bytes, raw decoded C-strkey)
        || channel_id                     (8 bytes, u64 big-endian)
        || cumulative                     (16 bytes, i128 big-endian, two's complement)
hash      = sha256(message)
signature = ed25519_sign(voucher_secret, hash)   (the hash itself is signed; hex encoded)

## Streaming (per token and per second)

Both streamed resources work the same way; only the unit differs.

- POST ${c.publicUrl}/demo/chat — body {"prompt":"..."}, paid per TOKEN in slices of
  ${c.chatSliceTokens} tokens.
- GET  ${c.publicUrl}/demo/ticker/stream — live XLM/USDC price, paid per SECOND in slices of
  ${c.tickerSliceSeconds} second(s). Prices come from the Soroswap pool reserves; if the pool
  cannot be read the stream ends with PRICE_SOURCE_UNAVAILABLE. There is no synthetic price.

The first voucher pays the first slice (send it with the request, as usual). The SSE stream emits
\`session\` {streamId}, then \`token\` {text,index,paidThrough} or \`tick\` {…}, and
\`payment-required\` {streamId, requiredCumulative} when the paid slice runs out. Then POST
${c.publicUrl}/channels/<id>/voucher {"streamId","cumulative","signature"} within 10 s to resume.
Ends with \`done\` {tokens|seconds,charged,vouchers} or \`error\` {code}.

Selling your own stream: the same session machinery is exposed over HTTP, so the seller does not
have to verify vouchers itself (\`@reinkey/meter\`'s \`rk.stream()\` wraps these).

- POST   ${c.publicUrl}/streams — open a session AFTER the first slice was verified:
  {channelId, payTo, resource, unit, sliceCost, initialCharge} -> {streamId, requiredCumulative,
  voucherUrl}. At most 4 open sessions per channel, 1000 in total.
- POST   ${c.publicUrl}/streams/<id>/wait — long-poll for the next voucher ({timeoutMs} <= 30000,
  default 10000) -> {kind:"paid", receipt, requiredCumulative} or kind = timeout | exhausted |
  frozen | aborted. An idle session is closed after 90 s.
- DELETE ${c.publicUrl}/streams/<id> — end it: {reason, units} -> {charged, vouchers}.

## Error format

{"error":"CODE","source":"gateway|facilitator|chain","message":"...","tx":"optional"}

\`error\` is a stable identifier; branch on it. \`message\` is informational free text (currently
written in Turkish on this facilitator) and must not be parsed.

Off-chain codes: PAYMENT_REQUIRED, PAYMENT_MALFORMED, CHANNEL_NOT_FOUND, CHANNEL_CLOSED,
CHANNEL_EXPIRING, WRONG_PAYEE, WRONG_ASSET, VOUCHER_BAD_SIGNATURE, VOUCHER_NOT_INCREASING,
VOUCHER_UNDERPAID, CHANNEL_EXHAUSTED, ACCOUNT_FROZEN, TIMEOUT, RATE_LIMITED, STREAM_NOT_FOUND,
NOT_FOUND, BAD_REQUEST, CHAIN_UNAVAILABLE, PRICE_SOURCE_UNAVAILABLE, REPORT_NOT_VERIFIED,
AGENT_BUSY, NOT_SUPPORTED, INTERNAL.

TIMEOUT and ACCOUNT_FROZEN also end a stream (as an \`error\` event, not an HTTP status).

Chain and policy codes (source: "chain") come from the contracts and are NOT listed here:
account 1-11 (BAD_SIGNATURE … CONTROLLER_MISMATCH), channel 20-27, credit pool 40-49.
The full table with meanings: ${DOCS}/reason-codes

## Other endpoints

- GET  ${c.publicUrl}/supported — supported schemes (\`exact\` is NOT enabled here; use \`channel\`)
- POST ${c.publicUrl}/verify, /settle — x402 facilitator API. For \`channel\`, /verify both
  verifies AND accepts; /settle is not needed.
- GET  ${c.publicUrl}/channels, /channels/<id> — session state (lastAccepted, unclaimed, remaining)
- POST ${c.publicUrl}/channels/<id>/claim — settle now. Permissionless; can only pay that
  channel's payee.
- GET  ${c.publicUrl}/accounts/<addr> — owner, policy, spentToday, frozen, balances, open channels
- GET  ${c.publicUrl}/accounts/<addr>/ledger — that account's events, newest first, cursor-paginated
  (?cursor=, ?limit= up to 200)
- GET  ${c.publicUrl}/receipts, /receipts/<id> — signed receipts committing to the request hash and
  the seller-attested response hash (?payee=, ?channelId=, ?limit= up to 200)
- GET  ${c.publicUrl}/receipts/<id>/verify — convenience signature check; the same verification
  runs offline with the signer's public key
- POST ${c.publicUrl}/receipts/<id>/attest — seller commits to {"responseHash":"<64 hex>"}
- GET  ${c.publicUrl}/dex/quote?side=USDC_XLM|XLM_USDC&amountIn=<base units>[&account=C…][&slippageBps=100]
  — free. Route, output, execution price, price impact in bps, suggested minOut, pool reserves and
  the exact router call to sign. With \`account\`, it also returns a POLICY PRE-VERDICT: the same
  rules \`__check_auth\` applies, evaluated before anything is signed
  ({allowed, code, message, caps}). The chain still decides; this only saves the fee of finding out.
- GET  ${c.publicUrl}/sellers/<payTo>/revenue — earned / settled / receivable, payments per
  settlement, revenue by resource, a time series (?bucket=hour|day, ?days= 1-365) and receivables
  aging. Derived from the audit ledger, so the report and the ledger cannot disagree.
- GET  ${c.publicUrl}/sellers/<payTo>/settlements.csv — one row per on-chain settlement
- GET  ${c.publicUrl}/float, /float/lines/<account>, /float/positions/<address> — credit pool (read-only)
- GET  ${c.publicUrl}/events — live SSE audit stream (last 200 events, then live; ?account= ?channelId=)
- GET  ${c.publicUrl}/stats — counters
- POST ${c.publicUrl}/v1/report — report a failed on-chain transaction; verified against the chain
  before it is published (REPORT_NOT_VERIFIED otherwise)
- GET  ${c.publicUrl}/openapi.json, ${c.publicUrl}/docs — OpenAPI
- POST ${c.publicUrl}/mcp — read-only MCP server (streamable HTTP): reinkey_supported,
  reinkey_get_channel, reinkey_get_account, reinkey_stats, reinkey_price_list,
  reinkey_list_resources. To PAY from an MCP client, use the \`@reinkey/mcp\` package above.
`;
  }
}
