# Canlıya alma

Üç uygulama ve bir veritabanı. Sıra önemli: adresler birbirine gömülüyor.

| # | Ne | Nerede | Adres (örnek) |
|---|---|---|---|
| 1 | Postgres | Railway / Fly Postgres / Neon / Supabase | `DATABASE_URL` |
| 2 | **backend** (facilitator) | Dockerfile alan herhangi bir yer: Railway, Fly.io, Render | `https://reinkey.onrender.com` |
| 3 | **landing-page** (site + `/docs`) | Vercel | `https://reinkey.com` |
| 4 | **app.mandate** (konsol) | Vercel | `https://reinkey.io` |

Backend'in adresi iki Next uygulamasına derleme anında gömülür (`NEXT_PUBLIC_*`); backend de CORS için onların adresini bilmek zorunda. Bu yüzden önce backend'i çıkar, sonra Next'leri, en son CORS'u güncelle.

## Canlı kurulum (20 Eylül)

| Yüzey | Kanonik adres | Yönlendirme |
|---|---|---|
| Tanıtım sitesi | `https://www.reinkey.com` | çıplak `reinkey.com` → 308 → www → 307 → `/tr` |
| Konsol | `https://www.reinkey.io` | çıplak `reinkey.io` → 308 → www |
| Facilitator | `https://reinkey.onrender.com` | — |

İki alan adı da bizim: **reinkey.com tanıtım sitesi, reinkey.io konsol.** Her iki
alanda da sunulan ana bilgisayar adı `www`'dür; env değerlerine bu yüzden şema ve
`www` ile tam yazılmalıdır.

### Env değerleri (canlı)

| Uygulama | Değişken | Değer |
|---|---|---|
| landing-page (Vercel) | `NEXT_PUBLIC_SITE_URL` | `https://www.reinkey.com` |
| landing-page | `NEXT_PUBLIC_API_URL` | `https://reinkey.onrender.com` |
| landing-page | `NEXT_PUBLIC_APP_URL` | `https://www.reinkey.io` |
| app.mandate (Vercel) | `NEXT_PUBLIC_MARKETING_URL` | `https://www.reinkey.com` |
| app.mandate | `NEXT_PUBLIC_API_URL` | `https://reinkey.onrender.com` |
| backend (Render) | `PUBLIC_URL` | `https://reinkey.onrender.com` |
| backend | `CORS_ORIGINS` | `https://www.reinkey.com,https://www.reinkey.io` |

**Adlandırma kuralı.** `NEXT_PUBLIC_SITE_URL` her uygulamada "uygulamanın KENDİ
adresi" demektir; başka bir servise giden her adres o servisin adını taşır. Bu
yüzden konsolda `NEXT_PUBLIC_SITE_URL` yoktur: konsolun kanonik adrese, OG'ye ya
da sitemap'e ihtiyacı yok, tanıtım sitesine giden bağlantı ise
`NEXT_PUBLIC_MARKETING_URL` adını taşır. İkisi eskiden aynı adı paylaşıyordu ve
aynı ad iki projede zıt anlama geliyordu — Vercel'de yan yana duran iki projede
er geç yanlış doldurulacak bir alandı.

Konsoldaki Reinkey logosu ve bütün belge bağlantıları `NEXT_PUBLIC_MARKETING_URL`'e
gider. Buraya konsolun kendi adresi yazılırsa logo kullanıcıyı bulunduğu sayfaya
geri atar; kırık değil, hiçbir şey yapmayan bir bağlantı olur. Konsol bu durumu
tarayıcı konsoluna hata olarak yazar (`lib/env.ts`).

Yalnızca konsol tarayıcıdan backend'e bağlanır, dolayısıyla CORS'ta asıl gereken
köken `https://www.reinkey.io`'dur. Tanıtım sitesi backend'e istek atmaz (CSP'de
`connect-src 'self'`), listede durması zararsızdır.

### Render'da demo kontrolleri için gereken düzeltme

Canlı backend şu an demo ajanını başlatamıyor:

```
NOT_SUPPORTED: Ajan betiği bulunamadı: /opt/render/project/src/agents/trader.ts
```

Sebep: servis Docker olarak değil Node servisi olarak kurulu ve yalnızca `backend/`
bağımlılıkları kurulmuş. Ajan `agents/node_modules/.bin/tsx` ile çalışır; `agents/`
paketi `@reinkey/core` ve `@reinkey/sdk`'ya `workspace:*` ile bağlı olduğu için
bağımlılıkları **pnpm** ile, depo kökünden kurulmalıdır. İki çözüm var:

