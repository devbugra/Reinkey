# LANDING.md — Reinkey tanıtım sitesi güncellemesi (Hat 4)

Bu dosya, `landing-page/` klasöründe çalışacak Claude Code içindir. Ürünün tamamı için `../proje-tanimi.md` belgesine bak (özellikle 1, 2, 3, 10. bölümler). Bu dosya ile belge çelişirse **bu dosya geçerlidir**.

---

## 0. Bağlam

Site, projenin **eski yönüne** göre yazıldı: ad "Mandate", ürün de "ajan-yerli emanetsiz borsa" (vault kontratı, emir eşleştirme, emir başına ücret). Proje şimdi tamamen yön değiştirdi:

**Reinkey = Stellar'da sayaçlı x402 + ajan harcama yetkisi.**

- **Sorun:** Stellar'da bugün her x402 ödemesi ayrı bir zincir işlemidir ve ~5 saniye sürer. Token başına ya da saniye başına ödeme bu yüzden pratik değil. Üstelik ajana ya cüzdanın tamamı veriliyor ya da hiçbir şey.
- **Ödeme kanalı:** Ajan bir Soroban kanalı **tek işlemle** açar ve USDC depozito kilitler. Her çağrıda zincir dışı, imzalı, kümülatif bir kupon gönderir. Satıcı kuponu milisaniyede doğrular, birikenleri **tek işlemle** tahsil eder. 1000 ödeme = 2 zincir işlemi.
- **Reinkey Account:** Ajanın cüzdanı bir akıllı hesaptır. Günlük tavanı, tek işlem tavanını ve izinli alıcıları **zincir** (`__check_auth`) uygular. Ajan parayı kendine ya da izinsiz bir adrese gönderemez.
- **Altyapı, uygulama değil:** Satıcı tek satırla entegre olur: `app.get("/api", meter({ price, unit }), handler)`. Facilitator paraya dokunamaz; kuponu herkes doğrulayabilir.
- **Slogan:** *Give your agent the keys. Keep the reins.* / *Anahtarı ajana ver, dizgin sende kalsın.*

**Artık YOK** (sitede hiç geçmemeli; v4 eki için bkz. §8): kendi borsamız, emir defteri, eşleştirme, emir ücreti, vault kontratı, DCA / portföy dengeleme hedef kitlesi, "politika kontratı" ayrı bir kontrat olarak.

### Senin işin

`landing-page/` içindeki mevcut siteyi **yeni ürüne göre güncellemek**: ad, metinler (tr + en), Playground simülasyonu, mimari anlatımı, işaret (logo). Sıfırdan yazmak değil. Yapı, tasarım dili ve bileşenler iyi durumda; mümkün olduğunca koru.

### Senin işin OLMAYANLAR

- `landing-page/` dışında dosya değiştirme.
- Site backend'e **istek atmaz** ve öyle kalmalı: CSP `connect-src 'self'`. API ve panel yalnızca bağlantı olarak geçer.

---

## 1. Önce oku

1. `landing-page/AGENTS.md`: **Next.js 16 kullanılıyor, eğitim verindeki Next.js değil.** Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehberi oku.
2. `landing-page/README.md`, `content/site.ts`, `app/(landing)/[locale]/page.tsx` (bölüm sırasının gerekçesi burada yazıyor), `components/landing/*`, `messages/tr.json`, `messages/en.json`.
3. Yığın: Next.js 16, next-intl 4 (tr, en), Tailwind 4, lucide-react. Paket yöneticisi npm.

Çalıştırma: `npm install && npm run dev` (port `.env.local` içinde, 3001). Bitirmeden önce şunların hepsi geçmeli: `npm run lint`, `npm run typecheck`, `npm run build`.

---

## 2. Ad ve marka

