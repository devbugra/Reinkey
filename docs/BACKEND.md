# BACKEND.md — Reinkey facilitator ve demo satıcı (Hat 2)

Bu dosya, `backend/` klasöründe çalışacak Claude Code içindir. Tek başına okunabilir yazıldı; ürünün tamamı için `../proje-tanimi.md` belgesine bak (özellikle 3.2, 3.3, 3.6, 4.1, 4.3 bölümleri). Bu dosya ile belge çelişirse **bu dosya geçerlidir**, çelişkiyi de raporla.

---

## 0. Bağlam (2 dakikada)

**Reinkey**, Stellar'a **sayaçlı x402** getiriyor. Bugün Stellar'da her x402 ödemesi ayrı bir zincir işlemidir ve ~5 saniye sürer. Reinkey'de akış şöyledir:

1. Ajan bir Soroban **ödeme kanalı** açar ve USDC depozito kilitler. Bu tek bir zincir işlemidir ve **senin işin değil**; ajan SDK'sı yapar.
2. Ajan her çağrıda zincir dışı, imzalı, **kümülatif** bir kupon gönderir ("bu kanaldan toplam 0,0135 USDC borçluyum"). **Sen bu kuponu milisaniyede doğrulayıp kabul edersin.**
3. Birikmiş kuponları periyodik olarak **tek bir `claim` işlemiyle** zincirde tahsil edersin.

Sonuç: 1000 ödeme, zincirde yalnızca 2 işlem.

Hackathon: Stellar Pro Hackathon, İstanbul, 19–20 Eylül 2026. **Süre çok dar.** Kusursuz değil, çalışan ve demo edilebilen bir sistem hedefleniyor.

### Senin işin (Hat 2)

`backend/` içindeki NestJS uygulaması, dört görevi olan tek bir süreç:

| Modül | Görev |
|---|---|
| **Facilitator** | x402 `channel` şeması: kupon doğrulama, kanal durum önbelleği, otomatik `claim`. Ek olarak `exact` şeması. |
| **Demo satıcı** | `meter()` ile korunan iki uç: `/demo/book` (çağrı başına), `/demo/chat` (token başına, akışlı) |
| **Denetim + olaylar** | Postgres'e her olayı yazar, `/events` üzerinden SSE ile yayınlar, `/stats` sayaçları |
| **Keşif** | `llms.txt`, OpenAPI, MCP sunucusu |

### Senin işin OLMAYANLAR

- Soroban kontratları (`contracts/`), ajan SDK'sı (`packages/`), demo ajanları (`agents/`): **Hat 1** (ana Claude) yapıyor.
- Panel (`app.mandate/`) ve landing (`landing-page/`): başka hatlar yapıyor.
- `backend/` dışında dosya **değiştirme**. Bir şeye ihtiyacın olursa `backend/NOTES-FOR-HAT1.md` dosyasına yaz.

---

## 1. Mevcut durum ve yığın