**A. Build komutunu genişlet (tek alan, en hızlı).** Render → servis → Settings → Build Command:

```bash
corepack enable && (cd .. && pnpm install --frozen-lockfile) && npm ci && npx prisma generate && npm run build
```

Start Command değişmez (`npx prisma migrate deploy && node dist/main` ya da mevcut hâli).

**B. Docker'a geç (depodaki `render.yaml`).** Blueprint imajı depo kökünden derler;
pnpm workspace ve `deployments/testnet.json` imaja girer, giriş betiği göçleri uygular.
Ajanın gizli dosyaları `DEPLOY_SECRETS_ENV` ve `RELAYER_SECRET` ortam değişkenlerinden yazılır.

Her iki durumda da şu gizli değerler Render panelinde tanımlı olmalı: `FACILITATOR_SECRET`,
`SELLER_PAY_TO`, `AGENT_OWNER_SECRET` (dondurma için), `DEPLOY_SECRETS_ENV` (ajanın anahtarları),
isteğe bağlı `RELAYER_SECRET`.

### Sunumdan önce

1. `curl https://reinkey.onrender.com/health` → uyanık mı (ücretsiz katmanda uyur).
2. Konsolda bir kez **Ajanı başlat**: üretim veritabanı boşken ana sayaç "Henüz ödeme yok"
   gösterir; ilk koşu gerçek rakamları doldurur.
3. `GET /accounts/<demoAccountId>` → `spentToday` günlük tavanın altında mı.

---

## 1. Backend

İmaj depo kökünden derlenir; yalnızca `backend/` değil, `packages/` ve `agents/` de içeri girer, çünkü demo kontrolleri ajanı `agents/node_modules/.bin/tsx` ile başlatır.

```bash
docker build -f backend/Dockerfile -t reinkey-backend .
```

Railway / Render: "Dockerfile path" = `backend/Dockerfile`, "context" = depo kökü. Fly: `fly launch --dockerfile backend/Dockerfile`.

### Ortam değişkenleri

`backend/.env.example` tam listedir. Canlıda mutlaka değişmesi gerekenler:

| Değişken | Değer |
|---|---|
| `PUBLIC_URL` | Backend'in herkese açık adresi. 402 gövdesindeki `resource`, ajanın `API_URL`'i ve MCP açıklaması buradan gelir |
| `CORS_ORIGINS` | Site ve konsol adresleri, virgülle. Tarayıcı `Origin` başlığını **sunulan** ana bilgisayar adıyla gönderir, bu yüzden `www` biçimi yazılır: `https://www.reinkey.com,https://www.reinkey.io` |
| `DATABASE_URL` | Yönetilen Postgres bağlantısı (`?sslmode=require` gerekebilir) |
| `FACILITATOR_SECRET` | Claim işlemlerini gönderen ve ücret ödeyen G-hesabı (testnet) |
| `SELLER_PAY_TO` | Demo satıcının adresi |
| `DEMO_CONTROLS` | `true`: konsoldaki "Ajanı başlat" ve "Dondur" düğmeleri çalışır. Jüri URL'sinde açık, sonra kapatılır |
| `AGENT_OWNER_SECRET` | Yalnızca `DEMO_CONTROLS=true` ise: dondurma işlemini imzalayan sahip anahtarı |
| `ANTHROPIC_API_KEY`, `CHAT_MODE` | `/demo/chat` için; anahtar yoksa `CHAT_MODE=fallback` |

Kontrat kimlikleri (`CHANNEL_CONTRACT_ID`, `USDC_CONTRACT_ID`, DEX, kredi havuzu) imaja kopyalanan `deployments/testnet.json`'dan okunur; env'de vermek gerekmez.

**Demo ajanının gizli dosyaları** depoda yoktur; konteyner girişi bunları env'den yazar (`backend/docker-entrypoint.sh`):

| Değişken | Yazıldığı yer | Not |
|---|---|---|
| `DEPLOY_SECRETS_ENV` | `deployments/.secrets.env` | Yerel dosyanın içeriği, çok satırlı. Ajan `AGENT_SECRET` ve `AGENT_OWNER_SECRET`'ı buradan okur |
| `RELAYER_SECRET` | `agents/.relayer.env` | İsteğe bağlı. Verilmezse ajan ilk koşuda yeni bir relayer üretip friendbot'tan fonlar; konteyner yeniden başlarsa dosya gider ve bir daha üretir |