- `content/site.ts` → `name: "Reinkey"`. Ad yalnızca buradan okunur.
- `messages/*.json` içinde "Mandate" ya da eski ürün adını doğrudan yazan bir yer kalmasın; her yerde `{name}` yer tutucusu kullanılsın.
- **İşaret (`components/landing/Wordmark.tsx`):** mevcut işaret "çit + vault + x402 kapısı" anlatıyor. Yeni anlam: **anahtar + dizgin.** Öneri: bir anahtarın halka kısmından çıkan ve kavis yapan bir kayış (dizgin) çizgisi. Kısıtlar mevcut dosyadaki gibi: tek renk, `currentColor`, 24×24 viewBox; `opengraph-image.tsx`, `apple-icon.tsx` ve `icon.svg` aynı geometriyi kullanıyor, **dördünü birlikte** güncelle. Küçük boyutta (16 px) okunmuyorsa sadeleştir. İşaretin ne anlattığını dosyanın başındaki yorumda güncelle.
- Renk paleti ve tipografi **değişmez**.

---

## 3. Bölüm bölüm içerik

Bölüm sırası ve bileşenler aynı kalır. Aşağıdaki metinler **Türkçe taslaktır**; kısalt, ritmini düzelt, ama iddiaları değiştirme. İngilizceyi (`en.json`) çeviri gibi değil, İngilizce yazılmış gibi yaz. Mesaj anahtarlarının yapısını değiştirmen gerekirse iki dili ve bileşeni birlikte güncelle.

### meta
- title: `{name} — Stellar'da sayaçlı x402 ödemeleri`
- description: Ajanlar tek işlemle bir ödeme kanalı açar, milisaniyede binlerce kez öder; harcama sınırını zincir uygular. Stellar testnet üzerinde canlı.
- ogTitle: `Anahtarı ajana ver. Dizgin sende kalsın.`
- ogSubtitle: `Tek işlemle aç, milisaniyede öde, tek işlemle tahsil et.`

### hero
- eyebrow: `Sayaçlı x402 · Stellar`
- titleLead: `Anahtarı ajana ver.` / titleAccent: `Dizgin sende kalsın.`
- subtitle: Ajanınız bir ödeme kanalı açar ve her çağrıyı, her token'ı zincire gitmeden, milisaniyede öder. Satıcı binlerce ödemeyi tek işlemle tahsil eder. Ajanın ne kadar ve kime harcayabileceğini ise sunucu değil, Stellar üzerindeki hesabı belirler.
- ctaPrimary: `Demoyu dene` · ctaSecondary: `Entegre et` (→ `routes.llms` ya da `routes.openapi`)
- note: `Stellar testnet üzerinde canlı. Emanet yok, kayıt yok, API anahtarı yok.`
- trust: `1000 ödeme, 2 zincir işlemi` · `Sınırı zincir uygular` · `Satıcıya tek satır`

### playground: EN ÖNEMLİ BÖLÜM, bileşen yeniden yazılır (§4)
- title: `Bir ajan olun. Önce ödeyin, sonra sınıra çarpın.`
- lead: Kanalı açın, çağrı yapın, yanıtı token token akıtın. Sayaçta kupon sayısı artarken zincir işlemi sayısının neredeyse hiç değişmediğine bakın. Sonra tavanı zorlayın: red sunucudan değil, hesaptan gelir.

### compare: "bugün x402" ile "Reinkey" karşılaştırması
- title: `Her ödeme bir işlem olmak zorunda değil.`
- Sol (bugünkü x402 `exact`): her çağrı için imzala, gönder, ledger'ı bekle (~5 sn), tekrarla. 1000 çağrı = 1000 işlem ≈ 83 dakika. Token başına ödeme pratik değil. Ajanın harcama sınırı ya yok ya da sunucuda.
- Sağ (Reinkey `channel`): kanalı bir kez aç, her çağrıda kupon imzala (milisaniye), satıcı tek işlemle tahsil etsin. 1000 çağrı = 2 işlem. Token ve saniye başına ödeme. Sınır zincirde.
- Rakamların yanına küçük bir not koy: `Testnet ölçümü; ledger ~5 sn.`

### problem
- title: `Ajanlar para harcamaya başladı. Ray buna hazır değil.`
- Üç madde:
  1. **Her ödeme bir işlem:** 5 saniyelik ledger, çağrı başına ödemede her isteği 5 saniye bekletir.
  2. **Mikro ödeme ekonomik değil:** token başına 0,00002 USDC'lik bir ücret için ayrı işlem göndermek anlamsız.
  3. **Anahtar ya hep ya hiç:** ajana cüzdanı verirsen her şeyi harcayabilir; vermezsen hiçbir şey yapamaz.

