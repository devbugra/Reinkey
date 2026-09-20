/**
 * YAN YANA: aynı N ücretli çağrı, iki şemayla.
 *
 *  - exact   : her ödeme ayrı bir zincir işlemidir. Burada N gerçek USDC transferi
 *              art arda gönderilir (hesabın politikası içinde, izinli satıcıya).
 *  - channel : tek işlemle oturum açılır, N çağrı kuponla ödenir.
 *
 * Çıktı uydurma değildir: iki tarafta da gerçek testnet işlemleri yapılır ve süreler
 * ölçülür. exact tarafı yavaş olduğu için varsayılan N küçüktür; oturum tarafında
 * aynı N'in yanında ayrıca BURST kadar çağrı yapılıp ölçek gösterilir.
 *
 * Çalıştırma: pnpm --filter @reinkey/agents exec tsx compare.ts   (N=5 BURST=100)
 */
import { randomBytes } from "node:crypto";
import { ChannelSigner, x402Fetch } from "@reinkey/sdk";
import { API, apiHealth, banner, good, info, makeAccount, note, requirementsFor, step, tx, usdc } from "./common.ts";

const N = Number(process.env.N ?? 5);
const BURST = Number(process.env.BURST ?? 100);
const url = `${API}/demo/book`;

banner("exact ↔ channel", `aynı ${N} ödeme, iki şema · ${API}`);
const health = await apiHealth();
if (!health?.ok) throw new Error(`facilitator hazır değil: ${API}`);
const req = await requirementsFor(url);
if (!req) throw new Error("ücretli uç 402 dönmedi");
const { account, deployment } = await makeAccount();

/* exact ------------------------------------------------------------ */
step(`exact: ${N} ödeme = ${N} zincir işlemi`);
const e0 = performance.now();
for (let i = 1; i <= N; i++) {
  const t0 = performance.now();
  const hash = await account.transfer(req.payTo, req.amount);
  good(`ödeme ${i}/${N} · ${((performance.now() - t0) / 1000).toFixed(1)} sn · ${tx(hash)}`);
}
const exactMs = performance.now() - e0;

/* channel ---------------------------------------------------------- */
step(`channel: 1 zincir işlemi + ${N} kupon`);
const c0 = performance.now();
const secret = randomBytes(32);
const deposit = req.amount * BigInt(N + BURST + 5);
const opened = await account.openChannel({ payee: req.payTo, deposit, voucherSecret: secret, ttlLedgers: 720 });
const openMs = performance.now() - c0;
good(`oturum #${opened.channelId} açıldı · ${(openMs / 1000).toFixed(1)} sn · ${tx(opened.tx)}`);
const signer = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: req.channelContract,
  channelId: opened.channelId,
  secret,
  deposit,
});
const p0 = performance.now();
for (let i = 0; i < N; i++) {
  const { res } = await x402Fetch(url, { signer, network: req.network });
  if (!res.ok) throw new Error(`ödeme reddedildi: ${res.status}`);
  await res.arrayBuffer();
}
const payMs = performance.now() - p0;
good(`${N} ödeme · toplam ${(payMs / 1000).toFixed(2)} sn · ödeme başına ${(payMs / N).toFixed(0)} ms (HTTP gidiş-dönüş dahil)`);

step(`channel, ölçek: aynı oturumda ${BURST} ödeme daha`);
const b0 = performance.now();
for (let i = 0; i < BURST; i++) {
  const { res } = await x402Fetch(url, { signer, network: req.network });
  if (!res.ok) throw new Error(`ödeme reddedildi: ${res.status}`);
  await res.arrayBuffer();
}
const burstMs = performance.now() - b0;
good(`${BURST} ödeme · ${(burstMs / 1000).toFixed(2)} sn · 0 yeni zincir işlemi`);

/* sonuç ------------------------------------------------------------ */
step("Sonuç");
const perExact = exactMs / N / 1000;
info("exact", `${N} ödeme → ${N} zincir işlemi · ${(exactMs / 1000).toFixed(1)} sn (ödeme başına ${perExact.toFixed(1)} sn)`);
info("channel", `${N} ödeme → 1 zincir işlemi · ${((openMs + payMs) / 1000).toFixed(1)} sn (açılış dahil)`);
info("channel ×" + (N + BURST), `${N + BURST} ödeme → 1 açılış + 1 tahsilat · ödenen ${usdc(signer.current)} USDC`);
info("exact ×" + (N + BURST), `aynı iş ≈ ${N + BURST} zincir işlemi · ≈ ${((perExact * (N + BURST)) / 60).toFixed(1)} dk (ölçülen hızla)`);
note("exact tarafı facilitator'sız, doğrudan transferle ölçüldü: gerçek exact akışı buna /verify ve /settle gidiş-dönüşünü de ekler.");
