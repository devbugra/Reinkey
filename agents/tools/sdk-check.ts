/**
 * SDK'yı çalışan backend'e karşı doğrular (zincire gitmez; backend mock modunda
 * kendi kanal defterini tutar). Kontrol edilenler:
 *   1. 402 → kupon → 200 akışı ve makbuz
 *   2. kümülatif sayaç: art arda çağrılarda tutar artıyor mu
 *   3. facilitator gerçekten imza doğruluyor mu (bozuk imza reddedilmeli)
 *   4. dilimli ücretli akış (varsa /demo/ticker/stream, yoksa /demo/chat)
 */
import { ChannelSigner, streamPaid, x402Fetch } from "../../packages/sdk/src/x402.ts";
import { bytesToHex, voucherPublicKey, type PaymentRequired, type ChannelRequirement } from "../../packages/core/src/index.ts";
import { randomBytes } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:3000";
const ok = (b: boolean, msg: string) => console.log(`${b ? "✓" : "✗"} ${msg}`);

const req402 = async (url: string): Promise<ChannelRequirement> => {
  const body = (await (await fetch(url)).json()) as PaymentRequired;
  const r = body.accepts.find((a) => a.scheme === "channel") as ChannelRequirement | undefined;
  if (!r) throw new Error("channel şeması yok");
  return r;
};

const book = await req402(`${API}/demo/book`);
console.log("402 şartları:", { amount: book.amount, unit: book.unit, contract: book.extra.channelContract });

// Kanal: backend mock modunda kendi defterini tuttuğu için /dev ile açılır.
const secret = randomBytes(32);
const deposit = 5_000_000n;
const created = await fetch(`${API}/dev/channels`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    payer: "CAGENTTESTQ7XKJ4YV2B3N6M5L4K3J2H1G0F9E8D7C6B5A4Z3Y2X1WVU",
    deposit: deposit.toString(),
    voucherKey: bytesToHex(voucherPublicKey(secret)),
    expiryInLedgers: 720,
  }),
});
const channel = (await created.json()) as { id?: string; channelId?: string };
const channelId = BigInt(channel.id ?? channel.channelId ?? 0);
ok(channelId > 0n, `kanal açıldı: #${channelId}`);

const signer = new ChannelSigner({
  networkPassphrase: "Test SDF Network ; September 2015",
  channelContract: book.extra.channelContract,
  channelId,
  secret,
  deposit,
});

// 1–2. Üç ücretli çağrı: her biri 200 dönmeli, kümülatif artmalı.
for (let i = 0; i < 3; i++) {
  const { res, receipt, paid } = await x402Fetch(`${API}/demo/book?pair=USDC_XLM`, {
    signer,
    network: book.network,
  });
  ok(
    res.status === 200 && !!receipt && BigInt(receipt.accepted) === signer.current,
    `çağrı ${i + 1}: ${res.status} · ödenen ${paid} · makbuz ${receipt?.accepted ?? "-"} · kalan ${receipt?.remaining ?? "-"}`,
  );
}

// 3. Bozuk imza reddedilmeli.
{
  const good = signer.next(BigInt(book.amount));
  const bad = { ...good, signature: "00".repeat(64) };
  const res = await fetch(`${API}/demo/book`, {
    headers: {
      "PAYMENT-SIGNATURE": Buffer.from(
        JSON.stringify({ x402Version: 2, scheme: "channel", network: book.network, payload: bad }),
      ).toString("base64"),
    },
  });
  const body = (await res.json()) as { error?: string };
  ok(res.status === 402 && body.error === "VOUCHER_BAD_SIGNATURE", `bozuk imza: ${res.status} ${body.error}`);
}

// 4. Dilimli akış.
const streamUrl = (await fetch(`${API}/demo/ticker/stream`)).status !== 404
  ? `${API}/demo/ticker/stream`
  : (await fetch(`${API}/demo/chat`, { method: "POST" })).status !== 404
    ? `${API}/demo/chat`
    : null;

if (!streamUrl) {
  console.log("⊘ akış ucu henüz yok (Hat 2 yazıyor): /demo/ticker/stream ve /demo/chat 404");
} else {
  const isChat = streamUrl.endsWith("/chat");
  let ticks = 0;
  const r = await streamPaid({
    url: streamUrl,
    apiUrl: API,
    signer,
    network: book.network,
    method: isChat ? "POST" : "GET",
    body: isChat ? { prompt: "Reinkey nedir?" } : undefined,
    onEvent: (e) => {
      if (e.type === "tick" || e.type === "token") {
        ticks++;
        if (ticks <= 3) console.log("   ", e.type, JSON.stringify(e.data).slice(0, 120));
      }
      if (e.type === "payment-required") console.log("    → yeni kupon isteniyor:", e.data.requiredCumulative);
    },
  });
  ok(r.events > 0, `akış: ${r.events} olay · ${r.vouchers} kupon · ${r.charged} taban birim · bitiş: ${r.endedWith}${r.code ? ` (${r.code})` : ""}`);
}

console.log("kanal son durum:", await (await fetch(`${API}/channels/${channelId}`)).text());
