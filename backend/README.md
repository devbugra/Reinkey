# Reinkey backend (Hat 2)

Stellar üzerinde **sayaçlı x402** için facilitator + demo satıcı. Tek NestJS süreci:

| Modül | Ne yapar |
|---|---|
| `channel/` | Kupon doğrulama (`voucher.ts`), kanal önbelleği, `ChannelVerifier`, otomatik `claim`, zincir olay izleyicisi |
| `x402/` | Framework'ten bağımsız `meter()` middleware'i, `/supported` `/verify` `/settle`, `exact` (henüz kapalı) |
| `demo/` | `GET /demo/book` (çağrı başına), `POST /demo/chat` (token başına, dilimli SSE) |
| `audit/` | Postgres olay defteri, `GET /events` (SSE), `GET /stats`, `POST /v1/report` |
| `chain/` | `ChainPort`: `MockChain` (bellek içi) ya da `StellarChain` (testnet) |
| `discovery/` | `/llms.txt`, `/openapi.json` + `/docs`, `POST /mcp` |
| `dev/` | Yalnızca `CHAIN_MODE=mock`: sahte kanal/hesap/red uçları |

## Çalıştırma (mock mod)

Gerekenler: Node 24, yerel PostgreSQL.

```bash
cp .env.example .env            # DATABASE_URL'i kendi Postgres'inize göre düzenleyin
npm install
npx prisma migrate deploy       # tabloları oluşturur (Channel, Event)
npm run start:dev               # http://localhost:3000
```

Kontrol:

```bash
curl localhost:3000/health      # {"ok":true,"chainMode":"mock","latestLedger":...,"db":true}
curl -N localhost:3000/events   # canlı olay akışı (ayrı terminalde açık bırakın)
npm run mock-agent -- --claim   # kanal aç → 100 × /demo/book → /demo/chat akışı → claim
curl localhost:3000/stats
```

`mock-agent` seçenekleri: `--url`, `--calls 100`, `--deposit 570000` (varsayılan değer, akışı
350. token'da `CHANNEL_EXHAUSTED` ile keser), `--no-chat`, `--claim`.

## Panel ekibi için

- Olay akışı: `GET /events` (SSE). Açılışta son 200 olay, sonra canlı. Filtre: `?account=`, `?channelId=`.
  Olay adı = `type`; `data` her zaman `id`, `type`, `source`, `ts` içerir. Tipler BACKEND.md §8.2.
- Sayaçlar: `GET /stats`. Kanal: `GET /channels/:id`. Hesap: `GET /accounts/:addr`, `GET /accounts/:addr/ledger?cursor=`.
- Mock veriyle besleme:
  - `POST /dev/accounts` `{}` → sahte Reinkey Account (C-adresi)
  - `POST /dev/channels` `{ payer, deposit, voucherKey, expiryInLedgers? }` → kanal + `channel.opened`
  - `POST /dev/channels/:id/top-up` `{ amount }`, `POST /dev/channels/:id/close`
  - `POST /dev/reject` `{ account, code: "DAILY_CAP_EXCEEDED" }` → `chain.rejected`
  - `POST /dev/claim-now` → tahsilat turunu hemen çalıştır

## Birimler

Tutarlar USDC taban birimi (7 ondalık), JSON'da **string**. Kodda her yerde `bigint`.

## Testler

```bash
npm test      # Vitest: §3.2 test vektörü, tüm red kodları, yarış durumu, claim
```

Jest yerine Vitest kullanılıyor: `@stellar/stellar-sdk` ESM-only bağımlılıklar içeriyor,
Jest bunları Node 24.9 öncesinde yükleyemiyor.

## Gerçek zincir (`CHAIN_MODE=stellar`)

`.env` içinde `CHANNEL_CONTRACT_ID`, `USDC_CONTRACT_ID`, `FACILITATOR_SECRET` (claim ücretini öder),
`SELLER_PAY_TO` doldurulmalı. `/dev/*` uçları bu modda yüklenmez. Ayrıntılar ve açık noktalar:
`NOTES-FOR-HAT1.md`.