### statement
- `Ödeme, yanıtın hızında akmalı. Sınır, zincirin kendisinde durmalı.` (daha kısası bulunursa o)

### howItWorks: üç adım
1. **Dizgini tak.** Sahip bir Reinkey Account kurar: günlük tavan, tek işlem tavanı, izinli satıcılar. Kurallar zincirde yazılıdır.
2. **Kanalı aç.** Ajan satıcıyla tek işlemde bir kanal açar ve depozitoyu kilitler. Depozito günlük tavandan düşer; kanal sınırı delemez.
3. **Öde, akıt, tahsil et.** Her istekte imzalı, kümülatif bir kupon; satıcı milisaniyede doğrular. Birikenler tek işlemle tahsil edilir, kalan depozito ajana döner.

- subtitle: `Hız gereken yer zincir dışında, güven gereken yer zincirde.`

### architecture: dört öğe
- title: `Facilitator paraya dokunamaz.`
- subtitle: Kuponu herkes doğrulayabilir, tahsilatı herkes tetikleyebilir. Para yalnızca kanalın satıcısına gider.
- Öğeler:
  - **Reinkey Account** (Soroban akıllı hesabı, `__check_auth`): fonu tutar, tavanları ve izinli alıcıları uygular.
  - **Channel kontratı**: depozitoyu kilitler, kümülatif kuponu doğrular, tahsilat ve iade yapar. Çift harcama yapısal olarak imkânsız.
  - **Facilitator**: x402 `channel` ve `exact` şemaları, kupon doğrulama, otomatik tahsilat, ücret sponsorluğu.
  - **`meter()` middleware'i**: satıcının API'sine tek satır.
- Stellar'a neden bağlı olduğu tek satır: özel hesap auth'u, ücret sponsorluğu, sentin kesri işlem maliyeti.

### features: altı madde
Tek satır entegrasyon · Token / saniye / çağrı başına fiyat · Zincirde uygulanan tavan · Emanetsiz (fon ya ajanın hesabında ya kanal kontratında) · Ajan XLM tutmaz (ücretleri facilitator öder) · Kendini tanıtan servis (OpenAPI, llms.txt, MCP).

### limits: dürüst sınırlar
- Kanal açmak ve tahsil etmek hâlâ zincir işlemidir (~5 sn); ara ödemeler değildir.
- Kanal tek yönlüdür: ajandan satıcıya.
- Satıcı, kanalın süresi dolmadan tahsil etmelidir; facilitator bunu otomatik yapar.
- Testnet üzerinde çalışır, mainnet'te değil.
- Kontratlar henüz denetlenmedi.

### audience
- **API ve veri satıcıları:** çağrı başına ya da token başına fiyatlandırma, abonelik ve fatura derdi olmadan.
- **LLM ve çıkarım (inference) sağlayıcıları:** üretilen token kadar ödeme, akış ortasında kesilebilen bütçe.
- **Ajan geliştiricileri:** ajana cüzdan vermeden harcama yetkisi; tavan zincirde.
- **Platformlar:** kullanıcılarının ajanlarına ayrı ayrı sınır koymak isteyen ürünler.

### pricing
- title: `Testnet'te ücretsiz. Sonra hacimle.`
- Üç kart:
  - **Testnet** (ücretsiz): barındırılan facilitator, panel, sınırsız kanal.
  - **Satıcı** (aylık taban + tahsil edilen hacimden küçük bir pay; rakam yazma, "Yakında" yaz): ücret sponsorluğu, denetim defteri, otomatik tahsilat.
  - **Kendi facilitator'ın** (açık kaynak): kontratlar ve middleware, kendi sunucunda.
- **Uydurma fiyat yazma.**

