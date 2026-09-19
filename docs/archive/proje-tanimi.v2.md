# Mandate — ajanlar için zincir üstü harcama yetkisi

**Durum:** v2, mimari kararları verildi, geliştirmeye hazır
**Tarih:** 19 Eylül 2026
**Etkinlik:** Stellar Pro Hackathon, İstanbul, 19–20 Eylül, Genesis track
**Ağ:** Stellar testnet (Soroban)
**Önceki sürüm:** `proje-tanimi.v1.md`

### Verilen kararlar

| Karar | Seçim |
|---|---|
| Proje adı | **Mandate** (alan adı / npm / TÜRKPATENT kontrolü hackathon sonrası) |
| Mimari | **C:** Mandate Account + imzalı niyet (intent) uzlaşması + x402 kupon kanalı |
| Sunucu | Mevcut NestJS iskeleti (`backend/`) |
| Ek yüzeyler | Canlı denetim paneli, landing page güncellemesi, `llms.txt` + OpenAPI + MCP, Postgres denetim defteri |
| İşlem çifti | USDC-XLM (ikisi de SAC üzerinden) |
| Emir ücreti | Sabit, emir başına 0,01 USDC |
| Cüzdan | Ajan: Mandate Account (C-adresi). Sahip: ed25519 anahtar; passkey (secp256r1) zaman kalırsa |

---

## 1. Tek cümle

Ajana özel anahtarını değil, **kapsamı, tavanı ve süresi zincirde yazılı bir yetki** verirsin; ajan bu yetkiyle x402 üzerinden kimseye kayıt olmadan öder ve işlem yapar, yetkinin dışına çıkan her şeyi zincir reddeder.

### Açılış cümlesi (sunum)

Ajanlar para harcamaya başladı, harcamayı durduran katman yok.

### Neden yeni

Bugün ajana ya **anahtarın tamamı** verilir (sınırsız risk) ya da bir **API anahtarı** (her servis için insan onayı, kayıt, panel). Arada zincirin uyguladığı, taşınabilir bir yetki nesnesi yok. Mandate üç şeyi birleştirir:

1. **Mandate Account:** fonu tutan, `__check_auth` ile her imzayı politikaya göre kesen akıllı hesap.
2. **İmzalı niyet (intent) = yetki:** ajanın zincir dışında imzaladığı emir, uzlaşma anında hesabın auth'u olarak kullanılır. Ajan orada olmak zorunda değildir ve operatör ajanın imzalamadığı hiçbir şeyi yapamaz.
3. **x402 kupon kanalı:** zincirde kilitlenen bir depozito üzerinden, zincire gitmeden milisaniyede doğrulanan kümülatif kuponlarla çağrı başına ödeme. Stellar'da bugün olmayan x402 toplu uzlaşmasını kapatır.

Borsa bunun **vitrini**. Satılan ürün Mandate'in kendisi: herhangi bir x402 satıcısıyla ve herhangi bir borsayla çalışan bir yetki standardı ve SDK'sı.

**Jüri cümlesi:** "Borsa bizim, ama paranıza dokunamayız. Bunu siz değil, zincir garanti ediyor."

---

## 2. Klasik borsa ile karşılaştırma

| Katman | Bugünkü borsa | Mandate |
|---|---|---|
| Hesap açma | KYC, e-posta, panel | Yok. Mandate Account adresi kimliktir |
| Erişim | API anahtarı, rate limit | x402, çağrı başına ödeme |
| Piyasa verisi | Aylık abonelik | Kupon kanalıyla çağrı başına, milisaniyede |
| Emir gönderme | Ücretsiz, komisyon işlemden | İmzalı intent + 0,01 USDC x402 ücreti |
| Bakiye | Borsa cüzdanında, emanet | Ajanın kendi hesabında, emanet yok |
| Yetki | Panelden anahtar izinleri | Mandate, zincir üstünde |
| Operatöre güven | Tam | **Yok**: operatör yalnızca ajanın imzaladığını yürütebilir |
| Uzlaşma | Borsanın iç defteri | Zincirde, gerçekleşen her dolumda |
| Komisyon modeli | Maker/taker yüzdesi | Emir başına sabit mikro ücret |

---

## 3. Mimari

