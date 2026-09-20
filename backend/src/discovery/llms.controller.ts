import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { priceList } from './price-list';

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

> Metered x402 payments on Stellar. Open a Soroban payment channel once, then pay every
> request with an off-chain, signed, cumulative voucher that is verified in milliseconds.
> The facilitator settles the highest voucher on-chain with a single \`claim\` transaction.

Network: ${c.network} (passphrase: "${c.networkPassphrase}")
Asset: USDC SAC ${c.usdcContractId} (7 decimals; all amounts are integer base units, sent as strings)
Channel contract: ${c.channelContractId}
Seller payTo: ${c.sellerPayTo}
Facilitator: ${c.publicUrl}
Chain mode: ${c.chainMode}

## Paid resources

${prices}

Credit pool (Reinkey Float, read-only): \`GET ${c.publicUrl}/float\` returns pool size, share price,
utilization, credit lines with on-chain health, and investor positions.

Discovery (x402 Bazaar): \`GET ${c.publicUrl}/discovery/resources\` lists every resource that has
received at least one verified payment through this facilitator, with its 402 terms and
\`extensions.bazaar\` input/output metadata. Filter with \`?payTo=\`.

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

## Streaming (POST /demo/chat)

Body {"prompt":"..."}; the first voucher pays the first slice. The SSE stream emits
\`session\` {streamId}, \`token\` {text,index,paidThrough}, and \`payment-required\`
{streamId, requiredCumulative} when the paid slice runs out. Then POST
${c.publicUrl}/channels/<id>/voucher {"streamId","cumulative","signature"} within 10 s to resume.
Ends with \`done\` {tokens,charged,vouchers} or \`error\` {code}.

## Error format

{"error":"CODE","source":"gateway|facilitator|chain","message":"...","tx":"optional"}
Codes: PAYMENT_REQUIRED, PAYMENT_MALFORMED, CHANNEL_NOT_FOUND, CHANNEL_CLOSED, CHANNEL_EXPIRING,
WRONG_PAYEE, WRONG_ASSET, VOUCHER_BAD_SIGNATURE, VOUCHER_NOT_INCREASING, VOUCHER_UNDERPAID,
CHANNEL_EXHAUSTED, RATE_LIMITED.

## Other endpoints

- GET  ${c.publicUrl}/supported — supported schemes
- POST ${c.publicUrl}/verify, /settle — x402 facilitator API
- GET  ${c.publicUrl}/channels/<id> — channel state (lastAccepted, unclaimed, remaining)
- GET  ${c.publicUrl}/accounts/<addr> — account policy and open channels
- GET  ${c.publicUrl}/events — live SSE audit stream
- GET  ${c.publicUrl}/stats — counters
- GET  ${c.publicUrl}/openapi.json, ${c.publicUrl}/docs — OpenAPI
- POST ${c.publicUrl}/mcp — MCP server (streamable HTTP): reinkey_supported, reinkey_get_channel,
  reinkey_get_account, reinkey_stats, reinkey_price_list, reinkey_list_resources
`;
  }
}