### faq: en az şu sorular
- Facilitator'a güvenmem gerekiyor mu? (Hayır. Kupon kanal kontratında doğrulanır, para yalnızca satıcıya gider.)
- Satıcı kuponu tahsil etmeden kanal kapanırsa ne olur? (Ajan ancak süre ve bekleme payı dolduktan sonra kapatabilir; facilitator süre dolmadan tahsil eder.)
- Ajan depozitodan fazlasını harcayabilir mi? (Hayır. Kupon depozitoyu aşarsa zincir de facilitator da reddeder; akış cümlenin ortasında kesilir.)
- Ajan parayı kendi cüzdanına çekebilir mi? (Hayır. Reinkey Account yalnızca izinli alıcılara öder, bunu zincir uygular.)
- Ajanın XLM tutması gerekiyor mu? (Hayır, ağ ücretlerini facilitator öder.)
- Neden Stellar? (Özel hesap auth'u, ücret sponsorluğu, çok düşük işlem maliyeti.)
- Bu bir DEX mi? (Hayır. Ödeme rayı ve harcama yetkisi. Ajan bununla istediği serviste harcar.)
- Hangi x402 sürümü? (`channel` yeni bir şema; `exact` yedek olarak desteklenir.)

### closing
- title: `Bu bir video değil. Canlı bir URL.`
- subtitle: `Kendi ajanınızla çağırın. İlk istek 402 ile şartları döner; kanalınız varsa kupon imzalayın, yoksa bir tane açın.`
- CTA: `llms.txt` · `OpenAPI`

### footer
- tagline: `Stellar'da sayaçlı x402. Anahtarı ajana ver, dizgin sende kalsın.`
- Bağlantılar aynı; "Denetim defteri" yerine `Canlı panel` yaz.

### nav
Demo · Nasıl çalışır · Mimari · Ücretler · SSS · `Canlı panel` · CTA: `Entegre et`

---

## 4. Playground (yeniden yazılır)

Dosya: `components/landing/Playground.tsx` (+ `PlaygroundSection.tsx`). Tamamen istemci tarafında bir simülasyon; ağ isteği yok. Mevcut bileşenin iskeletini koru: sol tarafta eylemler, sağ tarafta istek/yanıt izi, altta sıfırlama. Tutarlar **tamsayıdır**; mevcut koddaki "kayan nokta yasak" gerekçesi geçerli.

**Birim:** simülasyonda 1 birim = 0,0001 USDC. Görüntülerken 4 ondalıkla yaz.

**Politika (sağda sabit kart):**

```ts
const POLICY = {
  dailyCap: 50_000,         // 5.0000 USDC
  perTxCap: 10_000,         // 1.0000 USDC  (tek transfer / tek kanal depozitosu)
  payees: ["demo-seller"],
} as const;
const PRICE = { request: 5, slice: 10 } as const;  // slice = 50 token'lık dilim (token başına 0.00002 USDC)
const SLICE_TOKENS = 50;
```

Token başına fiyat kesirli olduğu için hesap **dilim** bazında yapılır: 50 token = 10 birim. Kesirli sayı tutma.

**Eylemler:**

| Eylem | Etki | Olası sonuç |
|---|---|---|
| `Kanal aç (1 USDC)` | Zincir işlemi +1, günlük harcama +10 000, depozito 10 000 | Tavan aşılırsa `DAILY_CAP_EXCEEDED` (kaynak: **chain**) |
| `GET /book` | Kupon +1, cumulative +5 | Depozito yetmezse `CHANNEL_EXHAUSTED` |
| `GET /book × 100` | 100 kupon, zincir işlemi değişmez | Aynı |
| `POST /chat` (akış) | Metin token token akar (40 ms). Her 50 token'da kupon +1, cumulative +10 | Depozito biterse akış **cümlenin ortasında** durur: `CHANNEL_EXHAUSTED` |
| `Tahsil et` | Zincir işlemi +1, "N kupon → 1 işlem" | Tahsil edilecek bir şey yoksa bilgi mesajı |
| `Parayı kendine gönder` (ele geçirilmiş ajan) | — | Her zaman `PAYEE_NOT_ALLOWED` (kaynak: **chain**) |
| `2 USDC'lik kanal aç` | — | `PER_TX_CAP_EXCEEDED` (kaynak: **chain**) |

**Sayaç şeridi** (bölümün yıldızı; `components/ui/Counter.tsx` kullanılabilir):

```
Kupon: 412    Zincir işlemi: 2    Ödenen: 0.2060 USDC    Aynı iş exact ile: 412 işlem · ~34 dk
```

"Exact ile" süresi `kupon × 5 sn` ile hesaplanır.

**İz satırları:** her satırda yöntem ve yol, `402 → kupon #N (0.0135) → 200` gibi kısa bir akış, kaynak etiketi (`facilitator` / `chain`) ve süre. Kupon doğrulaması `~2 ms`, zincir işlemleri `~5 sn` gösterilir. Zincir işlemlerini gerçekten 5 saniye **bekletme**; 600 ms'lik bir animasyon ve "≈5 sn" etiketi yeterli.

**Sebep kodları** backend ve kontratla aynı olmalı (bunları değiştirme):
`DAILY_CAP_EXCEEDED`, `PER_TX_CAP_EXCEEDED`, `PAYEE_NOT_ALLOWED`, `CHANNEL_EXHAUSTED`, `VOUCHER_NOT_INCREASING`.

**Akış metni:** `messages/*.json` içinde, ~200 token'lık kısa bir paragraf. 1 USDC'lik depozitoyla birkaç akışta biter. İlk akışta tamamlansın, ikinci ya da üçüncüde ortasında kesilsin; kupon sayısını buna göre ayarla.

**Erişilebilirlik:** sonuçlar `aria-live="polite"` ile duyurulsun. Akış animasyonu `prefers-reduced-motion` açıkken anında tamamlansın. Klavye ile tüm eylemlere ulaşılabilsin.

---

## 5. Diğer teknik notlar

- `.env.example` / `lib/env.ts` içindeki açıklamalarda "borsa" ve "denetim defteri" geçen yerleri güncelle. `NEXT_PUBLIC_APP_URL` artık "canlı panel". Değişken adları aynı kalır.
- `content/site.ts` → `external` listesine `scfRfp: "https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track"` ekleyebilirsin (footer "Kaynaklar").
- `anchors` değerleri: `limits`, `audience` vb. değişmez. Yeni bölüm eklemezsen ekleme yapma.
- Bittiğinde eski kavramları ara ve temizle:
  `grep -rniE "vault|borsa|exchange|emir|order|eşleştir|match|USDC-XLM|mandate|DCA|portföy" app components content messages lib`
  Yalnızca bilinçli olarak kalanlar kalsın (ör. Compare bölümündeki "exact" karşılaştırması).
- `opengraph-image.tsx`: yeni başlık ve işaretle kontrol et (`/tr/opengraph-image` ve `/en/opengraph-image` adreslerini tarayıcıda aç).

---

## 6. Sıra ve bitti tanımı

| # | İş | Bitti sayılması için |
|---|---|---|
| 1 | Ad, meta, hero, nav, footer (tr + en) | İlk ekran yeni ürünü anlatıyor |
| 2 | Playground yeniden yazımı | §4'teki tüm eylemler ve sayaç çalışıyor |
| 3 | Compare, Problem, Statement, HowItWorks, Architecture | Eski borsa anlatısından iz yok |
| 4 | Features, Limits, Audience, Pricing, FAQ, Closing | §3'e uygun |
| 5 | İşaret: Wordmark + OG + ikonlar | 16 px'te okunuyor, iki temada doğru |
| 6 | Temizlik grep'i, lint, typecheck, build | Üçü de geçiyor |

İş bitince `landing-page/NOTES.md` dosyasına kısa bir özet yaz: ne değişti, neyi bilerek bıraktın, hangi metinden emin değilsin.

## 7. Kurallar

- Uydurma rakam, müşteri, logo ya da alıntı yok. Tek sayısal iddia "1000 ödeme = 2 işlem" ve ondan türeyen karşılaştırmadır.
- "Dünyada ilk" deme. İstersen "Stellar'da ilk" diyebilirsin.
- Tasarım dilini koru; yeni kütüphane ekleme.
- Kod yorumları Türkçe (mevcut stil). Commit atma.

---

## 8. EK (19 Eylül, v4): kripto borsası konumlandırması — ÖNCELİKLİ, §3–4 ile çelişirse bu geçerli

Ürün artık **"kripto borsaları ve yapay zekâ ajanları için Stellar üzerinde x402 altyapısı"** (`../proje-tanimi.md` §0). Kendi borsamız yok; borsaların verisini saniye başı satacağı ve ajanların zincirin koyduğu sınırla işlem yapacağı rayı kuruyoruz. Genel "sayaçlı x402" anlatısı korunur ama **vitrin kripto borsalarıdır**. Fintech dili: "kullanım bazlı tahsilat" + "ajanlar için harcama ve işlem yönetimi".

**Tek cümle (hero altı ya da Statement):** *Borsalar verisini saniye başı satsın, ajanlar zincirin koyduğu sınırla işlem yapsın; ikisi de Stellar'da, x402 ile.*

### Metin değişiklikleri
- **hero.eyebrow:** `Borsalar ve ajanlar için x402 · Stellar`. Başlık ("Anahtarı ajana ver. Dizgin sende kalsın.") aynı kalır.
- **hero.subtitle:** Borsanız canlı fiyat akışını saniye başı satar; ajanlar kayıt olmadan bağlanır, dinlediği saniye kadar öder. Aynı ajan DEX'te işlem yapar, ama ne kadar ve hangi çiftte yapabileceğini sunucu değil Stellar üzerindeki hesabı belirler.
- **Üç katmanı** Features ya da HowItWorks'te görünür kıl:
  1. **Saniye başı piyasa verisi:** API anahtarı ve aylık paket yok; bağlantı kesilince ödeme durur.
  2. **Sınırı zincirde olan işlem hesabı:** anahtar çalınsa bile çift, işlem başı tutar ve günlük tavan dışına çıkılamaz (DEX tarafında).
  3. **Herhangi bir varlıkla öde:** ajanın elindeki XLM DEX üzerinden USDC'ye çevrilir, borsa USDC alır. Bu katmanda "yakında" ibaresi kullan; hazır olup olmadığı kesin değil.
- **audience:** Kripto borsaları (veri satıcısı olarak) · İşlem botu ve ajan geliştiricileri · Stellar DEX'leri ve likidite sağlayıcıları · Diğer API ve veri sağlayıcıları.
- **faq'ye ekle:**
  - *Kendi borsanızı mı kuruyorsunuz?* Hayır; borsaların kullanacağı ödeme ve yetki rayını kuruyoruz. DEX tarafında Soroswap kullanılır.
  - *Merkezi borsada işlem sınırı nasıl uygulanır?* Uygulanmaz; merkezi borsaya sunduğumuz ürün veri satışı ve tahsilattır. Zincirde uygulanan işlem sınırı DEX tarafında geçerlidir.
- **problem:** "API anahtarı ya hep ya hiç" maddesi borsa diliyle yazılsın: işlem yetkili API anahtarı çalınırsa hesap boşalır.

### Playground değişiklikleri (§4'ün yerine geçen kısımlar)
- `POST /chat` eylemi yerine **`Fiyat akışına bağlan`**: XLM/USDC fiyatı her "saniyede" (simülasyonda 250 ms) akar; her 10 saniyede bir kupon (+10 birim = 0.0010 USDC). "Durdur" düğmesi ödemeyi hemen durdurur. Depozito biterse akış kesilir: `CHANNEL_EXHAUSTED`.
- Yeni eylem **`DEX'te al (0.5 USDC)`**: zincir işlemi +1, günlük harcama +5 000 birim, kaynak **chain**, sonuç başarılı.
- **`2 USDC'lik işlem`** → `PER_TX_CAP_EXCEEDED` (kaynak **chain**). Bu, §4'teki "2 USDC'lik kanal aç" eyleminin yerine geçer.
- **`BTC/USDC işlemi`** → `PAIR_NOT_ALLOWED` (kaynak **chain**).
- `Parayı kendine gönder` → `PAYEE_NOT_ALLOWED` aynen kalır. `GET /book` ve `Tahsil et` de kalır.
- Sayaç şeridine ekle: `Veri: 90 sn` (akış süresi).
- Sebep kodu listesine ekle: `PAIR_NOT_ALLOWED`, `PER_TX_CAP_EXCEEDED`.
