# Reinkey — Stellar'da sayaçlı x402 ve ajan harcama yetkisi

**Durum:** v3, yön kilitlendi, geliştirmeye hazır
**Tarih:** 19 Eylül 2026
**Etkinlik:** Stellar Pro Hackathon, İstanbul, 19–20 Eylül, Genesis track
**Ağ:** Stellar testnet (Soroban)
**Önceki sürümler:** `proje-tanimi.v1.md` (ajan-yerli borsa), `proje-tanimi.v2.md` (Mandate + intent borsası)

### v2'den v3'e ne değişti

| Konu | v2 | v3 |
|---|---|---|
| Ürün | Ajan-yerli borsa + yetki katmanı | **Ödeme rayı:** sayaçlı x402 + yetki hesabı |
| Kendi borsamız, matcher, `settlement` kontratı, intent eşleştirme | Çekirdek | **Çıkarıldı** (mentör geri bildirimi: "kendi DEX'ini mi yapıyorsun?") |
| x402 kupon kanalı | Ek hedef | **Çekirdek** |
| Mandate hesabı | Çekirdek | Çekirdek (kanalı açan cüzdan) |
| Finans katmanı | Yok | **Kredi havuzu**, ek hedef (mentör geri bildirimi: "finansal sos") |
| Ad | Mandate (.com dolu) | **Reinkey** (.com, .io, .dev, .app, .xyz, npm boş; 19 Eylül kontrolü) |

---

## 1. Tek cümle

Stellar'ı ajan ekonomisinin ödeme rayı yapıyoruz: ajan tek işlemle bir kanal açar, milisaniyede binlerce kez öder, satıcı tek işlemle tahsil eder ve ajanın harcama sınırını sunucu değil zincir uygular.

### Üç cümlelik anlatım (mentör / jüri)

Bugün Stellar'da her x402 ödemesi ayrı bir zincir işlemidir ve 5 saniye bekler; token başına ya da saniye başına ödeme bu yüzden mümkün değil. Biz Soroban üzerinde bir ödeme kanalı, ona bağlı yeni bir x402 şeması ve herkesin kullanabileceği bir facilitator kuruyoruz: 1000 ödeme zincirde 2 işlem eder. Ajanın cüzdanı, tavanı ve izinli alıcıları zincirde yazılı bir akıllı hesaptır; ajana anahtarı veririz, dizgin sahibinde kalır.

### Slogan

*Give your agent the keys. Keep the reins.*

### Neden Stellar için değerli

- **Eksik parça:** x402'nin toplu uzlaşması Stellar'da ertelenmiş durumda. SDF'nin SCF RFP track'inde açık başlık var: x402 facilitator + Bazaar.
- **Zayıflığı kapatıyor:** 5 saniyelik ledger, Stellar'ın x402'deki en zayıf yanı. Kanalla ödeme ledger'ı beklemez.
- **Altyapı, uygulama değil:** tek satırlık middleware ile Stellar'daki her API sayaçlı ödeme kabul eder. Başkaları üstüne inşa eder.
- **İddia sınırı:** "dünyada ilk" denmez. Başka zincirlerde ertelenmiş ödeme önerileri var ve güncel durumları doğrulanmadı. İddia: **"Stellar'da ilk, ve canlı çalışıyor."**

---

## 2. Bugünkü x402 ile karşılaştırma

| | x402 `exact` (bugün) | Reinkey `channel` |
|---|---|---|
| Çağrı başına zincir işlemi | 1 | 0 |
| Ödeme gecikmesi | ~5 sn (ledger) | Milisaniye (imza doğrulama) |
| 1000 çağrının zincir maliyeti | 1000 işlem | 2 işlem (aç + tahsil) |
| 1000 çağrının süresi (seri) | ~83 dakika | Saniyeler |
| Token / saniye başına ödeme | Pratik değil | Var (dilimli akış) |
| Ajanın harcama sınırı | Yok, ya da sunucuda | Zincirde (`__check_auth`) |
| Satıcı entegrasyonu | Middleware | Aynı middleware, şema eklenir |

83 dakika ve maliyet rakamları demo öncesi testnette ölçülerek doğrulanacak.

---

## 3. Mimari

