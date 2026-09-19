# NOTES-FOR-HAT1

Hat 2 (backend) → Hat 1. Son güncelleme: 19 Eylül 2026.

## Durum

| # | İş | Durum |
|---|---|---|
| 1 | Bağımlılıklar, config, Prisma, hata filtresi, `/health` | ✅ |
| 2 | `voucher.ts` + §3.2 test vektörü | ✅ (Node crypto ve stellar-sdk imzası vektörle birebir) |
| 3 | `ChainPort` + `MockChain` + `/dev/*` | ✅ |
| 4 | `ChannelVerifier` + `meter()` + `/demo/book` + testler | ✅ mock-agent 100/100, medyan doğrulama ~0,13 ms |
| 5 | Olaylar + SSE + `/stats` | ✅ |
| 6 | `/demo/chat` dilimli akış (fallback) | ✅ 350. token'da `CHANNEL_EXHAUSTED` |
| 7 | `ClaimService` | ✅ `vouchersCovered` = 107 (100 book + 7 dilim) |
| 8 | `/llms.txt`, OpenAPI (`/openapi.json`, `/docs`), MCP | ✅ |
| 9 | `StellarChain` | ⚠️ Yazıldı, testnet'te **denenmedi**. `../deployments/testnet.json` bekleniyor |
| 10 | `/v1/report` | ✅ mock'ta; gerçek tx ile 9'dan sonra denenecek |
| 11 | `exact` | ⏸ Kapalı: `PAYMENT_MALFORMED` "exact henüz etkin değil"; 402 yalnızca `channel` ilan ediyor |
| 12 | `llm` modu | ✅ yazıldı (`CHAT_MODE=llm` + `ANTHROPIC_API_KEY`); hata olursa fallback'e düşüyor |

## Kontratla uyumsuzluklar / sorular

`contracts/channel/src/lib.rs` okundu:

1. **`close(id, caller)`**: BACKEND.md `close(id)` diyor, kontrat `caller: Address` alıyor. Backend `close` çağırmıyor, sorun yok; SDK için not.
2. **Hata 27 `InvalidArgument`**: kontratta var, BACKEND.md tablosunda yok. `reason-codes.ts`'e `INVALID_ARGUMENT` olarak ekledim.
3. **Olay verileri** (`data_format = "map"`): `claimed` → `{amount, cumulative}`, `closed` → `{refunded, claimed}`, `opened` `voucher_key` içermiyor. Backend `opened` olayında kanalı `get(id)` ile okuyor.
4. **`reinkey-account` kontratı boş.** `StellarChain.getAccount` şu adları varsayıyor: `get_policy() -> { agent_key, per_tx_cap, daily_cap, payees, channel, expires_ledger }`, `get_spent() -> (u32, i128)`, `is_frozen() -> bool`. Alan adları farklı olursa haber verin.
5. Kanal kimlikleri 1'den başlıyor (`NextId` varsayılanı 1).

## Verilen kararlar

- **x402 başlıkları** `@x402/core` 2.26.0'dan doğrulandı: v2 `PAYMENT-SIGNATURE` / `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE`, v1 `X-PAYMENT` / `X-PAYMENT-RESPONSE`. İkisi de kabul ediliyor. v2 `PaymentPayload` biçimi (`accepted: {scheme, network}`) de kabul ediliyor.
- **Atomik kabul (§5.2 adım 9):** SQL `UPDATE … WHERE last_accepted < $new` yerine, bellek içi karşılaştır-ve-yaz. Aralarında `await` yok ve tek süreç var, o yüzden atomik; yarış testi geçiyor. Kanal durumu Postgres'e 250 ms'de bir toplu yazılıyor. Sonuç: sıcak yolda DB yok, <1 ms. Risk: çökmeden önceki son 250 ms'lik `lastAccepted` kaybolabilir. En kötü durumda bir çağrı bedava sunulur, çifte ödeme olmaz.
- **`/verify` kuponu kabul eder** (`lastAccepted` ilerler). `/settle` yalnızca kabul edilmiş kuponu onaylar; zincire gönderimi claim zamanlayıcısı yapar.
- **`/demo/chat` 402'si:** `amount` token başı fiyat, `extra.sliceTokens` ve `extra.sliceAmount` (= 50 × 200) ek alanlar. İlk kupon `sliceAmount` kadar artmalı.
- **`chainTxCount`:** `channel.opened/topped_up/claimed/closed` ve `payment.exact` sayılıyor.
- **Kendi claim'lerimiz** zincirden geri gelen `claimed` olayında tekrar yayınlanmıyor (tx hash ile ayıklanıyor). Başkasının claim'i `vouchersCovered: 0` ile yayınlanıyor.
- **Mock modda** DB'deki kanallar açılışta `MockChain`'e geri yükleniyor, kimlikler çakışmıyor.
- **`minDeposit`** = 1000 × kitap fiyatı = 5 000 000 (0,5 USDC).
- **Rate limit:** kanal başına dakikada `RATE_LIMIT_PER_MINUTE` (varsayılan 1200; 0 = kapalı).

## BACKEND.md dışı değişiklikler (kullanıcı kararı / ortam)

- **Postgres:** Docker Compose yerine kullanıcının yerel Postgres'i, `mandate_db` veritabanı (kullanıcı talebi). `docker-compose.yml` yazılmadı.
- **Prisma 6** sabitlendi (Prisma 7 driver adapter ve `prisma.config.ts` istiyor).
- **Vitest** (Jest değil): stellar-sdk 17 ESM-only bağımlılıklar içeriyor.
- **Nest paketleri:** `@nestjs/swagger@11`, `@nestjs/config@4`, `@nestjs/schedule@6` (Nest 11 ile uyumlu olanlar).
- Belge çelişkisi: BACKEND.md `../proje-tanimi.md` (Reinkey) ve panel için `app.arguspay/` diyor. `proje-tanimi.v2.md` "Mandate" adını, disk ise `app.mandate/` klasörünü kullanıyor. Backend BACKEND.md'ye göre yazıldı (`reinkey:voucher:v1`, `reinkey_*` MCP araçları).

## SDK için (Hat 1)

- Ağ → passphrase eşlemesi SDK'da olmalı; 402 yanıtında yalnızca `network: "stellar:testnet"` var.
- Akışlı uç: `payment-required` olayında `requiredCumulative` imzalanıp 10 sn içinde `POST /channels/:id/voucher` `{streamId, cumulative, signature}` gönderilmeli. Referans istemci: `scripts/mock-agent.ts`.