- `backend/`: boş bir NestJS 11 iskeleti (`nest new` çıktısı). Paket yöneticisi **npm**, kendi `.git`'i var ama hiç commit yok.
- Makinede kurulu: Node 24, npm 11, Docker, Postgres 18 istemcisi, stellar-cli 28.
- Ekleyeceğin bağımlılıklar:
  - `@nestjs/config`, `@nestjs/swagger`, `@nestjs/schedule`
  - `prisma` + `@prisma/client`
  - `@stellar/stellar-sdk`
  - `@modelcontextprotocol/sdk`
  - `zod` (girdi doğrulama)
  - `@anthropic-ai/sdk` (yalnızca `/demo/chat`'in gerçek LLM modu için)
  - `@x402/stellar` ve ihtiyaç duyduğu `@x402/*` paketleri (yalnızca `exact` şeması için; bkz. §7)
- Postgres: yerelde Docker Compose ile. `backend/docker-compose.yml` dosyasını sen yaz (port 5433, bilgisayardaki olası bir Postgres ile çakışmasın).
- Port: **3000**. Landing sitesi API'yi burada bekliyor. Panel 3002'de, landing 3001'de çalışıyor; ikisi için de CORS izni ver.

---

## 2. Ortam değişkenleri (`backend/.env.example` dosyasını yaz)

```bash
PORT=3000
PUBLIC_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3001,http://localhost:3002
DATABASE_URL=postgresql://reinkey:reinkey@localhost:5433/reinkey

# Zincir erişimi: "mock" (bellek içi, kontratlar hazır olmadan) | "stellar" (gerçek testnet)
CHAIN_MODE=mock
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
X402_NETWORK=stellar:testnet

# Kontrat kimlikleri: Hat 1, deploy sonrası ../deployments/testnet.json dosyasına yazar
CHANNEL_CONTRACT_ID=
USDC_CONTRACT_ID=

# Facilitator'ın G-hesabı: claim işlemlerinin kaynağı ve ücret ödeyeni
FACILITATOR_SECRET=

# Demo satıcının ödeme adresi (kanalın payee'si). G... ya da C...
SELLER_PAY_TO=

# Tahsilat politikası
CLAIM_THRESHOLD=1000000          # 0.1 USDC (taban birim, 7 ondalık)
CLAIM_INTERVAL_SECONDS=30
CLAIM_EXPIRY_MARGIN_LEDGERS=120  # süre dolmasına bu kadar ledger kala mutlaka claim et
VOUCHER_EXPIRY_SAFETY_LEDGERS=60 # süre dolmasına bundan az kalan kanalın kuponu reddedilir

# Demo fiyatları (taban birim)
PRICE_BOOK_PER_REQUEST=5000      # 0.0005 USDC
PRICE_CHAT_PER_TOKEN=200         # 0.00002 USDC
CHAT_SLICE_TOKENS=50

# /demo/chat: gerçek LLM modu için. Boşsa yedek (hazır metin) modu çalışır.
ANTHROPIC_API_KEY=
CHAT_MODEL=claude-haiku-4-5-20251001
CHAT_MODE=fallback               # fallback | llm  (sahnede varsayılan: fallback)
```

`CHAIN_MODE=mock` iken `CHANNEL_CONTRACT_ID`, `FACILITATOR_SECRET` gibi zincir değerleri boş olabilir. Uygulama yine de açılmalı.

---

## 3. Birimler ve biçimler (hatlar arası sözleşme, DEĞİŞTİRME)

- **Tutarlar:** USDC taban birimiyle (7 ondalık) tamsayı. JSON'da **string** olarak taşınır (`"135000"` = 0,0135 USDC). Kodda her yerde `bigint` kullan; `number` ve kayan nokta **yasak**.
- **Kanal kimliği:** `u64`. JSON'da string (`"42"`), kodda `bigint`.
- **Anahtar ve imzalar:** küçük harfli hex. `voucherKey` 64 karakter (32 bayt ed25519 açık anahtarı), `signature` 128 karakter (64 bayt).
- **Adresler:** Stellar strkey (`G…` hesap, `C…` kontrat).

### 3.1 Kupon mesajı (bayt bayt)

```
message = "reinkey:voucher:v1"                  (18 bayt ASCII)
       ‖ sha256(network_passphrase)            (32 bayt)
       ‖ channel_contract_id                   (32 bayt, C-strkey'in ham çözülmüş hâli)
       ‖ channel_id                            (8 bayt, u64 big-endian)
       ‖ cumulative                            (16 bayt, i128 big-endian, iki tümleyen)
hash      = sha256(message)                    (32 bayt)
signature = ed25519_sign(voucher_secret, hash) (hash'in kendisi imzalanır)
```

C-strkey'i ham 32 bayta çevirmek için: `StrKey.decodeContract(id)` (`@stellar/stellar-sdk`).

### 3.2 Test vektörü: birim testinde AYNEN kullan

Rust kontratı da aynı vektörle test ediliyor. Bu test geçmiyorsa kuponlar zincirde de geçmez.

```json
{
  "networkPassphrase": "Test SDF Network ; September 2015",
  "contractIdRawHex": "0202020202020202020202020202020202020202020202020202020202020202",
  "channelId": "42",
  "cumulative": "135000",
  "voucherSecretSeedHex": "0101010101010101010101010101010101010101010101010101010101010101",
  "expected": {
    "networkIdHex": "cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472",
    "messageHex": "7265696e6b65793a766f75636865723a7631cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd4720202020202020202020202020202020202020202020202020202020202020202000000000000002a00000000000000000000000000020f58",
    "hashHex": "09e5987e1dd2a9bc88f7547fe9b9f63f93904814dbc9a0736bc80e9e1c94fcff",
    "publicKeyHex": "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
    "signatureHex": "07d349e172fba846b558b11d69aac42df4a6acdf09ed0c63a00f3f1dc86c911cd5118cfe983abb8e41e0bdddd118f31aa70b7a0d0639246188ee312192607e0d"
  }
}
```

İmza doğrulaması için Node'un yerleşik `crypto.verify(null, hash, publicKey, sig)` fonksiyonunu ya da `Keypair.fromRawEd25519Seed` / `Keypair.verify` kullanabilirsin. Bu kodu `src/channel/voucher.ts` dosyasında **saf fonksiyonlar** olarak yaz: `encodeVoucherMessage`, `hashVoucher`, `verifyVoucher`. Hat 1 bunu daha sonra `packages/core`'a taşıyacak.

### 3.3 Sebep kodları

Her hata yanıtı şu biçimde olmalı:

```json
{ "error": "CODE", "source": "gateway|facilitator|chain", "message": "insan için kısa açıklama", "tx": "opsiyonel hash" }
```

Boş sebep yok. Zincir dışı kodlar:

```
PAYMENT_REQUIRED          402, ödeme yükü yok
PAYMENT_MALFORMED         400, yük çözülemedi / şema tanınmadı
CHANNEL_NOT_FOUND         402
CHANNEL_CLOSED            402
CHANNEL_EXPIRING          402, süre dolmasına VOUCHER_EXPIRY_SAFETY_LEDGERS'tan az kaldı
WRONG_PAYEE               402, kanalın payee'si bu satıcı değil
WRONG_ASSET               402
VOUCHER_BAD_SIGNATURE     402
VOUCHER_NOT_INCREASING    402, cumulative ≤ son kabul edilen
VOUCHER_UNDERPAID         402, artış fiyattan az
CHANNEL_EXHAUSTED         402, cumulative > deposit
RATE_LIMITED              429
```

Zincir kodları (kontratlardan gelir; `source: chain` ile raporlanır):

```
reinkey-account: 1 BAD_SIGNATURE, 2 POLICY_EXPIRED, 3 ACCOUNT_FROZEN, 4 CONTEXT_NOT_ALLOWED,
                 5 PAYEE_NOT_ALLOWED, 6 PER_TX_CAP_EXCEEDED, 7 DAILY_CAP_EXCEEDED
channel:         20 CHANNEL_NOT_FOUND, 21 CHANNEL_CLOSED, 22 VOUCHER_BAD_SIGNATURE,
                 23 VOUCHER_NOT_INCREASING, 24 EXCEEDS_DEPOSIT, 25 NOT_EXPIRED, 26 NOT_AUTHORIZED
```

Bu eşleme tablosunu `src/common/reason-codes.ts` dosyasına koy. Simülasyon ya da işlem hatasında görünen `Error(Contract, #N)` değerini bu tabloyla koda çevir.

---

## 4. Zincir erişimi: `ChainPort`

Kontratlar henüz hazır değil. Tüm zincir erişimini tek bir arayüzün arkasına koy ve **önce sahte (mock) uygulamayla** ilerle.

```ts
// src/chain/chain.port.ts
export interface ChannelState {
  id: bigint;
  payer: string;          // C… (Reinkey Account) ya da G…
  payee: string;
  asset: string;          // USDC SAC kontrat kimliği
  deposit: bigint;
  claimed: bigint;
  voucherKey: string;     // hex
  expiryLedger: number;
  open: boolean;
}

export interface AccountState {
  address: string;
  policy: {
    agentKey: string; perTxCap: bigint; dailyCap: bigint;
    payees: string[]; channel: string; expiresLedger: number;
  };
  spentToday: bigint;
  day: number;
  frozen: boolean;
  balance: bigint;        // USDC
}

export interface ChainEvent {
  type: 'channel.opened' | 'channel.topped_up' | 'channel.claimed' | 'channel.closed';
  channelId: bigint;
  data: Record<string, string>;
  tx: string;
  ledger: number;
}

export interface ChainPort {
  readonly networkPassphrase: string;
  readonly channelContractId: string;
  latestLedger(): Promise<number>;
  getChannel(id: bigint): Promise<ChannelState | null>;
  claim(id: bigint, cumulative: bigint, signatureHex: string): Promise<{ tx: string }>;
  getAccount(address: string): Promise<AccountState | null>;
  getTransactionStatus(hash: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND'; contractErrorCode?: number }>;
  pollEvents(fromLedger: number): Promise<{ events: ChainEvent[]; latestLedger: number }>;
}
```

`ChainModule`, `CHAIN_MODE`'a göre ya `MockChain` ya da `StellarChain` sağlar.

### 4.1 `MockChain` (ilk gün)

- Bellek içi kanal ve hesap tabloları. `latestLedger()` her 5 saniyede bir artar.
- `claim` kupon imzasını gerçekten doğrular, `claimed` alanını günceller ve sahte bir tx hash'i döner.
- **Yalnızca mock modda** açılan geliştirici uçları:
  - `POST /dev/channels` `{ payer, deposit, voucherKey, expiryInLedgers }` → kanal oluşturur, `channel.opened` olayı yayınlar.
  - `POST /dev/accounts` → sahte Reinkey Account oluşturur.
  - `POST /dev/reject` `{ account, code }` → sahte zincir reddi olayı üretir (panel geliştirmesi için).
- `scripts/mock-agent.ts`: sahte kanal açıp `/demo/book`'u 100 kez çağıran, sonra `/demo/chat`'i akışla tüketen bir betik. Panel ekibi backend'i bununla besleyecek.

### 4.2 `StellarChain` (kontratlar deploy edilince)

- `@stellar/stellar-sdk` ile çalışır: `rpc.Server` ve `contract.Client.from({ contractId, rpcUrl, networkPassphrase, publicKey, signTransaction })`. `contract.Client.from` spesifikasyonu zincirden okur, oluşturulmuş binding'lere gerek yok.
- Hat 1'in kontrat fonksiyon adları (değişirse `NOTES-FOR-HAT1.md` üzerinden haberleşin):
  - `channel`: `open`, `top_up`, `claim(id: u64, cumulative: i128, sig: BytesN<64>)`, `close(id)`, `get(id) -> Channel`
  - `reinkey-account`: `get_policy() -> Policy`, `get_spent() -> (u32, i128)`, `is_frozen() -> bool`
  - Olaylar (topics): `("channel", "opened", id)`, `("channel", "topped_up", id)`, `("channel", "claimed", id)`, `("channel", "closed", id)`
- `claim`: kaynak hesap `FACILITATOR_SECRET`. Simüle et → hazırla → imzala → gönder → sonucu bekle. Ücreti facilitator öder.
- Sequence çakışmasına karşı claim'leri **tek bir kuyrukta sırayla** gönder. Havuz gerekmiyor, hackathon trafiği düşük.
- `pollEvents`: `rpc.getEvents` çağrısı, kanal kontratı filtresiyle, 5 saniyede bir.

---

## 5. Facilitator: `channel` şeması

### 5.1 x402 başlıkları

İki sürümü de kabul et. Hangisinin kullanıldığını kurulu `@x402/*` sürümünden doğrula ve `NOTES-FOR-HAT1.md`'ye yaz:

- İstek: `PAYMENT-SIGNATURE` (v2) ya da `X-PAYMENT` (v1). Değer: base64 kodlu JSON.
- 402 yanıtı: gövde JSON + `PAYMENT-REQUIRED` başlığı (base64, aynı JSON).
- Başarılı yanıt: `PAYMENT-RESPONSE` başlığı (base64 JSON makbuz).

**402 gövdesi:**

```json
{
  "x402Version": 2,
  "error": "PAYMENT_REQUIRED",
  "accepts": [
    {
      "scheme": "channel", "network": "stellar:testnet",
      "asset": "<USDC_CONTRACT_ID>", "payTo": "<SELLER_PAY_TO>",
      "amount": "5000", "unit": "request",
      "resource": "https://…/demo/book", "description": "Order book snapshot",
      "extra": { "channelContract": "<CHANNEL_CONTRACT_ID>", "minDeposit": "5000000",
                 "facilitator": "<PUBLIC_URL>", "areFeesSponsored": true }
    },
    {
      "scheme": "exact", "network": "stellar:testnet",
      "asset": "<USDC_CONTRACT_ID>", "payTo": "<SELLER_PAY_TO>", "maxAmountRequired": "5000",
      "resource": "https://…/demo/book"
    }
  ]
}
```

**Ödeme yükü (base64 çözülmüş):**

```json
{ "x402Version": 2, "scheme": "channel", "network": "stellar:testnet",
  "payload": { "channelId": "42", "cumulative": "135000", "signature": "<hex>" } }
```

**Makbuz:**

```json
{ "scheme": "channel", "channelId": "42", "accepted": "135000", "delta": "5000",
  "remaining": "4865000", "latencyMs": 3 }
```

### 5.2 Doğrulama algoritması (`ChannelVerifier.verify`)

Sırayla uygula; ilk başarısız adımda kodu döndür:

1. Yükü çöz ve şemayla doğrula (zod) → `PAYMENT_MALFORMED`.
2. Kanalı al: önce önbellek, yoksa `chain.getChannel` → `CHANNEL_NOT_FOUND`. İlk kez görülüyorsa `channel.opened` olayını yayınla.
3. `open` değilse → `CHANNEL_CLOSED`. Payee `SELLER_PAY_TO` değilse → `WRONG_PAYEE`. Varlık USDC değilse → `WRONG_ASSET`.
4. `expiryLedger − latestLedger < VOUCHER_EXPIRY_SAFETY_LEDGERS` ise → `CHANNEL_EXPIRING`.
5. İmzayı `voucherKey` ile doğrula (§3.1) → `VOUCHER_BAD_SIGNATURE`.
6. `cumulative ≤ lastAccepted` ise → `VOUCHER_NOT_INCREASING`. `lastAccepted` başlangıçta zincirdeki `claimed` değeridir.
7. `cumulative − lastAccepted < price` ise → `VOUCHER_UNDERPAID`.
8. `cumulative > deposit` ise → `CHANNEL_EXHAUSTED`.
9. **Atomik** kaydet: `UPDATE channel SET last_accepted = $new, last_sig = $sig WHERE id = $id AND last_accepted < $new`. Etkilenen satır 0 ise → `VOUCHER_NOT_INCREASING` (yarış durumu).
10. `voucher.accepted` olayını yayınla (`latencyMs` ölçülmüş olarak) ve makbuzu döndür.

**Performans hedefi:** önbellekte bulunan bir kanal için doğrulama **< 10 ms**. Zincire yalnızca kanal ilk kez görüldüğünde gidilir. Kanal değişiklikleri önbelleğe olaylarla yansır.

Birim testleri: test vektörü, tüm red kodları, yarış durumu (aynı kupon iki kez eşzamanlı → biri kabul, biri red).

### 5.3 Tahsilat (`ClaimScheduler`, `@nestjs/schedule`)

Her `CLAIM_INTERVAL_SECONDS` saniyede, her açık kanal için:
- `lastAccepted − claimed ≥ CLAIM_THRESHOLD` ise, **ya da**
- `expiryLedger − latestLedger ≤ CLAIM_EXPIRY_MARGIN_LEDGERS` ve `lastAccepted > claimed` ise

→ `chain.claim(id, lastAccepted, lastSig)`. Başarılıysa `claimed` güncellenir ve `channel.claimed` olayı yayınlanır: `{ amount, vouchersCovered, tx }`. `vouchersCovered`, son claim'den beri kabul edilen kupon sayısıdır; demodaki "400 kupon → 1 işlem" rakamı buradan gelir.

Elle tahsilat: `POST /channels/:id/claim`.

---

## 6. `meter()` ve demo satıcı

### 6.1 `meter()`

Framework'ten bağımsız bir Express middleware'i olarak yaz (`src/x402/meter.ts`). Nest'te `app.use` ya da bir guard sarmalayıcısıyla bağla. Hat 1 bunu sonradan `packages/x402`'ye taşıyacak, o yüzden Nest'e bağımlı olmasın.

```ts
meter({ price: 5000n, unit: 'request', description: '…' })   // /demo/book
meter({ price: 200n, unit: 'token', sliceTokens: 50 })        // /demo/chat
```

- Ödeme başlığı yoksa → 402 (§5.1 gövdesi).
- Varsa → `ChannelVerifier.verify` (şema `exact` ise `ExactVerifier`) → başarılıysa `req.payment` alanına makbuzu koy ve devam et.

### 6.2 `GET /demo/book?pair=USDC_XLM`

`unit: request`, 5000 taban birim. Deterministik sahte bir emir defteri döndürür: 10 alış ve 10 satış seviyesi, fiyat zamanla hafifçe oynar. Yanıtta `PAYMENT-RESPONSE` başlığı olmalı.

### 6.3 `POST /demo/chat` (akışlı, token başına)

Gövde: `{ "prompt": "…" }`. Yanıt: SSE (`text/event-stream`).

**Dilimli ödeme protokolü:**

1. İlk istek, **ilk dilimin** bedelini karşılayan bir kupon içerir: `cumulative ≥ lastAccepted + sliceTokens × price`. Yoksa → 402.
2. Sunucu bir `streamId` üretir ve ilk olayı gönderir: `event: session` → `{ streamId, channelId, sliceTokens, pricePerToken }`.
3. Her token için: `event: token` → `{ text, index, paidThrough }`.
4. Ödenen dilim bittiğinde: `event: payment-required` → `{ streamId, requiredCumulative }` gönderilir ve **akış durur**.
5. İstemci `POST /channels/:id/voucher` `{ streamId, cumulative, signature }` gönderir → doğrulanırsa akış kaldığı yerden sürer.
6. 10 saniye içinde kupon gelmezse, ya da kupon `CHANNEL_EXHAUSTED` ile reddedilirse: `event: error` → `{ code }` gönderilir ve akış kapatılır. **Cümlenin ortasında kesilmesi demonun parçası.**
7. Normal bitişte: `event: done` → `{ tokens, charged, vouchers }`.

**Token kaynağı:**
- `CHAT_MODE=fallback` (varsayılan): önceden yazılmış ~600 token'lık bir İngilizce metin, token başına 30–60 ms gecikmeyle akar. Metin Stellar ve ajan ödemeleriyle ilgili olsun; sahnede okunacak.
- `CHAT_MODE=llm`: `@anthropic-ai/sdk` ile `messages.stream` çağrısı (`CHAT_MODEL`). Metin parçaları token'a bölünür; basit yaklaşım yeterli: 4 karakter = 1 token. Hata olursa otomatik olarak fallback moduna geçilir.

Kısa süreli oturum durumu (`streamId` → beklenen kümülatif tutar) bellekte tutulur.

---

## 7. `exact` şeması (öncelik: DÜŞÜK)

`@x402/stellar` paketinin kendi facilitator ya da doğrulayıcı bileşenleriyle, süreç içinde çalıştır. Paketin gerçek API'sini `node_modules` içindeki kaynak ve README'den oku, **tahmin etme**. İki saatten fazla sürerse bırak: `ExactVerifier` her zaman `PAYMENT_MALFORMED` ile birlikte "exact henüz etkin değil" mesajını döndürsün, 402 yanıtında da yalnızca `channel` ilan edilsin. Bunu `NOTES-FOR-HAT1.md`'ye yaz.

---

## 8. Denetim defteri ve olaylar

### 8.1 Prisma şeması (başlangıç)

```prisma
model Channel {
  id            BigInt   @id
  payer         String
  payee         String
  asset         String
  deposit       BigInt
  claimed       BigInt
  lastAccepted  BigInt   @default(0)
  lastSig       String?
  voucherKey    String
  expiryLedger  Int
  open          Boolean
  vouchersSinceClaim Int @default(0)
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())
}

model Event {
  id        BigInt   @id @default(autoincrement())
  type      String                      // §8.2
  source    String                      // gateway | facilitator | chain
  channelId BigInt?
  account   String?
  code      String?
  tx        String?
  data      Json
  createdAt DateTime @default(now())
  @@index([type, createdAt])
  @@index([account])
  @@index([channelId])
}
```

Kupon başına ayrı bir tablo **tutma**; her kabul için yalnızca `Event` satırı yazılsın. Yük bindiğinde `voucher.accepted` olaylarını 250 ms'lik gruplar hâlinde toplu yaz.

### 8.2 SSE: `GET /events`

- Bağlantı açıldığında son 200 olayı gönder, sonra canlı akışa geç. Her 15 saniyede bir `:ping` yolla.
- `?account=` ve `?channelId=` filtreleri desteklensin.
- Olay adı `type` alanıdır, `data` alanı JSON'dur. Tipler ve alanlar (DEĞİŞTİRME, panel buna göre yazılıyor):

```
channel.opened    { channelId, payer, payee, deposit, expiryLedger, tx }
channel.topped_up { channelId, amount, deposit, tx }
voucher.accepted  { channelId, cumulative, delta, unit, latencyMs, resource }
voucher.rejected  { channelId?, code, resource }
channel.claimed   { channelId, amount, vouchersCovered, tx }
channel.closed    { channelId, refunded, tx }
payment.exact     { payer, payee, amount, tx }
chain.rejected    { account, code, tx }
stream.started    { streamId, channelId }
stream.ended      { streamId, reason: "done" | "CHANNEL_EXHAUSTED" | "TIMEOUT", tokens, charged }
```

Her olayda ayrıca `id`, `type`, `source` ve `ts` (ISO) alanları bulunur.

**EK (panel, Hat 3):** `ticker.tick { streamId, channelId, pair, price, bid, ask, source, ledger, index, paidThrough }` olayı eklendi. Ajana satılan her fiyat tik'inin kopyasıdır; panel fiyat grafiğini bundan çizer. `agent.log` gibi **geçicidir**: yalnızca canlı SSE'ye gider, DB'ye ve son-200 tamponuna yazılmaz, `/stats` sayaçlarını etkilemez.

### 8.3 `POST /v1/report`: zincir reddi bildirimi

Ajanlar, zincirde reddedilen işlemleri buraya bildirir: `{ account, tx }`. Sen `chain.getTransactionStatus(tx)` çağırırsın. Durum gerçekten `FAILED` ise hata kodunu §3.3 tablosuyla çevirir ve `chain.rejected` olayını `source: chain` ile yayınlarsın. Doğrulanmayan bildirimi reddet. Demodaki "zincirden red" anı paneldeki bu olaydan gelir.

### 8.4 `GET /stats`

```json
{
  "vouchersAccepted": 412, "vouchersRejected": 3,
  "chainTxCount": 2,
  "volume": "2060000",
  "channelsOpen": 1,
  "exactEquivalent": { "txCount": 412, "seconds": 2060 },
  "medianVoucherLatencyMs": 2
}
```

`chainTxCount`, gözlenen tüm zincir işlemlerinin sayısıdır: open, top_up, claim ve close. `exactEquivalent.seconds = vouchersAccepted × 5`.

---

## 9. Diğer uçlar

```
GET  /supported                 { kinds: [{ scheme:"channel", network }, { scheme:"exact", network }] }
POST /verify                    x402 facilitator API: { paymentPayload, paymentRequirements } → { isValid, invalidReason?, receipt? }
POST /settle                    channel: kabul edilen kuponu kuyruğa alır; exact: uzlaştırır
GET  /channels/:id              ChannelState + lastAccepted + unclaimed + remaining
POST /channels/:id/voucher      §6.3
POST /channels/:id/claim        elle tahsilat
GET  /accounts/:addr            AccountState + açık kanalları
GET  /accounts/:addr/ledger     o hesaba ait olaylar, sayfalı (?cursor=)
GET  /events                    §8.2
GET  /stats                     §8.4
POST /v1/report                 §8.3
GET  /health                    { ok, chainMode, latestLedger, db }
```

Keşif:
- `GET /openapi.json`: `@nestjs/swagger` ile üretilir. Swagger arayüzü `/docs` adresinde.
- `GET /llms.txt`: düz metin. Reinkey nedir, `channel` şeması nasıl kullanılır, kupon biçimi (§3.1), uçlar, fiyatlar, örnek akış.
- `POST /mcp`: `@modelcontextprotocol/sdk` ile streamable HTTP. Araçlar (salt okunur):
  - `reinkey_supported`
  - `reinkey_get_channel`
  - `reinkey_get_account`
  - `reinkey_stats`
  - `reinkey_price_list` (ücretli kaynaklar, fiyatları ve birimleri)

---

## 10. Klasör yapısı (öneri)

```
backend/src/
  main.ts                 CORS, SSE, raw body gerekmez; BigInt JSON serileştirmesi (string)
  app.module.ts
  config/                 zod ile doğrulanan env
  common/                 reason-codes.ts, hata filtresi (§3.3 biçimi), bigint yardımcıları
  chain/                  chain.port.ts, mock.chain.ts, stellar.chain.ts, chain.module.ts
  channel/                voucher.ts (saf), channel.verifier.ts, channel.cache.ts, claim.scheduler.ts, channel.controller.ts
  x402/                   meter.ts, headers.ts, exact.verifier.ts, facilitator.controller.ts (/verify /settle /supported)
  demo/                   book.controller.ts, chat.controller.ts, fallback-text.ts
  audit/                  prisma.service.ts, events.service.ts (yayınla + kaydet + SSE), stats.service.ts, report.controller.ts
  accounts/               accounts.controller.ts
  discovery/              llms.controller.ts, mcp.controller.ts
  dev/                    yalnızca CHAIN_MODE=mock iken yüklenen modül
scripts/mock-agent.ts
docker-compose.yml
.env.example
README.md                 çalıştırma adımları
NOTES-FOR-HAT1.md         Hat 1'e sorular / karar notları
```

**BigInt dikkat:** `JSON.stringify` BigInt'i serileştiremez. Global bir serileştirici ya da interceptor ile hepsini string'e çevir. Prisma `BigInt` alanları da `bigint` döner.

---

## 11. Sıra ve kontrol noktaları

| # | İş | Bitti sayılması için |
|---|---|---|
| 1 | Bağımlılıklar, config, docker-compose, Prisma şeması, hata filtresi, `/health` | `npm run start:dev` açılıyor, `/health` 200 dönüyor |
| 2 | `voucher.ts` + test vektörü testi | `npm test` içinde vektör testi yeşil |
| 3 | `ChainPort` + `MockChain` + `/dev/*` | Sahte kanal oluşturuluyor |
| 4 | `ChannelVerifier` + `meter()` + `/demo/book` + birim testleri | `mock-agent` 100 çağrı yapıyor, hepsi kabul |
| 5 | Olaylar + SSE + `/stats` | `curl -N /events` canlı akış gösteriyor |
| 6 | `/demo/chat` dilimli akış (fallback) | `mock-agent` akışı tüketiyor, depozito bitince `CHANNEL_EXHAUSTED` |
| 7 | `ClaimScheduler` (mock) | `channel.claimed` olayında `vouchersCovered` doğru |
| 8 | `/llms.txt`, OpenAPI, MCP | Üçü de yanıt veriyor |
| 9 | `StellarChain` | Hat 1 deploy ettiğinde gerçek kanal doğrulanıyor ve tahsil ediliyor |
| 10 | `/v1/report` | Gerçek başarısız tx → `chain.rejected` |
| 11 | `exact` (§7) | Opsiyonel |
| 12 | `llm` modu | Opsiyonel |

**4. adım bittiğinde** panel ekibi seni kullanmaya başlayabilir. `README.md`'ye mock modla nasıl çalıştırılacağını yaz.

**9. adım** Hat 1'e bağlı. Kontrat kimlikleri `../deployments/testnet.json` dosyasına yazılınca başla; o zamana kadar 10–12'ye geç.

---

## 12. Kurallar

- `number` ile para hesabı yok, hep `bigint`.
- Her hata §3.3 biçiminde ve bir kodla döner. Yakalanmamış istisna 500 dönerse, onu da `INTERNAL` koduyla sar.
- Gizli anahtarları loglama. `.env` dosyası `.gitignore`'da olsun.
- Kod yorumları ve README Türkçe; tanımlayıcılar, API alanları ve olay adları İngilizce.
- İş bitince ya da tıkandığında `NOTES-FOR-HAT1.md` dosyasına kısa bir durum yaz: ne bitti, ne bekleniyor, hangi kararı verdin.
- Commit atma. Kullanıcı ayrıca isterse at.

---

## 13. EK (19 Eylül, Hat 1): kontratlar deploy edildi, sözleşme güncellemeleri

Kontratlar testnet'te. Kimlikler ve açık anahtarlar: `../deployments/testnet.json`. Gizli anahtarlar (facilitator dahil): `../deployments/.secrets.env`. Bu dosyayı **okuyabilirsin ama değiştirme**; kendi `.env` dosyana kopyala.

```
CHANNEL_CONTRACT_ID = CD2GXK3IYEWRPZAJKQEHO7XO5CVZDKVEK7W2TIGDR6LSEYD52V7EGGHL
USDC_CONTRACT_ID    = CDULCH6T5JMYY4IGOSC3LZYQLYECRMGBDNTNZIG3MA27BJUKVEJ7RDPV   (bizim ihraç ettiğimiz test "USDC"si, 7 ondalık)
SELLER_PAY_TO       = testnet.json → sellerPublicKey
Demo Reinkey Account = testnet.json → demoAccountId
```

Zincir protokolü 28; araç stellar-cli 28.

**§3–4'e göre sapmalar (bunlar geçerlidir):**

1. `close(id: u64, caller: Address)`: `caller` parametresi eklendi. Payee hemen kapatabilir. Payer erken kapatırsa `#25 NOT_EXPIRED` döner, üçüncü bir taraf denerse `#26 NOT_AUTHORIZED`.
2. Yeni zincir hata kodu: `27 INVALID_ARGUMENT` (sıfır depozito, geçmiş süre, payer = payee). `reason-codes.ts` tablosuna ekle.
3. `claim` çağrısında imza geçersizse zincir `#22` döndürmez; host işlemi kendisi durdurur ve hata `Error(Crypto, InvalidInput)` olur. Bu hatayı `VOUCHER_BAD_SIGNATURE` olarak eşle. Doğrulamayı zaten zincir dışında yaptığın için normalde buraya düşmemelisin.
4. `reinkey-account` → `Policy` içinde ek bir `asset: Address` alanı var. Kanal kontratı `payees` listesinde değil, `policy.channel` alanı üzerinden tanınıyor. `AccountState.policy.payees` alanını olduğu gibi göster.
5. Olaylar: topic `("channel", "opened" | "claimed" | "closed", id)`, veri alan adlı bir map. Kesin alan adlarını `../contracts/channel/src/lib.rs` dosyasından oku.

**Referans:** `../scripts/sign-voucher.mjs`, §3.2'deki test vektörünün aynısını üreten Node imzalayıcı. Gerçek kanal üzerinde elle kupon üretip `StellarChain`'i denemek için kullanabilirsin.

---

## 14. EK (19 Eylül, v4): kripto borsası konumlandırması — ÖNCELİKLİ

Ürün artık "kripto borsaları ve ajanlar için x402 altyapısı" olarak konumlanıyor (`../proje-tanimi.md` §0). Demonun yıldızı **saniye başı ücretli canlı fiyat akışı**. `/demo/chat` ikincil örneğe dönüştü. Yapılacaklar, sırasıyla:

### 14.1 `GET /demo/ticker/stream`: saniye başı fiyat akışı (§11'deki 6. adımdan hemen sonra, 7'den önce)

- `meter({ price: PRICE_TICKER_PER_SECOND, unit: 'second', sliceSeconds: TICKER_SLICE_SECONDS })`
- Yeni env değerleri: `PRICE_TICKER_PER_SECOND=1000` (0.0001 USDC), `TICKER_SLICE_SECONDS=10`
- Protokol §6.3 ile **aynıdır**; yalnızca birim saniye ve içerik olayı `tick`:
  - `event: session` → `{ streamId, channelId, unit: "second", sliceSeconds, pricePerSecond }`
  - her saniye `event: tick` → `{ pair: "XLM_USDC", price: "0.1234567", bid, ask, index, paidThrough, ts }` (fiyatlar 7 ondalıklı string)
  - dilim bitince `event: payment-required` → `{ streamId, requiredCumulative }`; kupon `POST /channels/:id/voucher` ile gelir
  - kupon gelmezse ya da `CHANNEL_EXHAUSTED` olursa `event: error` gönderilir ve akış kapanır
- **Fiyat kaynağı:** önce deterministik bir rastgele yürüyüş (0.10–0.14 bandında), mock modda da çalışır. `CHAIN_MODE=stellar` iken ve `deployments/testnet.json` içinde `dexPairUsdcXlmId` varsa, fiyat 5 saniyede bir Soroswap pair rezervlerinden okunur ve rastgele yürüyüş bu değerin çevresinde döner. Böylece ajanın satın aldığı veri, işlem yaptığı DEX'in gerçek fiyatıdır. Pair okuması hata verirse sessizce rastgele yürüyüşe dön ve `/health` içinde `priceSource: "dex" | "synthetic"` alanını göster.
- `/demo/book` da aynı fiyat kaynağını kullansın.
- `stream.started` ve `stream.ended` olaylarına `unit` alanı ekle (`"token"` ya da `"second"`). `stream.ended.tokens` alanı saniye akışında geçen saniye sayısıdır; ayrıca `seconds` alanı da ekle.
- 402 yanıtında `description: "Live XLM/USDC ticker, paid per second"`.
- `mock-agent.ts` betiğine ticker akışını da ekle.

### 14.2 DEX işlem bildirimi

`POST /v1/report` gövdesi genişliyor: `{ account, tx, kind?: "swap" | "payment", details?: { sold, soldAsset, bought, boughtAsset } }`
- tx `FAILED` ise: eskisi gibi hata kodunu çevir ve `chain.rejected` yayınla.
- tx `SUCCESS` ve `kind === "swap"` ise: yeni olayı yayınla: `dex.swapped { account, sold, soldAsset, bought, boughtAsset, tx }`, `source: "chain"`. `details` ajandan gelir; sen yalnızca tx'in başarılı olduğunu ve kaynağının `account` olduğunu doğrulayabildiğin kadar doğrula (en azından SUCCESS kontrolü).
- `/stats` içindeki `chainTxCount` bu işlemleri de saysın.

### 14.3 Yeni zincir kodları

`reason-codes.ts` tablosuna ekle: `8 PAIR_NOT_ALLOWED`, `9 SLIPPAGE_UNBOUNDED` (reinkey-account), `27 INVALID_ARGUMENT` (channel; §13'te de geçiyor).

### 14.4 Keşif metinleri

`llms.txt` ve OpenAPI açıklamalarını yeni konumlandırmaya göre yaz: "Crypto exchange market data, paid per second via x402 channels on Stellar". MCP fiyat listesi aracı ticker akışını da listelesin.

---

## 15. EK (19 Eylül, Hat 1B): DEX katmanı deploy edildi — `/v1/report` için KRİTİK

`../deployments/testnet.json` güncellendi: yeni `demoAccountId` (eskisi `demoAccountLegacyId`), `dexRouterId`, `dexFactoryId`, `dexPairUsdcXlmId` (USDC/XLM havuzu, rezervler ~4000 XLM / 500 USDC), `xlmContractId`. `channelContractId` ve `usdcContractId` değişmedi.

1. **Politika reddinin kodu işlemin üst düzey hatasında DEĞİL.** `reinkey-account` bir işlemi reddettiğinde üst düzey hata `Error(Auth, InvalidAction)` olur. Bizim kodumuz **tanı olayının (diagnostic event)** içindedir: `failed account authentication with error [<hesap>, Error(Contract, #N)]`. `getTransactionStatus` başarısız bir işlemde tanı olaylarını tarayıp `#N` değerini buradan çıkarmalı; bulamazsa `CONTEXT_NOT_ALLOWED` yerine ham hatayı `UNKNOWN_CHAIN_ERROR` koduyla raporla. Çalışan örnek: `../scripts/dex-smoke.mjs` ve `../scripts/lib/account-auth.mjs` (`CHAIN_CODES`).
   - Doğrulamak için gerçek başarısız işlemler (testnet): `8c6018fdbae68959…` → `#6 PER_TX_CAP_EXCEEDED`, `c89ee691de834718…` → `#5 PAYEE_NOT_ALLOWED`. Tam hash'ler için Hat 1'e sor ya da `dex-smoke.mjs`'i çalıştır.
2. `Policy`'de yeni alanlar: `dex_router: Option<Address>`, `dex_factory: Option<Address>`, `pairs: Vec<(Address, Address)>`. `GET /accounts/:addr` yanıtında `policy.dexRouter` ve `policy.pairs` olarak dön. `pairs` öğelerini panel için okunur biçime çevir: varlık kontrat kimliği `usdcContractId` ise `"USDC"`, `xlmContractId` ise `"XLM"`; örnek: `["USDC→XLM", "XLM→USDC"]`.
3. **Fiyat kaynağı (§14.1):** `dexPairUsdcXlmId` artık var. Pair kontratının `get_reserves()` çıktısından fiyatı hesapla; token sırası için `token_0()` / `token_1()` çağrılarına bak, sırayı varsayma.

---

## 16. EK (19 Eylül, Hat 1A): SDK ve ajanlar hazır; senden beklenenler

SDK (`../packages/sdk`) ve demo ajanları (`../agents`, `pnpm demo`) senin çalışan backend'ine karşı test edildi: 402 → kupon → 200, bozuk imza reddi, dilimli token akışı çalışıyor. Açık kalanlar, öncelik sırasıyla:

1. **`GET /demo/ticker/stream` hâlâ 404** (§14.1). SDK tarafı hazır; bu uç yayına girince demo ajanının fiyat akışı ve DEX adımları kendiliğinden devreye girer. **Şu an demonun önündeki tek engel bu.**
2. **`CHAIN_MODE=stellar` geçişi** (§4.2, §13, §15). Gerçek uçtan uca demo için gerekli. Değerler `../deployments/testnet.json` ve `../deployments/.secrets.env` dosyalarında. Ajanlar artık kendi relayer hesabını kullanıyor; **facilitator G-hesabı yalnızca senin**. Aynı hesabı iki taraf kullanınca sıra numarası çakışıp işlemler düşüyordu.
3. **`POST /v1/report` gövdesinde `code` alanını kabul et:** `{ account, tx, code?, kind?, details? }`. RPC, başarısız işlemin sonucunda kontrat hata kodunu vermiyor; kod yalnızca simülasyonda ve tanı olaylarında görünüyor. Önce §15'teki tanı olayı taramasını dene; kodu bulamazsan ajandan gelen `code` değerini kullan. Her durumda tx'in gerçekten `FAILED` olduğunu doğrula. Yanıtta `codeSource: "chain" | "reporter"` alanını dön ve olayın `data` alanına da yaz.
4. **Sayaç tutarsızlığı:** akış sonunda `done.charged = 125000` geldi, kanalın kümülatifi ise 140000'di. `charged`, o akış boyunca kabul edilen kuponların delta toplamı olmalı (ilk dilimin kuponu dahil). Kontrol et, bir birim testiyle sabitle.
5. **Trustline notu:** test USDC'miz klasik bir varlık. `SELLER_PAY_TO` G-hesabının USDC trustline'ı olmalı (deploy betiği kuruyor); yoksa `claim` `#13` ile düşer.

---

## 17. EK (20 Eylül, Hat 3): Bazaar kataloğu — `GET /discovery/resources`

Ek hedef (§9 kesme sırasındaki "Bazaar kataloğu") uygulandı.

- **Kayıt ucu yok.** Bir kaynak kataloğa yalnızca `/verify`'dan geçen gerçek bir ödemeyle girer (ödeme kanıtı = listelenme). Facilitator'ın kendi demo uçları açılışta eklenir. Prisma modeli: `Resource` (göç `20260919222031_bazaar_catalog`).
- **Liste biçimi** x402.org facilitator'ıyla aynı: `{ x402Version: 2, items: [{ resource, type: "http", x402Version, accepts, lastUpdated, metadata }], pagination: { limit, offset, total } }`. Sorgu: `payTo`, `limit`, `offset`, `type` (yalnızca `http`).
- **402 gövdesi** artık `resource.mimeType` ve `extensions.bazaar` (`info.input`, `info.output`, `schema`) taşıyor; `meter()` bunları yöntem ve birimden türetir, satıcı `bazaar` seçeneğiyle zenginleştirebilir. `/verify` gövdesi `extensions` ve `paymentRequirements.method/description` kabul eder; `@reinkey/meter` bunları gönderir.
- llms.txt'ye keşif paragrafı, MCP'ye `reinkey_list_resources` aracı eklendi. Fiyat listesine eksik olan `/demo/ticker/stream` eklendi.

---

## 18. EK (20 Eylül, Hat 3): dış satıcıya akış oturumları — `/streams`

`StreamSessions` HTTP'ye açıldı (`src/channel/streams.controller.ts`); demo satıcı süreç içinden aynı sınıfı kullanmaya devam ediyor.

- `POST /streams` `{ channelId, payTo, resource, unit, sliceCost, initialCharge }` → `{ streamId, requiredCumulative, voucherUrl }`. Kanalın alıcısı `payTo` olmalı; kanal başına en çok 4, toplamda 1000 açık oturum; 90 sn boşta kalan oturum `ABORTED` ile kapanır. `stream.started` yayınlar.
- `POST /streams/:id/wait` `{ timeoutMs ≤ 30000 }` → `{ kind: paid, receipt, requiredCumulative } | timeout | exhausted | frozen | aborted`. Kalan depozito bir dilime yetmiyorsa beklemeden `exhausted`.
- `DELETE /streams/:id` `{ reason, units }` → `{ charged, vouchers }`; `stream.ended` yayınlar (resource alanıyla).
- Alıcı tarafı değişmedi: kupon `POST /channels/:id/voucher` ile gelir. SDK `streamPaid()` artık `apiUrl` verilmezse 402'deki `extra.facilitator`'ı kullanır.
- `@reinkey/meter`: `rk.stream(req, res, opts)` → `PaidStream` (`next()`, `send()`, `end()`); SSE başlıkları ve `session` / `payment-required` / `error` / `done` olayları demo satıcıyla birebir.
- Doğrulama: `agents/tools/meter-check.ts` (kanal #12): 3 çağrı, bozuk imza reddi, Bazaar kaydı, 5 saniyelik akış = 5 kupon, defterde `stream.ended` doğru tutarla.
- Katalog yazımı `INSERT … ON CONFLICT` ile atomik yapıldı: art arda gelen /verify'ların yazımları çakışınca Prisma upsert'i satır kaybediyordu.

---

## 19. EK (20 Eylül, Hat 3): Reinkey Float — kredi havuzunun salt okunur yüzeyi

`contracts/credit-pool` deploy edilmiş ve smoke testinden geçmişti ama hiçbir yüzeyde yoktu. Artık üçüncü ürün: **Float**.

- `ChainPort.readContract(contractId, method, args)`: genel salt okuma (simülasyon). Float bununla okur; havuza özel metot eklenmedi.
- `src/float/`: `FloatService` (5 sn önbellek; pay fiyatını dakikada bir `PoolSample` tablosuna örnekler, göç `20260920000235_float_pool_samples`; kontrat geçmiş tutmuyor), `FloatController`.
- Uçlar: `GET /float` (havuz + hatlar + pozisyonlar + geçmiş), `GET /float/lines/:account`, `GET /float/positions/:address`. **Zincire yazan hiçbir şey yok.**
- Config: `CREDIT_POOL_ID`, `CREDIT_ACCOUNT_IDS`, `FLOAT_INVESTORS`; boşsa `deployments/testnet.json` (`creditPoolId`, `creditAccountId`, `investorPublicKey`). Havuz tanımsızsa `{ enabled: false }`.
- Konsol: Float görünümü (`/?view=float`). Landing: `/float` ürün sayfası, `/docs/float`.
- Canlı durum (20 Eylül): 100 pay, toplam varlık 100,48 USDC, pay fiyatı 1,0047748, açık borç 0.

---

## 20. EK (20 Eylül, Hat 3): satıcı finansı — `/sellers/:payTo/revenue`

Meter'ın finans yüzü. Kaynak denetim defteri (`Event`) ve kanal durumu; ayrı muhasebe tablosu yok.

- `GET /sellers/:payTo/revenue?days=&bucket=hour|day`: `totals` (kazanılan, tahsil edilen, alacak, ödeme, tahsilat, tahsilat başına ödeme, alıcı), `byResource`, `series`, `receivables` (kanal bazında yaş ve kanalın bitişine kalan süre), `settlements`.
- `GET /sellers/:payTo/settlements.csv`: tahsilat başına bir satır.
- Eski kayıtlardaki çift `channel.claimed` olayları tx bazında tekilleştirilir (MAX tutar, MAX vouchersCovered).
- Konsol: Meter görünümünde "Gelir raporu", "Kaynak bazında gelir", "Alacak yaşlandırma" ve CSV düğmesi.
- Canlı doğrulama (20 Eylül): kazanılan 0,1335 = tahsil edilen 0,1335, alacak 0; 574 ödeme 20 tahsilatla (tahsilat başına 28,7 ödeme).


---

## 21. EK (20 Eylül, Hat 3): borsa katmanı — `GET /dex/quote`

Kendi likidite havuzumuz yok ve olmayacak: takas Stellar'da zaten var olan likiditede
(Soroswap) gerçekleşir. Katılan üç şey: rota, kontratın zorunlu tuttuğu kayma koruması
önerisi ve **politika ön kararı**.

- `GET /dex/quote?side=USDC_XLM&amountIn=…&account=…&slippageBps=100`
- Çıktı: sabit çarpım eğrisinden `amountOut`, gerçekleşme fiyatı, fiyat etkisi (bps),
  `minOut`, havuz rezervleri, ajanın imzalayacağı router çağrısı ve `policy` kararı.
- `policy` kuralları `contracts/reinkey-account` ile birebir: donmuş hesap, router yokluğu,
  izinsiz çift, sıfır `minOut`, süresi dolmuş politika, işlem ve günlük tavan. Tavanlara
  yalnızca politikanın varlığı (USDC) satılırken sayılır.
- Kotasyon ÜCRETSİZDİR: herkese açık zincir verisinden ve hesabın kendi politikasından
  hesaplanır (`GET /accounts/:addr` gibi). Ücretli olan satılan piyasa verisidir.
- İkinci fiyat kaynağı olarak kredi havuzunun ihtiyatlı fiyatı (Reflector oracle ile havuzun
  düşüğü) okunur; kotasyon ile kredi değerlemesi sessizce ayrışamaz.
- Testler: `src/dex/dex.service.spec.ts` (13 test), her red yolu ayrı.

## 22. EK (20 Eylül, Hat 3): self-servis hesap — konsoldan kur, sınırla, dondur

Konsol artık salt okunur değil: kullanıcı **kendi** Reinkey hesabını tarayıcıdan kurar ve sınırlarını kendi cüzdanıyla değiştirir. Backend bu akışta yer almaz; yalnızca iki okuma alanı ekledi:

- `GET /demo/info` → `accountWasm` (dağıtılmış `reinkey-account` wasm hash'i, `deployments/testnet.json → accountWasmHash`) ve `dexFactory`. Konsol yeni hesabı bu hash'ten `createCustomContract` ile kurar: aynı kod, sahibi bağlanan cüzdan.
- `GET /accounts/:addr` → `owner` (G…, `get_owner`) ve `policy.pairIds` (çiftlerin kontrat adresleri). Konsol düzenlemeyi yalnızca `owner === bağlı cüzdan` iken açar; politika yeniden yazılırken çiftler adresleriyle gerekir.

Yazma yolu (`app.mandate/lib/account.ts`): `set_policy` / `freeze` / `unfreeze` kaydetme modunda simüle edilir, hesabın auth girdisinin önimajı cüzdanın `signAuthEntry`'siyle imzalanır, 64 baytlık imza `Sig::Owner(BytesN<64>)` olarak yerleştirilir, imzalı hâli yeniden simüle edilir (`__check_auth` burada çalışır) ve gönderilir. Yönetimi bir controller'a devredilmiş hesaplarda (kredi hattı) düzenleme kapalıdır: kontrat sahip imzasını değil controller'ı arar.

Testnet'te aynı kodlamayla doğrulandı (20 Eylül): kurulum `93dade11…`, `set_policy` `01633b1a…`, `freeze` `f8588362…`; örnek hesapta özdeş politika yazımı `bc1f9fb4…`. Doğrulanmayan tek halka cüzdan uzantısının kendisidir (başsız tarayıcıda Freighter yok); imzanın üretildiği yer dışında yol birebir aynıdır.

## 23. EK (20 Eylül, Hat 3): herkese açık servis olarak sertleştirme

Facilitator herkese açık bir adreste duruyor ve zincir ücretini bizim anahtarımız ödüyor. Denetimde çıkan açıklar ve kapatılışları:

- **Demo kontrolleri.** `POST /demo/agent/run` ve `POST /demo/owner/freeze` sunucunun anahtarıyla zincire yazar. `DEMO_CONTROL_KEY` tanımlıysa `x-demo-key` başlığı zorunludur (`timingSafeEqual`), ayrıca uç başına bekleme süresi vardır ve ikisi de OpenAPI'de görünmez. Anahtar yoksa açılışta uyarı basılır. `GET /demo/info` → `demoKeyRequired` ile konsol bunu öğrenir.
- **IP başına hız sınırı.** `IP_RATE_LIMIT_PER_MINUTE` genel, `IP_COSTLY_LIMIT_PER_MINUTE` ise zincir ücreti harcatan ya da kayıt yazan POST uçları için (`/demo/*`, `/channels/:id/claim`, `/receipts/:id/attest`, `/v1/report`). `trust proxy` açık, `x-powered-by` kapalı, temel güvenlik başlıkları ekli.
- **Katalog zehirlenmesi.** `INSERT … ON CONFLICT` artık `payTo` alanını DEĞİŞTİRMEZ; 1 stroop'luk geçerli bir kuponla bir başkasının kaynağını kendi adresine yönlendirmek mümkün değil.
- **Elle tahsilat.** Kanal başına 20 saniye bekleme. Tahsilat işlemleri tek kuyruktan geçiyor; art arda çağrı hem ücret harcatır hem gerçek tahsilatların önüne geçerdi.
- **Akış oturumları.** Aynı akış için ikinci bir bekleyen geldiğinde ilki `aborted` ile çözülür; eskiden HTTP isteği sonsuza dek asılı kalıyordu.
- **Makbuz taahhüdü.** `POST /receipts/:id/attest` yalnızca makbuz kesildikten sonraki 60 saniye içinde ve bir kez kabul edilir. Satıcı imzası bir sonraki sürümde; sınır kodda yazılı.
- **Parametre doğrulama.** `src/common/params.ts` (`intParam`, `amountParam`, `addressParam`) altı uçta kullanılıyor; bozuk `limit`, `days`, `slippageBps` ya da adres artık 500 değil 400 döner.
- **Sohbet.** İstem 2000 karakterle sınırlı (çıktı dilimleri ücretli, istem değil).
- **SSE.** `/events` IP başına `SSE_MAX_PER_IP`, toplamda 200 bağlantı kabul eder.
- **Makbuz kuyruğu.** Yazma başarısız olursa parti geri kuyruğa alınır (en çok 5000); istemci imzalı makbuzu çoktan almış oluyordu, sessizce kaybolmasın.
- **Hata sızıntısı.** `/health` artık RPC'nin ham hata metnini değil yalnızca `chainOk: false` bayrağını döner.
- **İndeksler.** `20260920090500_query_indexes`: denetim defteri (`Event(account, id)`), gelir dökümü (`Event(type, channelId, createdAt)`), makbuz listeleri ve katalog tazeliği.

Kapatılmayanlar, bilerek: `/v1/report` işlemin gerçekten o hesaba ait olduğunu doğrulamıyor (yalnızca tekrar koruması var), akış oturumları için satıcıya özel gizli anahtar yok ve zincir olayları yeniden başlatmada kurtarılmıyor. Üçü de `docs/MAINNET.md`'deki "ana ağ öncesi" listesinde.