Giriş betiği önce `prisma migrate deploy` çalıştırır; ilk açılışta tablolar oluşur.

### Sağlık ve özellikler

- Sağlık kontrolü: `GET /health` → `{"ok":true,…}`. `priceOk:false` görmek normaldir; havuz ilk fiyat isteğinde okunur.
- `GET /events` SSE'dir ve dakikalarca açık kalır. Proxy'nin yanıtı tamponlamaması gerekir (`X-Accel-Buffering: no` başlığı gönderiliyor). Railway ve Fly bunu sorunsuz geçirir; Render'da HTTP zaman aşımını kontrol et.
- Tek örnek (instance) çalıştır. Kanal önbelleği, akış oturumları ve ajan süreci bellekte; ikinci örnek bunları paylaşamaz.
- Konteyner kapanırken açık SSE bağlantıları zorla kapatılır (`forceCloseConnections`), yeniden başlatma takılmaz.

## 2. Site (landing-page) — Vercel

- Root directory: `landing-page`. Framework: Next.js. Derleme komutu varsayılan.
- Ortam değişkenleri (`landing-page/.env.example`):

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Sitenin kendi adresi (OG, sitemap, canonical) |
| `NEXT_PUBLIC_API_URL` | Backend adresi (`PUBLIC_URL` ile aynı) |
| `NEXT_PUBLIC_APP_URL` | Konsol adresi |

`/docs` dil önekinin dışında ve statiktir; ek ayar gerekmez.

## 3. Konsol (app.mandate) — Vercel

- Root directory: `app.mandate`.
- Ortam değişkenleri (`app.mandate/.env.example`):

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend adresi (`PUBLIC_URL` ile aynı) |
| `NEXT_PUBLIC_MARKETING_URL` | Tanıtım sitesinin adresi — `https://www.reinkey.com` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` ya da `public`; backend'in ağıyla aynı olmalı |

- Konsolda `NEXT_PUBLIC_SITE_URL` **tanımlanmaz**. Kabuktaki logo ve belge bağlantıları `NEXT_PUBLIC_MARKETING_URL`'e gider; buraya `reinkey.io` yazılırsa logo kullanıcıyı bulunduğu sayfaya geri atar.
- Konsol tamamen istemci tarafındadır; backend'e tarayıcıdan bağlanır. Bu yüzden konsol adresi backend'in `CORS_ORIGINS`'inde olmak zorunda.

## 4. CORS'u kapat ve doğrula

Backend'de `CORS_ORIGINS`'i gerçek site ve konsol adresleriyle güncelle, yeniden başlat. Sonra:

```bash
curl -s $API/health
curl -s $API/supported          # asset ve channelContract görünmeli
curl -i $API/demo/book | head -1  # HTTP/1.1 402
```

Konsolu aç: sağ üstte "Canlı · Stellar testnet" yeşil yanmalı. "Ajanı başlat" ile bir tur çalıştır; Canlı görünümde kuponlar akmalı, Meter görünümünde kanal görünmeli.

## Riskler

- **Günlük tavan.** Demo hesabının günlük tavanı 5 USDC; bir tur ≈ 0,55 USDC harcar. Ledger günü değişince sıfırlanır. Sunum öncesi `GET /accounts/<demoAccountId>` ile `spentToday`'e bak.
- **Relayer bakiyesi.** Ajanın işlemlerini relayer öder (XLM). Friendbot 10.000 XLM verir, demo için fazlasıyla yeter; ama relayer her konteyner yeniden başlatmasında yeniden üretilirse friendbot sıklık sınırına takılabilir. `RELAYER_SECRET` vermek daha güvenli.
- **Testnet dalgalanması.** RPC yavaşlarsa fiyat kaynağı `PRICE_SOURCE_UNAVAILABLE` döner ve akış başlamaz. Brief'teki yedek: yerel `stellar/quickstart` konteyneri. Sunumda yedek video da bulundur.
- **Gizli anahtarlar.** `.env`, `deployments/.secrets.env` ve `agents/.relayer.env` gitignore'da. Platform panelindeki env değerlerini paylaşma; `DEPLOY_SECRETS_ENV` sahip anahtarını da içerir.
