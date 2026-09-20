/**
 * KATMAN 3 DOĞRULAMASI: "herhangi bir varlıkla öde". Ajan kanalı USDC'siyle değil
 * XLM'iyle açar: gereken XLM DEX'te USDC'ye çevrilir, sonra depozito kilitlenir;
 * satıcı USDC alır. Ardından bir ücretli çağrı yapılır.
 *
 * Gerçek testnet işlemi yapar (takas + kanal açılışı, 0.01 USDC'lik depozito).
 * Çalıştırma: pnpm --filter @reinkey/agents exec tsx tools/paywith-check.ts
 */
import { randomBytes } from "node:crypto";
import { ChannelSigner, x402Fetch } from "../../packages/sdk/src/x402.ts";
import { API, apiHealth, bad, good, info, makeAccount, report, requirementsFor, step, tx, usdc } from "../common.ts";

const DEPOSIT = 100_000n; // 0.01 USDC
let failures = 0;
const check = (ok: boolean, msg: string) => (ok ? good(msg) : (failures++, bad(msg)));

const health = await apiHealth();
if (!health?.ok || health.chainMode !== "stellar") throw new Error(`facilitator hazır değil: ${API}`);
const book = await requirementsFor(`${API}/demo/book`);
if (!book) throw new Error("/demo/book 402 dönmedi");

const { account, deployment } = await makeAccount();
const xlm = deployment.xlmContractId!;

step("Fiyat: depozito için kaç XLM gerekiyor");
const usdcBefore = await account.usdcBalance();
const quoted = await account.quoteIn(DEPOSIT, [xlm, deployment.usdcContractId]);
info("depozito", `${usdc(DEPOSIT)} USDC`);
info("gereken XLM", `${usdc(quoted, 7)} (havuz ücreti dahil)`);

step("XLM ile kanal aç (takas + açılış)");
const voucherSecret = randomBytes(32);
const r = await account.openChannelWith({ payee: book.payTo, deposit: DEPOSIT, voucherSecret, payWith: "XLM", ttlLedgers: 720 });
good(`takas: ${usdc(r.swap.sold, 7)} XLM → ${usdc(r.swap.bought, 7)} USDC · ${tx(r.swap.tx)}`);
good(`kanal #${r.channelId} açıldı · ${tx(r.tx)}`);
check(r.swap.bought >= DEPOSIT, `takas depozitoyu karşıladı (${usdc(r.swap.bought, 7)} ≥ ${usdc(DEPOSIT, 7)})`);
const usdcAfter = await account.usdcBalance();
check(
  usdcAfter === usdcBefore + r.swap.bought - DEPOSIT,
  `USDC bakiyesi yalnızca artan kadar değişti: ${usdc(usdcBefore)} → ${usdc(usdcAfter)} (artan ${usdc(r.swap.bought - DEPOSIT, 7)})`,
);
// Takası panele bildir (zincirden doğrulanır, dex.swapped olur).
await report({
  account: deployment.demoAccountId,
  tx: r.swap.tx,
  kind: "swap",
  details: { sold: r.swap.sold.toString(), soldAsset: "XLM", bought: r.swap.bought.toString(), boughtAsset: "USDC" },
});

step("XLM'le açılan kanaldan USDC ile ödeme");
const signer = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: book.channelContract,
  channelId: r.channelId,
  secret: voucherSecret,
  deposit: DEPOSIT,
});
const { res, receipt } = await x402Fetch(`${API}/demo/book?pair=USDC_XLM`, { signer, network: book.network });
check(res.status === 200 && !!receipt, `ücretli çağrı: ${res.status} · kabul edilen ${receipt ? usdc(receipt.accepted) : "-"} USDC`);

console.log(failures === 0 ? "\n✓ XLM ile ödeme çalışıyor" : `\n✗ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