```
                 ┌──────────── zincir dışı (hız) ─────────────┐
 Ajan (SDK) ───▶ │ Gateway (x402: exact + channel)            │
   │  intent     │ Matcher (bellek içi defter, fiyat-zaman)   │──▶ Postgres (denetim)
   │  kupon      │ Settler (tx kurar, ücreti sponsorlar)      │──▶ SSE ──▶ Panel
   │             │ MCP / OpenAPI / llms.txt                   │
   │             └────────────────────┬───────────────────────┘
   │                                  │ settle / claim
   ▼                 ┌──────────── zincir üstü (güven) ───────┴───┐
 Mandate Account ◀── │ settlement   : intent eşleştirme, dolum    │
 (fon + politika)    │ channel      : depozito, kupon tahsili     │
   __check_auth ────▶│ USDC SAC, XLM SAC                          │
                     └────────────────────────────────────────────┘
```

### 3.1 Kontrat: `mandate-account`

Ajan başına bir akıllı hesap (C-adresi). Vault ile politika **tek kontrattır**. C-adresleri SAC bakiyesini doğrudan tuttuğu için **trustline gerekmez**.

**Depolama:**

```rust
struct Mandate {
    agent_key: BytesN<32>,          // ajanın ed25519 açık anahtarı
    per_tx_cap: i128,               // 5 USDC
    daily_cap: i128,                // 50 USDC (USDC cinsinden, XLM bacağı fiyattan çevrilmez; bkz. 3.5)
    payees: Vec<Address>,           // gateway payTo, channel kontratı
    settlement: Address,            // güvenilen uzlaşma kontratı
    pairs: Vec<Symbol>,             // USDC_XLM
    expires_ledger: u32,
}
owner: BytesN<32>                   // sahip; her şeye yetkili, mandate'i değiştirir
spent: (u32 day, i128 amount)       // day = ledger_seq / 17280
```

**İmza türleri ve `__check_auth`:**

```rust
enum Sig {
    Owner(BytesN<64>),                       // payload imzası → her şey serbest
    Agent(BytesN<64>),                       // payload imzası → yalnızca mandate içinde
    Intent(Intent, BytesN<64>),              // payload'a değil intent'e imza → yalnızca settle
}
```

| İmza | Kabul edilen bağlamlar | Kontroller |
|---|---|---|
| `Owner` | Hepsi | ed25519(payload) |
| `Agent` | `USDC.transfer(self, to, amt)`, `channel.open(self, ...)` | ed25519(payload), `to ∈ payees`, `amt ≤ per_tx`, `spent+amt ≤ daily`, süre |
| `Intent` | `settlement.settle(...)` ve onun alt çağrısı olan SAC transferleri | ed25519(sha256(intent_xdr)), bağlam argümanları intent ile birebir aynı, çift izinli, dolum ≤ per_tx, günlük tavan, `intent.expiry ≥ ledger` |

`Intent` imzası auth payload'ını değil intent'i doğrular. Bu yüzden ajanın uzlaşma anında orada olması gerekmez. Tekrar oynatma koruması, settlement kontratındaki dolum sayacıyla sağlanır (bkz. 3.2). `__check_auth` kendi depolamasına yazabildiği için `spent` sayacı burada güncellenir.

