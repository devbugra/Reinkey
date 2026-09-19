/**
 * DEMO AJANI — işlem ajanı (proje-tanimi.md §10 adım 2–9).
 *
 * Senaryo: ajan kanal açar, borsanın emir defterini çağrı başına ve canlı fiyat
 * akışını saniye başı satın alır, sinyal görünce DEX'te işlem yapar, tavanı aşan
 * işlemi zincir reddeder, depozito bitince akış kesilir.
 *
 * Ajanın hiçbir yerde hesabı yok: ne kayıt, ne API anahtarı. Yalnızca zincirdeki
 * Reinkey Account'u ve onun ajan anahtarı var.
 *
 * Backend `CHAIN_MODE=mock` ile çalışıyorsa kanal zincirde değil backend'in
 * defterinde açılır (ekranda böyle etiketlenir); `stellar` modunda gerçek
 * kanal açılır ve tüm işlemler testnet'e gider.
 */
import { randomBytes } from "node:crypto";
import pc from "picocolors";
import { voucherPublicKey } from "../packages/core/src/index.ts";
import { ChannelSigner, streamPaid, x402Fetch } from "../packages/sdk/src/x402.ts";
import {
  API,
  apiHealth,
  banner,
  chain,
  expectRejection,
  good,
  info,
  makeAccount,
  note,
  report,
  requirementsFor,
  step,
  tx,
  usdc,
} from "./common.ts";

const DEPOSIT = BigInt(process.env.DEPOSIT ?? 500_000); // 0.05 USDC
const BOOK_CALLS = Number(process.env.BOOK_CALLS ?? 8);
const SWAP_IN = BigInt(process.env.SWAP_IN ?? 5_000_000); // 0.5 USDC
const OVER_CAP = BigInt(process.env.OVER_CAP ?? 20_000_000); // 2 USDC: tek işlem tavanı üstü

const health = await apiHealth();
if (!health) {
  console.error(pc.red(`Backend'e ulaşılamıyor: ${API}. Önce backend'i çalıştırın.`));
  process.exit(1);
}

const { account, deployment } = await makeAccount();
banner("REINKEY · işlem ajanı", `${API} · zincir modu: ${health.chainMode}`);

/* 1 ------------------------------------------------------------- yetki */
step("Yetki: ajanın zincirdeki hesabı ve politikası");
const policy = await account.getPolicy();
const spent0 = await account.getSpent();
info("hesap", deployment.demoAccountId);
info("günlük tavan", `${usdc(policy.dailyCap)} USDC (bugün harcanan: ${usdc(spent0.amount)})`);
info("tek işlem tavanı", `${usdc(policy.perTxCap)} USDC`);
info("izinli alıcılar", policy.payees.map((p) => `${p.slice(0, 6)}…`).join(", "));
info("bakiye", `${usdc(await account.usdcBalance())} USDC`);
note("Kayıt yok, API anahtarı yok: kimlik hesabın kendisi.");

/* 2 ------------------------------------------------------------- kanal */
step("Kanal: tek zincir işlemiyle depozito kilitlenir");
const book = await requirementsFor(`${API}/demo/book`);
if (!book) throw new Error("/demo/book 402 dönmedi; satıcı ücretli değil?");
info("fiyat", `${usdc(book.amount, 6)} USDC / ${book.unit}`);

const voucherSecret = randomBytes(32);
let channelId: bigint;

if (health.chainMode === "stellar") {
  const opened = await account.openChannel({
    payee: book.payTo,
    deposit: DEPOSIT,
    voucherSecret,
    ttlLedgers: 720,
  });
  channelId = opened.channelId;
  chain(`kanal #${channelId} açıldı · depozito ${usdc(DEPOSIT)} USDC`);
  note(`   ${tx(opened.tx)}`);
} else {
  const res = await fetch(`${API}/dev/channels`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payer: deployment.demoAccountId,
      deposit: DEPOSIT.toString(),
      voucherKey: Buffer.from(voucherPublicKey(voucherSecret)).toString("hex"),
      expiryInLedgers: 720,
    }),
  });
  if (!res.ok) throw new Error(`/dev/channels başarısız: ${res.status} ${await res.text()}`);
  const ch = (await res.json()) as { id?: string; channelId?: string };
  channelId = BigInt(ch.id ?? ch.channelId ?? 0);
  good(`kanal #${channelId} açıldı (backend mock defteri) · depozito ${usdc(DEPOSIT)} USDC`);
}

const signer = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: book.channelContract,
  channelId,
  secret: voucherSecret,
  deposit: DEPOSIT,
});

