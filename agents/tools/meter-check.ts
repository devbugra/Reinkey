/**
 * DIŞ SATICI DOĞRULAMASI: @reinkey/meter, facilitator'ın kendisi değil, ayrı bir
 * sunucuda çalışırken gerçekten ödeme alabiliyor mu?
 *
 *   1. Bu süreçte düz node:http ile ücretli bir uç açılır (rk.meter, payTo = demo satıcı;
 *      demo hesabının politikası yalnızca ona kanal açmaya izin verir).
 *   2. Demo hesabı ZİNCİRDE bu satıcıya küçük bir kanal açar (0.01 USDC).
 *   3. Üç kez x402Fetch ile ödenir: 402 → kupon → 200, makbuz PAYMENT-RESPONSE'ta.
 *   4. Bozuk imza facilitator'dan geçmemeli (402 VOUCHER_BAD_SIGNATURE).
 *   5. Kaynak Bazaar kataloğuna girmiş olmalı (payments >= 3).
 *   6. Saniye başı akış: dış sunucu rk.stream() ile satar, SDK streamPaid ile alır;
 *      facilitator'ı 402'deki extra.facilitator'dan öğrenir, dilim başına kupon gönderir.
 *
 * Gerçek testnet işlemi yapar (kanal açılışı) ve test ucu Bazaar kataloğuna girer; demo
 * kataloğunu temiz tutmak için sonradan silinebilir:
 *   DELETE FROM "Resource" WHERE url LIKE 'http://127.0.0.1:%';
 * Çalıştırma: pnpm --filter @reinkey/agents exec tsx tools/meter-check.ts
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { reinkey } from "../../packages/meter/src/index.ts";
import { ChannelSigner, streamPaid, x402Fetch } from "../../packages/sdk/src/x402.ts";
import { API, apiHealth, bad, good, info, makeAccount, requirementsFor, step, tx, usdc } from "../common.ts";

const DEPOSIT = BigInt(process.env.DEPOSIT ?? 100_000); // 0.01 USDC
const PRICE = 5_000n;
const TICK_PRICE = 1_000n; // 0.0001 USDC / saniye
const TICK_SECONDS = 5;
let failures = 0;
const check = (ok: boolean, msg: string) => (ok ? good(msg) : (failures++, bad(msg)));

const health = await apiHealth();
if (!health?.ok || health.chainMode !== "stellar") throw new Error(`facilitator hazır değil: ${API}`);
const demo = await requirementsFor(`${API}/demo/book`);
if (!demo) throw new Error("demo satıcı 402 dönmedi");

/* 1 ---------------------------------------------------------- satıcı */
step("Dış satıcı: @reinkey/meter ile ücretli uç");
// publicUrl verilmez: paket kaynağın adresini isteğin Host başlığından türetir (dış satıcının varsayılanı).
const rk = await reinkey({ facilitator: API, payTo: demo.payTo });
const paid = rk.meter({ price: PRICE, unit: "request", description: "External seller check" });
const paidStream = rk.meter({ price: TICK_PRICE, unit: "second", sliceSeconds: 1, description: "External ticker" });
const server = createServer((req, res) => {
  if (req.url?.startsWith("/ticker")) {
    void paidStream(req as never, res as never, async () => {
      const s = await rk.stream(req as never, res as never, { price: TICK_PRICE, unit: "second", sliceSeconds: 1 });
      let i = 0;
      while (i < TICK_SECONDS && (await s.next())) {
        s.send("tick", { pair: "XLM_USDC", price: "0.1335", index: i++ });
        await new Promise((r) => setTimeout(r, 200)); // testte "saniye" 200 ms
      }
      await s.end();
    });
    return;
  }
  if (req.url?.startsWith("/quote")) {
    void paid(req as never, res as never, () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ pair: "XLM_USDC", quote: "0.1335", paidBy: (req as { payment?: unknown }).payment }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
const url = `http://127.0.0.1:${port}/quote`;
info("uç", url);
info("facilitator", rk.facilitator);
info("payTo", `${demo.payTo.slice(0, 6)}… (demo satıcı; politika yalnızca ona izin veriyor)`);

const first = await fetch(url);
const body402 = (await first.json()) as { error?: string; accepts?: { scheme: string; payTo: string; amount: string }[]; extensions?: { bazaar?: unknown } };
check(first.status === 402 && body402.error === "PAYMENT_REQUIRED", `ödemesiz istek: ${first.status} ${body402.error}`);
check(body402.accepts?.[0]?.payTo === demo.payTo && body402.accepts?.[0]?.amount === PRICE.toString(), "402 şartları: payTo ve fiyat doğru");
check(!!body402.extensions?.bazaar, "402'de extensions.bazaar var");

/* 2 ---------------------------------------------------------- kanal */
step("Demo hesabı bu satıcıya zincirde kanal açıyor");
const { account, deployment } = await makeAccount();
const voucherSecret = randomBytes(32);
const opened = await account.openChannel({ payee: demo.payTo, deposit: DEPOSIT, voucherSecret, ttlLedgers: 720 });
good(`kanal #${opened.channelId} açıldı · depozito ${usdc(DEPOSIT)} USDC · ${tx(opened.tx)}`);
const signer = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: demo.channelContract,
  channelId: opened.channelId,
  secret: voucherSecret,
  deposit: DEPOSIT,
});

/* 3 ---------------------------------------------------------- ödeme */
step("Üç ücretli çağrı (dış sunucu → facilitator /verify)");
for (let i = 1; i <= 3; i++) {
  const { res, receipt } = await x402Fetch(url, { signer, network: demo.network });
  const data = (await res.json().catch(() => ({}))) as { quote?: string };
  check(
    res.status === 200 && !!receipt && BigInt(receipt.accepted) === PRICE * BigInt(i) && data.quote === "0.1335",
    `çağrı ${i}: ${res.status} · kabul edilen kümülatif ${receipt ? usdc(receipt.accepted, 4) : "-"} USDC · yanıt geldi`,
  );
}

/* 4 ---------------------------------------------------------- red */
step("Bozuk imza facilitator'dan geçmemeli");
{
  // Ayrı bir imzalayıcı: reddedilecek kupon ana imzalayıcının kümülatifini ilerletmesin.
  const rogue = new ChannelSigner({ ...signer.opts, claimed: signer.current });
  const goodPayload = rogue.next(PRICE);
  const res = await fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": Buffer.from(
        JSON.stringify({ x402Version: 2, scheme: "channel", network: demo.network, payload: { ...goodPayload, signature: "00".repeat(64) } }),
      ).toString("base64"),
    },
  });
  const body = (await res.json()) as { error?: string; source?: string };
  check(res.status === 402 && body.error === "VOUCHER_BAD_SIGNATURE", `bozuk imza: ${res.status} ${body.error} (${body.source})`);
}

