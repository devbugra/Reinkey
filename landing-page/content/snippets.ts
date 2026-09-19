/**
 * Ürün sayfalarındaki kod örnekleri. Dil bağımsızdır (kod çevrilmez) ve paketlerin
 * GERÇEK arayüzüyle birebirdir: `packages/meter` ve `packages/sdk`. Arayüz
 * değişirse önce burası güncellenir; belgeler (`app/(docs)`) aynı örnekleri kullanır.
 */
import { env } from "@/lib/env";

export const snippets = {
  meterInstall: "npm i @reinkey/meter",
  meter: `import express from "express";
import { reinkey } from "@reinkey/meter";

const rk = await reinkey({
  facilitator: "${env.apiUrl}",
  payTo: "G…YOUR_STELLAR_ADDRESS",
});

const app = express();

// 0.0005 USDC per call. No plans, no invoices, no API keys.
app.get(
  "/book",
  rk.meter({ price: 5000n, unit: "request", description: "Order book" }),
  (req, res) => res.json(orderBook()),
);`,
  meter402: `HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6Mi…

{
  "x402Version": 2,
  "error": "PAYMENT_REQUIRED",
  "accepts": [{
    "scheme": "channel",
    "network": "stellar:testnet",
    "amount": "5000",
    "unit": "request",
    "payTo": "G…YOUR_STELLAR_ADDRESS"
  }]
}`,
  reinsInstall: "npm i @reinkey/sdk",
  reins: `import { ReinkeyAccount, ChannelSigner, x402Fetch } from "@reinkey/sdk";
import { randomBytes } from "node:crypto";

// The account is a contract. Its policy (caps, payees, pairs) lives on-chain.
const account = new ReinkeyAccount({ accountId, agent, relayer, ...network });

// One transaction: lock 0.05 USDC into a channel with the seller.
const voucherSecret = randomBytes(32);
const { channelId } = await account.openChannel({
  payee, deposit: 500_000n, voucherSecret,
});

// Every call after that is a signed voucher. No chain, ~1 ms.
const signer = new ChannelSigner({ channelId, secret: voucherSecret, ...channel });
const { res } = await x402Fetch("${env.apiUrl}/demo/book", { signer, network });`,
  reinsReject: `// A stolen agent key tries to send funds to its own wallet.
await account.transfer(attacker, 1_000_000n);

// SorobanCallError: PAYEE_NOT_ALLOWED
// Rejected by __check_auth on Stellar, not by a server.`,
} as const;