/* 3 --------------------------------------------------- çağrı başına veri */
step(`Emir defteri: ${BOOK_CALLS} çağrı, her biri bir kupon (zincire gidilmez)`);
const t0 = Date.now();
for (let i = 0; i < BOOK_CALLS; i++) {
  const { res, receipt } = await x402Fetch(`${API}/demo/book?pair=USDC_XLM`, {
    signer,
    network: book.network,
  });
  if (res.status !== 200) throw new Error(`çağrı reddedildi: ${res.status} ${await res.text()}`);
  if (i === 0 || i === BOOK_CALLS - 1) {
    good(`çağrı ${i + 1}: ${res.status} · toplam ödenen ${usdc(BigInt(receipt?.accepted ?? "0"), 6)} USDC`);
  }
}
info("süre", `${Date.now() - t0} ms · ${BOOK_CALLS} ödeme · 0 zincir işlemi`);

/* 4 ------------------------------------------------- saniye başı fiyat akışı */
step("Canlı fiyat akışı: saniye başına ödeme");
const tickerUrl = `${API}/demo/ticker/stream`;
const ticker = await requirementsFor(tickerUrl);
let swapDone = false;

if (!ticker) {
  note("Saniye başı akış ucu henüz yayında değil (Hat 2 yazıyor); bu adım atlandı.");
} else {
  info("fiyat", `${usdc(ticker.amount, 7)} USDC / saniye · dilim ${ticker.sliceSeconds || "?"} sn`);
  let ticks = 0;
  let slices = 0;
  const result = await streamPaid({
    url: tickerUrl,
    apiUrl: API,
    signer,
    network: ticker.network,
    onEvent: async (e) => {
      if (e.type === "tick") {
        ticks++;
        const d = e.data as { price: string; pair: string };
        if (ticks % 5 === 1) info(`tick ${ticks}`, `${d.pair ?? "XLM_USDC"} ${d.price}`);

        /* 5 --- sinyal: DEX'te alım (yalnızca gerçek zincir modunda) */
        if (ticks === 6 && !swapDone && deployment.dexRouterId && health.chainMode === "stellar") {
          swapDone = true;
          try {
            const r = await account.swap({ amountIn: SWAP_IN, minOut: 1n });
            chain(`sinyal → DEX: ${usdc(SWAP_IN)} USDC satıldı, ${usdc(r.amounts.at(-1) ?? 0n)} XLM alındı`);
            note(`   ${tx(r.tx)}`);
            await report({
              account: deployment.demoAccountId,
              tx: r.tx,
              kind: "swap",
              details: {
                sold: SWAP_IN.toString(),
                soldAsset: "USDC",
                bought: (r.amounts.at(-1) ?? 0n).toString(),
                boughtAsset: "XLM",
              },
            });
          } catch (err) {
            bad2(err);
          }
        }
      }
      // Dilim 1 sn olabildiği için her kuponu yazmak terminali doldurur; onda biri yeter.
      if (e.type === "payment-required" && ++slices % 10 === 1) note(`   kupon ${slices} gönderiliyor…`);
    },
  });
  info("akış", `${result.events} saniyelik veri · ${result.vouchers} kupon · ${usdc(result.charged, 6)} USDC`);
  if (result.endedWith === "error") {
    chain(`akış kesildi: ${pc.bold(pc.red(result.code ?? "?"))} — depozito bitti, ödeme durunca veri de durdu`);
  }
}

function bad2(err: unknown) {
  console.log(`   ${pc.red("✗")} swap: ${(err as Error).message.slice(0, 200)}`);
}

/* 6 ---------------------------------------------------- zincirden red: tavan */
step("Tavanı aşan işlem: red zincirden gelir");
if (health.chainMode === "stellar") {
  if (deployment.dexRouterId) {
    await expectRejection(
      `${usdc(OVER_CAP)} USDC'lik DEX işlemi`,
      () => account.swap({ amountIn: OVER_CAP, minOut: 1n, probeAmountIn: 1_000_000n }),
      { account: deployment.demoAccountId },
    );
  } else {
    await expectRejection(
      `${usdc(OVER_CAP)} USDC'lik kanal açılışı`,
      () =>
        account.openChannel({
          payee: book.payTo,
          deposit: OVER_CAP,
          voucherSecret,
          probeDeposit: 1_000_000n,
        }),
      { account: deployment.demoAccountId },
    );
  }
} else {
  note("Backend mock modunda; zincir reddi için CHAIN_MODE=stellar ile çalıştırın.");
  note("Kanıt: bu senaryo testnet'te doğrulandı (tools/spike-open.ts).");
}

/* 7 ------------------------------------------------------------- özet */
step("Özet");
const spent1 = health.chainMode === "stellar" ? await account.getSpent() : spent0;
info("bugün harcanan", `${usdc(spent1.amount)} / ${usdc(policy.dailyCap)} USDC`);
info("kanal", `#${channelId} · kuponla ödenen ${usdc(signer.current, 6)} USDC`);
info("panel", "http://localhost:3002");
console.log(`\n${pc.dim("Ajan, kimseden izin almadan geldi; sınırı zincir koydu.")}\n`);