/* 5 ---------------------------------------------------------- Bazaar */
step("Bazaar kataloğu");
const cat = (await (await fetch(`${API}/discovery/resources?payTo=${demo.payTo}&limit=50`)).json()) as {
  items: { resource: string; metadata: { payments: number } }[];
};
const mine = cat.items.find((i) => i.resource === url);
check(!!mine && mine.metadata.payments >= 3, mine ? `kaynak katalogda · ${mine.metadata.payments} ödeme` : "kaynak katalogda yok");

/* 6 ---------------------------------------------------------- akış */
step("Saniye başı akış: dış satıcı rk.stream() ile satıyor");
{
  const before = signer.current;
  const r = await streamPaid({
    url: `http://127.0.0.1:${port}/ticker`,
    signer,
    network: demo.network,
    // apiUrl verilmiyor: 402'deki extra.facilitator kullanılmalı
  });
  const charged = signer.current - before;
  check(r.endedWith === "done" && r.events === TICK_SECONDS, `akış: ${r.endedWith} · ${r.events} tik · kod ${r.code ?? "-"}`);
  check(r.vouchers === TICK_SECONDS, `kupon sayısı ${r.vouchers} (beklenen ${TICK_SECONDS}: her saniye bir dilim)`);
  check(charged === TICK_PRICE * BigInt(TICK_SECONDS), `ödenen ${usdc(charged, 4)} USDC (beklenen ${usdc(TICK_PRICE * BigInt(TICK_SECONDS), 4)})`);

  const ev = (await (await fetch(`${API}/accounts/${deployment.demoAccountId}/ledger?limit=20`)).json()) as {
    events: { type: string; resource?: string; reason?: string; seconds?: number; charged?: string }[];
  };
  const ended = ev.events.find((e) => e.type === "stream.ended" && e.resource?.endsWith("/ticker"));
  check(
    !!ended && ended.reason === "done" && ended.seconds === TICK_SECONDS && ended.charged === (TICK_PRICE * BigInt(TICK_SECONDS)).toString(),
    ended ? `defterde stream.ended: ${ended.reason} · ${ended.seconds} sn · ${usdc(ended.charged ?? "0", 4)} USDC` : "defterde stream.ended yok",
  );
}

server.close();
console.log(failures === 0 ? "\n✓ dış satıcı yolu çalışıyor" : `\n✗ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