```
 Sahip ──kurar──▶ Reinkey Account (C-adresi: fon + politika, __check_auth)
                        │ open / top_up (tek tx, tavandan düşer)
                        ▼
 Ajan (SDK) ─kupon─▶ Satıcı API + meter() ─verify─▶ Facilitator ─claim─▶ channel kontratı
    ▲                     │ veri / token akışı          │                      │
    └─────────────────────┘                             ├─▶ Postgres (denetim) │
                                                        └─▶ SSE ─▶ Panel       ▼
                                                                          USDC SAC
 Ek hedef:  Yatırımcı ─▶ credit-pool ─kredi limiti─▶ Reinkey Account (sahibi havuz)
```

**Zincir üstü (güven):** `reinkey-account`, `channel`, (ek hedef) `credit-pool`.
**Zincir dışı (hız):** facilitator, kupon doğrulama, satıcı middleware'i, denetim defteri, panel.

### 3.1 Kontrat: `reinkey-account`

Ajan başına bir akıllı hesap. Fonu tutar ve politikayı uygular. C-adresi olduğu için **trustline gerekmez**.

```rust
struct Policy {
    agent_key: BytesN<32>,        // ajanın ed25519 açık anahtarı
    per_tx_cap: i128,             // tek transfer / tek kanal depozitosu tavanı
    daily_cap: i128,              // günlük toplam çıkış
    payees: Vec<Address>,         // izinli alıcılar: satıcılar + channel kontratı
    channel: Address,             // güvenilen channel kontratı
    expires_ledger: u32,
}
owner: Address | BytesN<32>       // sahip; politikayı değiştirir, fonu çeker
spent: (u32 day, i128 amount)     // day = ledger_seq / 17280
frozen: bool                      // sahip ya da (ek hedef) havuz dondurabilir

enum Sig { Owner(BytesN<64>), Agent(BytesN<64>) }
```

`__check_auth` kuralları (Agent imzası için, her auth bağlamı tek tek):

| Bağlam | Kontrol |
|---|---|
| `USDC.transfer(self, to, amt)` | `to ∈ payees`, `amt ≤ per_tx_cap`, `spent + amt ≤ daily_cap`; `spent` güncellenir |
| `channel.open(self, payee, …)` / `channel.top_up(…)` | `payee ∈ payees`; tutar kontrolü iç içe gelen `transfer` bağlamında yapılır (çift sayım olmaz) |
| Diğer her şey | `CONTEXT_NOT_ALLOWED` |

Ortak kontroller: imza geçerli, `!frozen`, `ledger ≤ expires_ledger`. Owner imzası hepsini geçer.

**Kritik sonuç:** zincir dışı kupon harcaması, zincirde kilitlenen depozitoyla sınırlıdır ve depozito tavandan düşer. Kanal politikayı delmez.

### 3.2 Kontrat: `channel`

Tek yönlü ödeme kanalı (ödeyen → satıcı).

```rust
fn open(payer: Address, payee: Address, asset: Address, deposit: i128,
        voucher_key: BytesN<32>, expiry_ledger: u32) -> u64      // payer.require_auth()
fn top_up(id: u64, amount: i128)                                  // payer.require_auth()
fn claim(id: u64, cumulative: i128, sig: BytesN<64>)              // herkes çağırabilir, para payee'ye gider
fn close(id: u64)                                                 // payee: hemen; payer: expiry + grace sonrası
fn get(id: u64) -> Channel { payer, payee, asset, deposit, claimed, voucher_key, expiry_ledger, open }
```

- **Kupon:** `ed25519(voucher_key, sha256("reinkey:voucher:v1" ‖ sha256(passphrase) ‖ channel_contract_id ‖ id_u64_be ‖ cumulative_i128_be))`. Alan ayrımı sayesinde kupon başka ağda ya da başka kanalda geçmez. Bayt düzeni ve ortak test vektörü: `docs/BACKEND.md` §3.1–3.2.
- **Kümülatif tutar** tek yönlü artar: `claim` yalnızca `cumulative > claimed` ve `cumulative ≤ deposit` ise `cumulative − claimed` kadar öder. Çift harcama yapısal olarak imkânsız.
- **Satıcı riski:** kuponu `expiry_ledger`'dan önce tahsil etmezse kaybeder. Facilitator bunu izler ve süre dolmadan otomatik `claim` eder.
- **Ödeyen riski:** kalan depozito `expiry + grace` sonrası `close` ile geri alınır. Satıcı kanalı erken kapatırsa kalan hemen döner.
- `voucher_key` ajan anahtarıyla aynı olabilir; SDK varsayılanı kanal başına ayrı bir oturum anahtarıdır.