**Hata kodları** (`#[contracterror]`, panelde ve API'de sebep kodu olarak görünür):

```
1 NOT_OWNER            5 PAYEE_NOT_ALLOWED     9  INTENT_MISMATCH
2 BAD_SIGNATURE        6 PER_TX_CAP_EXCEEDED   10 INTENT_EXPIRED
3 MANDATE_EXPIRED      7 DAILY_CAP_EXCEEDED    11 PAIR_NOT_ALLOWED
4 CONTEXT_NOT_ALLOWED  8 SETTLEMENT_UNTRUSTED
```

### 3.2 Kontrat: `settlement`

```rust
struct Intent {
    account: Address,       // Mandate Account
    pair: Symbol,           // USDC_XLM
    side: Side,             // Buy | Sell (baz varlık XLM)
    price: i128,            // 1 XLM kaç USDC, 7 ondalık
    amount: i128,           // XLM, 7 ondalık
    nonce: u64,
    expiry_ledger: u32,
}

fn settle(maker: Intent, taker: Intent, fill: i128)
fn cancel(account: Address, intent_hash: BytesN<32>)   // account.require_auth(), dolumu tamama çeker
fn filled(intent_hash: BytesN<32>) -> i128
```

`settle` akışı:
1. Çift aynı, yönler zıt, fiyatlar kesişiyor mu? İşlem fiyatı maker fiyatıdır.
2. Süreler geçerli mi, `filled + fill ≤ amount` sağlanıyor mu (her iki intent için)?
3. `maker.account.require_auth_for_args((hash, fill))` ve aynısı taker için. Böylece SAC transferleri hesabın auth ağacına alt çağrı olarak girer ve `__check_auth` hepsini tek seferde görür.
4. XLM satıcıdan alıcıya, USDC alıcıdan satıcıya aktarılır. `filled` güncellenir (TTL = intent süresi), bir olay yayınlanır.

Eşleştirme izinsizdir: geçerli iki intent'i herkes uzlaştırabilir. Operatörün tek ayrıcalığı defteri tutmaktır.

### 3.3 Kontrat: `channel` (x402 kupon kanalı)

```rust
fn open(payer: Address, payee: Address, asset: Address,
        deposit: i128, voucher_key: BytesN<32>, expiry_ledger: u32) -> u64  // payer.require_auth()
fn claim(id: u64, cumulative: i128, sig: BytesN<64>)       // payee çağırır
fn close(id: u64)                                          // süre dolunca payer kalanı geri alır
```

- Kupon: `ed25519(voucher_key, sha256(id ‖ cumulative))`. Tutar kümülatif ve tek yönlü artar, bu yüzden çift harcama olmaz.
- Depozito, `open` anında Mandate'in günlük tavanından düşer. Zincir dışı harcama **zincirde kilitli depozitoyla sınırlıdır**. Kupon kanalı politikayı delmez.
- Gateway, kanal durumunu (depozito, tahsil edilen) önbellekte tutar. Kuponu yerelde doğrular, zincire gitmez. Periyodik olarak ya da eşik aşıldığında `claim` eder.

### 3.4 x402 şemaları

| Uç | Şema | Neden |
|---|---|---|
| `GET /book`, `/ticker`, `/trades` | `channel` (yeni), yedek olarak `exact` | Sık ve küçük çağrılar; 5 saniyelik ledger beklenmez |
| `POST /order` | `exact` | Emir başına tek ödeme, zincirde iz bırakır |
| `DELETE /order/{id}` | Ücretsiz | Bayat emir iptalini cezalandırma |
| `GET /account/*` | Ücretsiz, imzalı istek | Ajan kendi verisini görür |

402 yanıtı iki `accepts` girdisi döner: `channel` (`extra.channelContract`, `extra.minDeposit`) ve `exact`. SDK, açık kanalı varsa `channel`'ı kullanır. `extra.areFeesSponsored = true`: tüm zincir işlemlerinin ücretini settler/facilitator öder, ajanın ücret için XLM tutması gerekmez.

`exact` için `@x402/stellar` facilitator'ı süreç içinde (self-facilitation) çalışır. `channel` doğrulayıcısını biz yazıyoruz. Header adları ve şema genişletme API'si kurulan paket sürümünden doğrulanacak (x402 v1 `X-PAYMENT` / v2 `PAYMENT-SIGNATURE`).

### 3.5 Politika kuralları (ilk sürüm)

| Kural | Değer | Nerede |
|---|---|---|
| Günlük harcama tavanı | 50 USDC | Zincir (`mandate-account`) |
| Tek işlem limiti | 5 USDC | Zincir |
| Çift beyaz listesi | USDC_XLM | Zincir |
| Alıcı beyaz listesi | gateway payTo, channel, settlement | Zincir |
| Mandate süresi | 7 gün | Zincir |
| Kanal depozitosu | ≤ 2 USDC | Zincir (tavandan düşer) |
| Çağrı sıklığı | dakikada 60 | Zincir dışı (gateway) |

Tavanlar yalnızca USDC bacağına uygulanır. XLM satışındaki USDC girişi tavana sayılmaz, XLM alışındaki USDC çıkışı sayılır. Zincirde oracle olmadığı için bu ayrım bilinçli.

Kural tanımları `packages/core`'da zincirden bağımsız durur. Kontrat yalnızca uygulayıcıdır.

---

## 4. API yüzeyi

```
GET    /book?pair=USDC_XLM      Defter anlık görüntüsü              x402 channel|exact
GET    /ticker?pair=            Son fiyat, hacim                    x402 channel|exact
GET    /trades?pair=            Gerçekleşen işlemler + tx hash      x402 channel|exact
POST   /order                   İmzalı intent gönderimi             x402 exact (0,01 USDC)
DELETE /order/{hash}            İptal (zincirde nonce yakma)        ücretsiz
GET    /account/{addr}/mandate  Mandate kuralları, kalan bütçe      ücretsiz
GET    /account/{addr}/ledger   Ödeme, emir, red geçmişi             ücretsiz
GET    /events                  SSE: panel akışı                    ücretsiz
GET    /llms.txt  /openapi.json                                     ücretsiz
POST   /mcp                     MCP sunucusu (streamable HTTP)
```

### Kurallar

- Kayıt ekranı, panel zorunluluğu, onboarding yok. Tek yüzey HTTP.
- Her red, makine okunabilir bir sebep koduyla döner: `{ "error": "DAILY_CAP_EXCEEDED", "source": "chain", "tx": "..." }`. Boş sebep yok. `source` alanı `gateway | matcher | chain` değerlerinden biridir.
- Çıktı deterministik ve sürümlüdür (`/v1`).
- `POST /order` gövdesi imzalı intent'tir. Matcher imzayı ve mandate'i (zincirden okunmuş, önbellekli) kabul anında kontrol eder. Zincirin yine de reddedebileceği durumlar defterde `source: chain` olarak görünür.

---

## 5. Depo yapısı

Mevcut klasörler korunur. Yeniden adlandırma hackathon sonrasına bırakıldı.

```
ArgusPay/
  contracts/                  Cargo workspace
    mandate-account/
    settlement/
    channel/
  packages/
    core/                     Intent şeması, hash/imza, sebep kodları, kural tanımları (TS)
    sdk/                      @mandate/sdk: hesap kurulumu, intent imzalama, x402 fetch + kupon
    bindings/                 stellar contract bindings typescript çıktısı
  backend/                    NestJS
    src/gateway/              x402 guard'ları (exact + channel), uçlar
    src/matcher/              Bellek içi defter
    src/settler/              settle/claim tx kurma, ücret sponsorluğu, kaynak hesap havuzu
    src/audit/                Postgres, olay kaydı, SSE
    src/discovery/            llms.txt, OpenAPI (@nestjs/swagger), MCP
  agents/                     Demo ajanları: alıcı, satıcı, kötü niyetli operatör senaryosu
  app.arguspay/               Canlı denetim paneli (Next.js)
  landing-page/               Mevcut site, Mandate anlatısıyla güncellenecek
  scripts/                    Kurulum: hesaplar, USDC, kontrat deploy, mandate oluşturma
```

### Kritik tutarlılık noktası

TS'teki intent hash'i Rust'takiyle **bayt bayt** aynı olmalı. Rust tarafında `sha256(intent.to_xdr(&env))` hesaplanır. TS tarafında aynı `ScVal` (sembol anahtarlı ve sıralı `ScMap`) üretilir. `packages/core` içinde, Rust testinden alınan sabit bir vektörle karşılaştıran bir test **ilk gün yazılır**.

---

## 6. Stellar'a özgü kısıtlar

**Gecikme.** Ledger kapanışı ~5 saniye. Yüksek frekanslı işlem hedef değil. Hedef kitle dakika ölçeğinde çalışan stratejiler: portföy dengeleme, DCA, sinyal bazlı giriş-çıkış, hazine yönetimi. Kupon kanalı, veri tarafında bu gecikmeyi ortadan kaldırır.

**Kapatılan riskler:**

| v1 riski | v2 çözümü |
|---|---|
| Freighter `__check_auth` çalıştıramaz | Ajan cüzdanı Mandate Account (C-adresi) |
| İmza ömrü ~60 sn, bekleyen emir ölür | `Intent` imzası payload'a bağlı değil, süreyi ajan belirler |
| Trustline sessizce kırar | C-adresinde trustline yok; yalnızca settler/gateway G-hesapları için kurulum betiğinde |
| x402 ödemesi politikaya takılır | Gateway payTo ve channel `payees` listesinde |
| Red zincirden mi, sunucudan mı belirsiz | `source` alanı; zincir reddinde başarısız tx gönderilip hash gösterilir |
| x402 toplu uzlaşma yok | `channel` kontratı |
| Operatöre güven | `Intent` doğrulaması `__check_auth` içinde |

**Kalan riskler:**

1. **C-adresi x402 ödeyen olabilir mi?** `@x402/stellar` `exact` şeması payer olarak kontrat hesabını destekliyor mu? İlk 3 saatte test edilir. Desteklemiyorsa `exact` doğrulayıcısı da kendi yazdığımız koda taşınır (iş yükü artar ama mimari değişmez).
2. **`__check_auth` kaynak tüketimi.** İki ed25519 doğrulaması ve bağlam ayrıştırması instruction limitine sığmalı. Simülasyonla ölçülür.
3. **Depolama TTL'i.** Mandate ve `filled` kayıtları evict olabilir. Settler her işlemde TTL uzatır, kurulum betiği mandate'i uzun TTL ile yazar.
4. **Sequence number.** Settler için 3–4 kaynak hesaptan oluşan bir havuz.
5. **Doğrulanacak rakamlar** (sunumdan önce `lab.stellar.org/network-limits` ve testnet ölçümü): okuma/yazma tavanları, uzlaşma maliyeti (~0,0023 XLM iddiası), Protokol 23 paralellik rakamları.

---

## 7. Teknik yığın

```
Ağ:        Stellar testnet
RPC:       https://soroban-testnet.stellar.org
Fonlama:   https://friendbot.stellar.org?addr=G...
Varlık:    testnet USDC SAC + native XLM SAC
Kontrat:   Rust + soroban-sdk (3 kontrat, tek Cargo workspace)
Ödeme:     @x402/stellar (exact) + kendi channel şemamız
Sunucu:    NestJS 11 (Express), TypeScript
Veri:      Postgres (Prisma)
Panel:     Next.js, SSE ile canlı akış
Keşif:     llms.txt, @nestjs/swagger, @modelcontextprotocol/sdk
Ajanlar:   Node + @mandate/sdk
```

---

## 8. Plan

Kapsam büyük. Plan ancak **kesme merdiveni** ile tutar: her kontrol noktasında çalışmayan parça bir alt seviyeye düşer ve kayıpsız devam edilir.

| Saat | İş | Blok sonunda elde |
|---|---|---|
| 0–3 | Kurulum betiği, testnet hesapları, Cargo workspace. **İki spike:** (a) C-adresinden x402 `exact` ödemesi, (b) özel `Sig` enum'lu minimal `__check_auth` | İki spike'ın sonucu belli |
| 3–8 | `mandate-account`: Owner/Agent imzaları, transfer kuralları, tavanlar, hata kodları, birim testleri | Zincirde reddedilen bir transfer |
| 8–13 | `settlement` + `Intent` imza dalı; TS/Rust hash test vektörü | Zincirde kapanan bir intent eşleşmesi |
| **13** | **Kontrol 1:** `Intent` auth çalışmıyorsa → **A'ya düş**: settler'a yalnızca `settle` çağırabilen oturum anahtarı | |
| 13–17 | Backend: gateway (`exact`), matcher, settler, Postgres şeması | Ücretli `GET /book`, `POST /order` → zincirde uzlaşma |
| 17–21 | Uyku | — |
| 21–25 | `channel` kontratı + channel x402 guard'ı + SDK kupon üretimi | Zincire gitmeden ödenen 20 çağrı, tek `claim` |
| **25** | **Kontrol 2:** kanal çalışmıyorsa → veri uçları `exact` ile kalır, kanal sunumda "tasarım" olarak anlatılır | |
| 25–28 | `@mandate/sdk` + üç demo ajanı (alıcı, satıcı, kurcalanmış settle) | Kendi kendine dönen döngü |
| 28–31 | Denetim paneli (SSE), ajan/mandate/red görünümleri | Her karar sebebiyle ekranda |
| 31–33 | `llms.txt`, OpenAPI, MCP; landing page metni; canlıya alma | Jüriye verilecek URL |
| 33–36 | Sunum, 90 saniyelik yedek video, teslim | Teslim edilmiş proje |

**Kesme sırası** (en önce kesilen başta): landing page → MCP (llms.txt + OpenAPI kalır) → panel süsü (tablo + akış kalır) → kupon kanalı (C → B) → intent auth (B → A). Çekirdek ise hiçbir koşulda kesilmez: Mandate Account + zincirden red + zincirde uzlaşma.

**Kurallar:**
- 33. saatten sonra yeni özellik eklenmez.
- Sunumdan 4 saat önce ne çalışıyorsa proje odur.
- Birden fazla kişiyseniz paralel iki hat kurulur: **kontratlar (Rust)** ve **backend + panel (TS)**. Ortak sözleşme `packages/core` ve bindings'tir.

---

## 9. Demo senaryosu

Sahnede yaklaşık iki buçuk dakika, sırasıyla:

1. **Yetki verilir.** Panelde iki ajan için mandate oluşturulur: günde 50, işlem başı 5 USDC, yalnızca USDC-XLM. Ajanlar hiçbir yere kayıt olmamış, API anahtarı almamış.
2. **Keşif.** Ajan A, `llms.txt` üzerinden servisi bulur.
3. **Kupon kanalı.** Ajan A 1 USDC'lik kanal açar (tek tx). Ardından 20 kez `GET /book` çağırır. Paneldeki sayaç akar, **zincirde sıfır işlem**.
4. **Emir.** A alış intent'ini imzalar ve `POST /order` ile 0,01 USDC öder. Ajan B satış intent'ini imzalar. Emirler eşleşir, uzlaşma zincirde kapanır ve ekranda tx hash'i görünür.
5. **Kurcalanmış operatör.** Bir betik, A'nın intent'ini fiyatı değiştirilmiş hâliyle uzlaştırmaya çalışır. Zincir `INTENT_MISMATCH` ile reddeder. *"Borsa bizim, ama paranıza dokunamayız."*
6. **Tavan.** A'nın bir sonraki emri günlük tavanı aşar. Red sunucudan değil zincirden gelir: `DAILY_CAP_EXCEEDED`, başarısız tx hash'i ile.
7. **Tahsilat.** Gateway, 20 kuponu tek bir `claim` işlemiyle tahsil eder.
8. **Defter.** Panel açılır: hangi ajan ne harcadı, hangi kural neyi durdurdu, her kararın kaynağı (`gateway / matcher / chain`).

**Kapanış cümlesi:** Bu bir video değil, şu anda canlı bir URL. Jürinin kendi ajanı da MCP üzerinden bağlanabilir.

**Sunumda söylenmeyecekler:** teknik zorluklar, yetişmeyen özellikler, yol haritası detayı. Soru gelirse cevaplanır, gelmeden anlatılmaz.

---

## 10. Riskler ve plan B'ler

| Risk | Belirti | Plan B |
|---|---|---|
| C-adresi x402 `exact` ile ödeyemiyor | 3. saatte spike başarısız | `exact` doğrulayıcısını kendimiz yazarız (SAC transfer auth entry) |
| `Intent` auth çalışmıyor | 13. saatte settle reddediliyor | Oturum anahtarı modeli (A) |
| Kupon kanalı yetişmiyor | 25. saatte claim başarısız | Veri uçları `exact` ile kalır |
| Hash uyuşmazlığı TS/Rust | `BAD_SIGNATURE` sürekli | Test vektörü; son çare olarak intent'i ham bayt dizisi olarak imzalamak |
| Instruction limiti aşılıyor | Simülasyonda `ExceededLimit` | Taker tarafında `Agent` imzası (payload), yalnızca maker için `Intent` |
| Testnet dalgalanır | RPC yavaş ya da hatalı | Yerel `stellar/quickstart` konteyneri |
| Canlı demo çöker | Sahnede bağlantı yok | 90 saniyelik önceden çekilmiş video |
| Kapsam şişer | 25. saatte üç parça yarım | Kesme sırası (8. bölüm) |

**Kalıcı ürün riskleri:**
- Politika kontratı tek başına kopyalanabilir. Savunma, standart olmak (SDK + bindings + x402 şeması), risk verisinin kalitesi ve denetimin derinliğidir.
- Ajan ödemeleri henüz hacim üretmiyor. Ürün yalnızca ajanlara değil, otomatik ödeme yapan her arka plan sistemine konumlanır ve gelir hacme değil aylık tabana dayanır.

---

## 11. Kapsam dışı ve hukuk

**Kapsam dışı:** KYC, fiat giriş/çıkış, müşteri parası saklama, yatırım tavsiyesi, yüksek frekanslı işlem, mainnet, zincir üstü fiyat oracle'ı.

**Hukuki sınır:** yapı emanetsizdir; fon ajanın kendi hesabındadır ve operatör transfer yapamaz. Buna rağmen emir eşleştirip ücret alan bir operatör, 7518 sayılı kanunla gelen SPK kripto varlık hizmet sağlayıcı düzenlemesi kapsamına girebilir. Hackathon testnet üzerinde olduğu için bugün bir engel yok. Teslimde "testnet, emanetsiz protokol" ifadesi kullanılacak. **Avukat görüşü ilk ücretli pilottan önce alınacak.**

**Konumlandırma:** borsa olma, borsalara ve ajanlara takılan yetki katmanı ol. Borsa demo içindir; müşteri borsa da olabilir, ajan geliştiricisi de.

---

## 12. Zincir bağımsızlığı

**Stellar'a gömülü kalır:** `mandate-account` (`__check_auth`), `settlement`, `channel`, SAC uzlaşması, ücret sponsorluğu.

**Zincirden bağımsız kalır:** intent şeması ve kural tanımları (`packages/core`), matcher, x402 katmanı (yalnızca `network` alanı değişir), denetim defteri, API yüzeyi, SDK arayüzü.

**Sunumda:** "Stellar için yaptık, çünkü özel hesap auth'u (`__check_auth`), ücret sponsorluğu ve sentin kesri maliyetinde uzlaşma bu ürünü mümkün kılıyor."

---

## 13. Hackathon sonrası

**Ürün çekirdeği.** `@mandate/sdk` + kontrat standardı + barındırılan facilitator/kanal servisi. API anahtarı yok: müşterinin ajanı kendi Mandate Account'uyla bağlanır, müşteri mandate'leri panelden yönetir.

**Gelir modeli.** Aylık taban (panel, denetim, barındırılan facilitator) + kanal/uzlaşma hacminden küçük bir pay. Hedef: müşteri başına yıllık ~15.000 dolar; 20 müşteri anlamlı bir tekrarlayan gelir.

**İlk dağıtım kanalı.** Mevcut freelance müşteri portföyü.

**Grant yolu.** SCF Build Award, RFP track: x402 facilitator + Bazaar. `channel` şeması doğrudan bu başlığa girer. Soroban kontratları için Audit Bank. x402 spesifikasyonuna `channel` şeması için öneri (PR) açılır.

**İlk 90 gün.** 0–30. gün: kod yazmadan 10 potansiyel müşteriyle görüş. 30–90. gün: bir ücretli pilot. Ücretsiz kullanım verilmez.

---

## 14. Kaynaklar

- Stellar dokümanı: https://developers.stellar.org
- Ajan için indeks: https://developers.stellar.org/llms.txt
- Stellar skill'leri: https://skills.stellar.org
- Raven (canlı AI sunucusu): https://raven.stellar.buzz/playground
- x402 protokolü: https://github.com/x402-foundation/x402
- Stellar x402 paketi: https://www.npmjs.com/package/@x402/stellar
- SDF x402 araçları: https://github.com/stellar/x402-stellar
- Ağ limitleri: https://lab.stellar.org/network-limits
- SCF RFP track: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track

---

## 15. Açık kararlar

- [x] Proje adı: Mandate
- [x] İşlem çifti: USDC-XLM
- [x] Emir ücreti: sabit 0,01 USDC
- [x] Cüzdan: Mandate Account; sahip için ed25519, passkey zaman kalırsa
- [x] Keşif: `llms.txt` + OpenAPI + MCP (Bazaar uçları kapsam dışı)
- [ ] Ekip: kaç kişi, hangi hat kimde (kontratlar / backend + panel)
- [ ] Canlıya alma: backend ve Postgres nerede barınacak
- [ ] Klasör ve repo adlarının `mandate` olarak değiştirilmesi (hackathon sonrası)
