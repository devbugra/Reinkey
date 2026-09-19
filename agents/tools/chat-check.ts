/**
 * /demo/chat GERÇEK LLM DOĞRULAMASI: backend CHAT_MODE=llm iken yanıt modelden mi geliyor,
 * token başına ödeme dilim dilim akıyor mu?
 *
 * Yedek mod (fallback) hazır metni döndürür; LLM hatasında da sessizce ona düşer. Bu yüzden
 * modele ayırt edici bir cevap istenir ve yanıt hazır metnin başlangıcıyla karşılaştırılır.
 * Gerçek testnet işlemi yapar (kanal açılışı, 0.02 USDC). Çalıştırma:
 *   pnpm --filter @reinkey/agents exec tsx tools/chat-check.ts
 */
import { randomBytes } from "node:crypto";
import { FALLBACK_TEXT } from "../../backend/src/demo/fallback-text.ts";
import { ChannelSigner, streamPaid } from "../../packages/sdk/src/x402.ts";
import { API, apiHealth, bad, good, info, makeAccount, requirementsFor, step, tx, usdc } from "../common.ts";

const DEPOSIT = 200_000n; // 0.02 USDC: 800 token × 0.00002 = 0.016 için yeter
let failures = 0;
const check = (ok: boolean, msg: string) => (ok ? good(msg) : (failures++, bad(msg)));

const health = await apiHealth();
if (!health?.ok) throw new Error(`facilitator hazır değil: ${API}`);
const chat = await requirementsFor(`${API}/demo/chat`);
if (!chat) throw new Error("/demo/chat 402 dönmedi");
info("fiyat", `${usdc(chat.amount, 6)} USDC / token`);

step("Kanal");
const { account, deployment } = await makeAccount();
const voucherSecret = randomBytes(32);
const opened = await account.openChannel({ payee: chat.payTo, deposit: DEPOSIT, voucherSecret, ttlLedgers: 720 });
good(`kanal #${opened.channelId} · ${usdc(DEPOSIT)} USDC · ${tx(opened.tx)}`);
const signer = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: chat.channelContract,
  channelId: opened.channelId,
  secret: voucherSecret,
  deposit: DEPOSIT,
});

step("Token başına ödemeli sohbet (LLM)");
const marker = `RK-${randomBytes(3).toString("hex").toUpperCase()}`;
let text = "";
let notice: string | null = null;
let mode: string | undefined;
const t0 = Date.now();
const r = await streamPaid({
  url: `${API}/demo/chat`,
  method: "POST",
  body: { prompt: `Reply with the exact code ${marker} first, then one sentence about why payment channels suit AI agents. Under 60 words.` },
  signer,
  network: chat.network,
  onEvent: (e) => {
    if (e.type === "token") text += e.data.text;
    if (e.type === "session") mode = String((e.data as { mode?: string }).mode ?? "");
    if ((e as { type: string }).type === "notice") notice = String((e as { data: { code?: string } }).data.code ?? "notice");
  },
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);
info("süre", `${secs} sn`);
info("yanıt", text.trim().slice(0, 160).replace(/\s+/g, " "));
check(r.endedWith === "done", `akış: ${r.endedWith}${r.code ? ` (${r.code})` : ""} · ${r.events} token · ${r.vouchers} kupon · ${usdc(r.charged, 5)} USDC`);
info("mod", `${mode ?? "?"}${notice ? ` · notice: ${notice}` : ""}`);
check(mode === "llm", `backend LLM modunda (session.mode = ${mode})`);
check(notice === null, notice ? `backend yedeğe düştü: ${notice}` : "yedeğe düşme uyarısı yok");
check(text.includes(marker), `yanıt modelden geldi (işaret ${marker} var)`);
check(!text.startsWith(FALLBACK_TEXT.slice(0, 40)), "yanıt hazır (fallback) metin değil");
check(r.vouchers >= 2 && r.charged === BigInt(r.vouchers) * chat.amount * 50n, `ödeme dilim dilim: ${r.vouchers} kupon × 50 token`);

console.log(failures === 0 ? "\n✓ /demo/chat gerçek LLM ile çalışıyor" : `\n✗ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