### 3.3 x402 şeması: `channel`

402 yanıtı (`exact` yedeğiyle birlikte):

```json
{ "x402Version": 2, "accepts": [
  { "scheme": "channel", "network": "stellar:testnet", "asset": "C…USDC", "payTo": "G…|C…",
    "price": "0.0005", "unit": "request",
    "extra": { "channelContract": "C…", "minDeposit": "0.50", "facilitator": "https://…", "areFeesSponsored": true } },
  { "scheme": "exact", "network": "stellar:testnet", "asset": "C…USDC", "payTo": "…", "maxAmountRequired": "0.0005" }
]}
```

Ödeme yükü: `{ "channelId": 42, "cumulative": "0.0135", "signature": "…" }`
Yanıt makbuzu: `{ "channelId": 42, "accepted": "0.0135", "remaining": "0.4865" }`

`unit` değerleri: `request` (çağrı başına) ve `token` / `second` (akış). Header adları ve şema genişletme noktası, kurulan `@x402/*` paket sürümünden doğrulanacak.

**Dilimli akış (`token`, `second`):** istemci akış boyunca küçük dilimler hâlinde (ör. 50 token'lık) yeni kupon gönderir: `POST /channel/{id}/voucher`. Satıcı yalnızca ödenmiş dilim kadar ileri gider. Böylece **iki tarafın da riski en fazla bir dilimdir**: satıcı ödenmemiş en çok bir dilim üretir, ajan kullanılmamış en çok bir dilim öder. Depozito biterse akış cümlenin ortasında kesilir (`CHANNEL_EXHAUSTED`).

### 3.4 Facilitator ve middleware

Facilitator (barındırılan, NestJS):
- x402 facilitator API'si: `POST /verify`, `POST /settle`, `GET /supported` (`exact` + `channel`).
- Kanal durumu önbelleği (zincirden okur, olayları izler), kupon doğrulama, en yüksek kuponu saklama.
- Tahsilat politikası: eşik (birikmiş tutar ≥ X), periyot (her N dakika), süre dolumuna yakınlık. Tüm zincir ücretlerini sponsorlar.
- Satıcı kaydı ve katalog: `GET /discovery/resources` (Bazaar uyumlu; ek hedef).

Middleware (`@reinkey/x402`): Express ve NestJS için.

```ts
app.get("/book", meter({ price: "0.0005", unit: "request" }), handler);
app.post("/chat", meter({ price: "0.00002", unit: "token" }), streamHandler);
```

`exact` şeması `@x402/stellar` ile süreç içinde (self-facilitation) çalışır.

### 3.5 Ek hedef: `credit-pool`

**Fikir: kaçamayan sermaye.** Reinkey Account'taki fon yalnızca izinli adreslere gidebildiği için, o hesaba konan parayla kaçılamaz. Kaçılamıyorsa teminat gerekmez: ajana **teminatsız kredi limiti** verilebilir.

```rust
fn deposit(from, amount) -> shares        // SEP-41 pay token'ı basılır
fn withdraw(from, shares) -> amount
fn open_line(agent_key, limit) -> Address // sahibi havuz olan Reinkey Account kurar ve fonlar
fn repay(account, amount)
fn freeze_and_recall(account)             // sağlık eşiği altındaysa: dondur, kalan fonu geri çek
```

- Kredi hesabının `payees` listesi: izinli satıcılar, `channel`, havuzun kendisi. Ajanın kendi cüzdanı listede **yok**.
- Pay token'ı SEP-41 olduğu için SDEX / Soroswap'ta alınıp satılabilir.
- Anlatı: *"AI ajanları için ilk kredi kartı; limitini banka değil zincir uygular."*
- Yetişmezse sunumda yol haritası olarak **tek slayt** anlatılır, demo edilmez.

### 3.6 Sebep kodları

Her red `{ "error": CODE, "source": "gateway | facilitator | chain", "tx"?: hash }` biçimindedir. Boş sebep yok.

```
Zincir (reinkey-account)          Zincir (channel)            Zincir dışı
 1 BAD_SIGNATURE                  20 CHANNEL_NOT_FOUND        VOUCHER_BAD_SIGNATURE
 2 POLICY_EXPIRED                 21 CHANNEL_CLOSED           VOUCHER_NOT_INCREASING
 3 ACCOUNT_FROZEN                 22 VOUCHER_BAD_SIGNATURE    VOUCHER_UNDERPAID
 4 CONTEXT_NOT_ALLOWED            23 VOUCHER_NOT_INCREASING   CHANNEL_EXHAUSTED
 5 PAYEE_NOT_ALLOWED              24 EXCEEDS_DEPOSIT          CHANNEL_EXPIRING
 6 PER_TX_CAP_EXCEEDED            25 NOT_EXPIRED              RATE_LIMITED
 7 DAILY_CAP_EXCEEDED             26 NOT_AUTHORIZED           PAYMENT_REQUIRED
```

---

## 4. Yüzeyler

### 4.1 Facilitator API

```
POST /verify                    x402: ödeme yükünü doğrula (exact | channel)
POST /settle                    x402: uzlaştır (exact: hemen; channel: kuyruğa al)
GET  /supported                 Desteklenen şema ve ağlar
GET  /channels/{id}             Kanal durumu: depozito, tahsil edilen, en yüksek kupon, kalan
POST /channels/{id}/voucher     Akış sırasında dilim kuponu
POST /channels/{id}/claim       Elle tahsilat tetikleme (satıcı)
GET  /accounts/{addr}           Politika, günlük harcama, kalan bütçe, açık kanallar
GET  /accounts/{addr}/ledger    Ödeme, kupon, tahsilat ve red geçmişi
GET  /events                    SSE: panel akışı
GET  /stats                     Sayaçlar: kupon sayısı, zincir işlemi sayısı, exact karşılaştırması
GET  /llms.txt  /openapi.json   Keşif
POST /mcp                       MCP sunucusu (streamable HTTP)
GET  /discovery/resources       Satıcı kataloğu (ek hedef)
```

### 4.2 Demo satıcı API'si (facilitator'dan ayrı modül, `meter()` ile korunur)

```
GET  /demo/book?pair=USDC_XLM   Çağrı başına 0,0005 USDC   (unit: request)
POST /demo/chat                 Token başına 0,00002 USDC  (unit: token, SSE akışı)
```

`/demo/chat` gerçek bir LLM'e bağlanır (Claude API); anahtar yoksa hazır metni token token akıtan yedek mod çalışır. Demo ağa bağımlı kalmasın diye yedek mod **sahnede varsayılandır**.

### 4.3 SSE olayları (panel ve denetim defteri aynı kaynaktan beslenir)

```
channel.opened   { channelId, payer, payee, deposit, tx }
voucher.accepted { channelId, cumulative, delta, unit, latencyMs }
voucher.rejected { channelId, code }
channel.claimed  { channelId, amount, vouchersCovered, tx }
channel.closed   { channelId, refunded, tx }
payment.exact    { payer, payee, amount, tx }
chain.rejected   { account, code, tx }
policy.updated   { account, policy, tx }
```

### 4.4 Makineye satan servisin kuralları

- Kayıt ekranı, onboarding, API anahtarı yok. Tek yüzey HTTP.
- Ücretleri facilitator sponsorlar; ajanın XLM tutması gerekmez (`extra.areFeesSponsored`).
- Çıktı deterministik ve sürümlü (`/v1`).
- Servis kendini üç formatta tanıtır: OpenAPI, `llms.txt`, MCP.

---

## 5. Politika (demo değerleri)

| Kural | Değer | Nerede |
|---|---|---|
| Günlük harcama tavanı | 5 USDC | Zincir |
| Tek transfer / depozito tavanı | 1 USDC | Zincir |
| Alıcı beyaz listesi | demo satıcı, `channel` | Zincir |
| Politika süresi | 7 gün | Zincir |
| Kanal ömrü | 1 saat + 10 dk grace | Zincir |
| Çağrı sıklığı | dakikada 600 | Zincir dışı |

Değerler bilerek küçük: demo sırasında tavana çarpmak birkaç saniye sürsün. Kural tanımları `packages/core`'da zincirden bağımsız durur.

---

## 6. Depo yapısı ve iş bölümü

Klasör adları hackathon boyunca değişmez (yeniden adlandırma sonrasına).

```
ArgusPay/
  contracts/                 Cargo workspace                          ── HAT 1
    reinkey-account/
    channel/
    credit-pool/             (ek hedef)
  packages/
    core/                    Kupon kodlama/hash, sebep kodları, tipler, politika tanımları
    sdk/                     @reinkey/sdk: hesap kurulumu, kanal, kupon, x402 fetch
    x402/                    @reinkey/x402: meter() middleware
    bindings/                stellar contract bindings typescript çıktısı
  agents/                    Demo ajanları + kötü niyetli senaryolar
  scripts/                   Hesaplar, USDC, deploy, politika kurulumu
  backend/                   NestJS: facilitator, demo satıcı, denetim, keşif   ── HAT 2
  app.mandate/               Canlı denetim paneli (Next.js)                     ── HAT 3
  landing-page/              Tanıtım sitesi (Next.js, mevcut)                   ── HAT 4
  docs/                      Hat görev dosyaları (BACKEND.md, PANEL.md, LANDING.md)
```

| Hat | Kim | Kapsam |
|---|---|---|
| 1 | Ana Claude | Kontratlar, `core`, `sdk`, `x402`, ajanlar, kurulum betikleri |
| 2 | Backend Claude | `backend/` (görev dosyası: `docs/BACKEND.md`) |
| 3 | Ana Claude | `app.mandate/` (panel; README içinde) |
| 4 | Landing Claude | `landing-page/` (görev dosyası: `docs/LANDING.md`) |

**Hatlar arası sözleşme:** bu belgenin 3.3, 3.6, 4.1 ve 4.3 bölümleri. Backend, kontratlar hazır olmadan ilerleyebilsin diye zincir erişimini bir `ChainPort` arayüzünün arkasına koyar; ilk gün bellek içi sahte uygulamayla çalışır, kontrat kimlikleri ortam değişkeninden gelir. Panel de backend hazır olmadan sahte SSE kaynağıyla geliştirilir.

**Kritik tutarlılık noktası:** kupon hash'i TS ve Rust'ta bayt bayt aynı olmalı. `packages/core` içinde, Rust testinden alınan sabit vektörle karşılaştıran test ilk iş yazılır.

---

## 7. Stellar'a özgü kısıtlar ve riskler

| Risk | Ne zaman belli olur | Plan B |
|---|---|---|
| C-adresi `@x402/stellar` `exact` ödeyeni olamıyor | İlk spike | `exact` yalnızca G-hesaplı yedek olur; ana yol zaten `channel` |
| `__check_auth` iç içe bağlamları (open → transfer) beklediğimiz gibi görmüyor | İlk spike | Tutar kontrolünü `open` bağlamının argümanından yap |
| Kupon hash uyuşmazlığı TS/Rust | İlk gün testi | Ham bayt dizisi imzala (XDR yok) |
| ed25519 doğrulama + depolama instruction limitini zorluyor | Simülasyon | Beklenmiyor (tek doğrulama); ölçülür |
| Depolama TTL'i: kanal ve politika kayıtları evict olur | Tasarım | `open`/`claim` TTL uzatır; kurulum betiği uzun TTL yazar |
| Sequence number darboğazı (facilitator claim'leri) | Yük altında | 3–4 kaynak hesaplık havuz |
| Testnet dalgalanır | Demo günü | Yerel `stellar/quickstart` konteyneri |
| LLM API'si sahnede yavaş ya da erişilemez | Demo günü | Yedek akış modu varsayılan |
| Canlı demo çöker | Sahnede | 90 saniyelik önceden çekilmiş video |

**Doğrulanacak rakamlar** (sunumdan önce, kaynağından ya da ölçümle): ledger kapanış süresi, işlem başına maliyet, ağ limitleri (`lab.stellar.org/network-limits`), x402 toplu uzlaşmanın Stellar'daki güncel durumu, SCF RFP başlığının hâlâ açık olduğu.

---

## 8. Teknik yığın

```
Ağ:        Stellar testnet  (RPC: https://soroban-testnet.stellar.org)
Varlık:    testnet USDC SAC
Kontrat:   Rust 1.87 + soroban-sdk, hedef wasm32v1-none, stellar-cli 23
Ödeme:     @x402/stellar (exact) + kendi channel şemamız
Sunucu:    NestJS 11 (Express), TypeScript, Prisma + Postgres (yerelde Docker)
Panel:     Next.js, SSE
Keşif:     llms.txt, @nestjs/swagger, @modelcontextprotocol/sdk
Ajanlar:   Node 24 + @reinkey/sdk
Paketler:  pnpm workspace (packages/*, agents)
```

Araçların hepsi makinede kurulu (19 Eylül kontrolü).

---

## 9. Plan

Teslim saati kesinleşince saatler buna göre kaydırılır. Plan dört paralel hatla yürür; aşağıdaki Hat 1'dir. Diğer hatların planı kendi görev dosyalarındadır.

| Blok | İş (Hat 1) | Blok sonunda elde |
|---|---|---|
| 0–2 s | Workspace, kurulum betiği, testnet hesapları, USDC. **Spike'lar:** (a) özel `__check_auth` + iç içe bağlam, (b) TS'te imzalanan kuponun Rust'ta doğrulanması | İki spike'ın sonucu |
| 2–5 s | `channel` kontratı + testler + testnet deploy; `core` kupon modülü ve test vektörü | Zincirde aç → kupon → `claim` → `close` |
| 5–8 s | `reinkey-account` + testler + deploy; bindings | Zincirden reddedilen transfer ve kanal açılışı |
| 8–10 s | `sdk` (hesap, kanal, kupon, x402 fetch) + `x402` middleware; backend ile entegrasyon | Uçtan uca: ajan → `meter()` → facilitator → `claim` |
| — | Uyku (en az 4 saat) | — |
| 10–13 s | Demo ajanları, dilimli token akışı, kötü niyetli senaryolar | Kendi kendine dönen demo |
| 13–15 s | Panel ve landing entegrasyonu, canlıya alma, rakam doğrulama | Jüriye verilecek URL |
| 15–17 s | **Ek hedef:** `credit-pool` (yalnızca her şey yeşilse) | Krediyle açılan kanal |
| Son 3 s | Sunum, yedek video, teslim. Yeni özellik yok | Teslim edilmiş proje |

**Kesme sırası** (en önce kesilen başta): `credit-pool` → Bazaar kataloğu → MCP (llms.txt + OpenAPI kalır) → gerçek LLM bağlantısı (yedek akış kalır) → `token` birimi (yalnızca `request` kalır) → landing güncellemesi. **Hiçbir koşulda kesilmeyen çekirdek:** `channel` + `reinkey-account` + facilitator + panelde canlı sayaç.

**Kurallar:** sunumdan 4 saat önce ne çalışıyorsa proje odur. Son 3 saatte yalnızca düzeltme yapılır.

---

## 10. Demo senaryosu (yaklaşık 2,5 dakika)

1. **Yetki.** Sahip bir Reinkey Account kurar: günde 5 USDC, tek seferde 1 USDC, yalnızca demo satıcıya. Ajan hiçbir yere kayıt olmamış, API anahtarı almamış.
2. **Kanal.** Ajan 1 USDC'lik kanal açar. Ekranda tek bir işlem hash'i görünür.
3. **Sayaç.** Ajan `/demo/chat`'e soru sorar. Yanıt token token akarken paneldeki sayaç kuruş kuruş ilerler. Yan sayaç: **kupon 400+, zincir işlemi 0.**
4. **Karşılaştırma.** Panelde canlı hesap: aynı iş `exact` ile kaç işlem ve kaç dakika sürerdi.
5. **Kesinti.** Depozito biter, akış **cümlenin ortasında** durur: `CHANNEL_EXHAUSTED`.
6. **Zincirden red 1.** Ajan yeni bir kanal açmak ister ama günlük tavan dolmuştur: `DAILY_CAP_EXCEEDED`, zincirden, başarısız işlem hash'iyle.
7. **Zincirden red 2.** Ele geçirilmiş ajan senaryosu: ajan parayı kendi cüzdanına göndermeye çalışır: `PAYEE_NOT_ALLOWED`. *"Anahtar ajanda, dizgin sizde."*
8. **Tahsilat.** Satıcı tek `claim` işlemiyle 400+ kuponu tahsil eder. Toplam: **2 zincir işlemi.**
9. (Ek hedef) **Kredi.** Aynı akış, teminatsız kredi limitinden fonlanan bir hesapla.

**Kapanış cümlesi:** Bu bir video değil, şu anda canlı bir URL. Herhangi bir API'ye tek satırla eklenir; jürinin kendi ajanı da MCP üzerinden bağlanabilir.

**Sunumda söylenmeyecekler:** teknik zorluklar, yetişmeyen özellikler, yol haritası detayı. Soru gelirse cevaplanır.

**Hazır cevaplar:**
- *"Kendi DEX'inizi mi yapıyorsunuz?"* Hayır. Ödeme rayı ve yetki hesabı yapıyoruz; ajan bununla istediği serviste harcar.
- *"Neden Stellar?"* Özel hesap auth'u (`__check_auth`), ücret sponsorluğu ve sentin kesri işlem maliyeti. Üçü birlikte başka yerde yok.
- *"Satıcı kuponu tahsil etmeden kanal kapanırsa?"* Ödeyen ancak süre + grace sonrası kapatabilir; facilitator süre dolmadan otomatik tahsil eder.
- *"Facilitator'a güvenmek gerekiyor mu?"* Hayır. Kuponu herkes doğrulayabilir, `claim`'i herkes çağırabilir, para yalnızca satıcıya gider.

---

## 11. Kapsam dışı ve hukuk

**Kapsam dışı:** kendi borsamız ve emir eşleştirme, KYC, fiat giriş/çıkış, mainnet, çift yönlü kanallar, çok atlamalı (multi-hop) kanal ağı, fiyat oracle'ı.

**Hukuk:** çekirdek ürün emanetsiz bir ödeme altyapısıdır; fon ya ödeyenin hesabında ya da kanal kontratında kilitlidir, facilitator paraya dokunamaz. Borsa bileşeninin çıkması v2'deki SPK/7518 riskini büyük ölçüde kaldırır. **Kredi havuzu ayrı bir hukuki sorudur** (kaynak toplama, pay token'ının niteliği); mainnet ya da ücretli pilot öncesi avukat görüşü alınır. Teslimde "testnet, emanetsiz protokol" ifadesi kullanılır.

---

## 12. Zincir bağımsızlığı

**Stellar'a gömülü:** `reinkey-account` (`__check_auth`), `channel`, ücret sponsorluğu, SAC.
**Zincirden bağımsız:** `channel` şemasının tel biçimi, kupon mantığı, facilitator API'si, middleware, denetim defteri, panel, SDK arayüzü.

Sunumda: "Stellar için yaptık, çünkü bu ürünü mümkün kılan üç şey burada bir arada."

---

## 13. Hackathon sonrası

**Ürün.** Barındırılan facilitator + `@reinkey/x402` middleware + `@reinkey/sdk` + hesap/kanal kontrat standardı.

**Gelir.** Satıcılardan aylık taban (facilitator, panel, denetim) + tahsil edilen hacimden küçük bir pay. İleride kredi havuzundan faiz marjı.

**Grant.** SCF Build Award, RFP track: x402 facilitator + Bazaar. Hackathon çıktısı doğrudan başvuru malzemesi. Kontratlar için Audit Bank. x402 spesifikasyonuna `channel` şeması önerisi (PR).

**İlk 90 gün.** 0–30: Stellar ekosistemindeki 10 API sahibi ve ajan geliştiricisiyle görüşme. 30–90: bir ücretli pilot. Ücretsiz kullanım verilmez.

**İlk dağıtım kanalı.** Mevcut freelance müşteri portföyü + Stellar geliştirici topluluğu.

---

## 14. Kaynaklar

- Stellar dokümanı: https://developers.stellar.org
- Ajan için indeks: https://developers.stellar.org/llms.txt
- Stellar skill'leri: https://skills.stellar.org
- x402 protokolü: https://github.com/x402-foundation/x402
- Stellar x402 paketi: https://www.npmjs.com/package/@x402/stellar
- SDF x402 araçları: https://github.com/stellar/x402-stellar
- Ağ limitleri: https://lab.stellar.org/network-limits
- SCF RFP track: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track

---

## 15. Kararlar

- [x] Yön: sayaçlı x402 (kanal) + yetki hesabı; kendi borsamız yok
- [x] Ad: Reinkey (ilk iş: reinkey.com satın al; TÜRKPATENT / USPTO kontrolü yapılmadı)
- [x] Sunucu: mevcut NestJS iskeleti, Postgres
- [x] Yüzeyler: panel, landing, llms.txt + OpenAPI + MCP
- [x] Kredi havuzu: ek hedef, yetişmezse tek slayt
- [ ] Teslim saati (plan buna göre kaydırılacak)
- [ ] Canlıya alma: backend + Postgres nerede barınacak
- [ ] `/demo/chat` için Claude API anahtarı var mı (yoksa yedek akış modu)
