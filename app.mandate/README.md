# Reinkey Console

Reinkey'in konsolu. Görünümlerin hepsi gerçek veriden okur:

- **Canlı** (`/`): ödemeler, zincir işlemleri ve redler tek akışta; paranın yolu, fiyat grafiği, olaylar.
- **Meter** (`/?view=meter`): satıcı görünümü. Bir `payTo` adresine ödeme yapan kanallar, tahsil edilen ve bekleyen gelir, elle tahsilat, adresle doldurulmuş entegrasyon örneği.
- **Reins** (`/?view=reins`): ajan hesabı görünümü. Zincirdeki politika, bugünkü harcama, hesabın kanalları, engellenen işlemler ve kalıcı defter.

Adres verilmezse backend'in örnek hesabı ve örnek satıcısı gösterilir; `&account=C…` ya da `&seller=G…` ile (ya da görünümdeki arama kutusuyla) herhangi bir adrese bakılır. Görünüm ve adres URL'de durur, bağlantı olarak paylaşılabilir.

Örnek akışın kontrolleri (ajan başlatma, dondurma, ajan terminali) **yalnızca örnek hesapta görünür**: kendi adresini bağlayan birinin konsolunda senaryo düğmesi işi yoktur ve backend de onları yalnızca örnek hesap için kabul eder.

## Tasarım dili

- **Ray.** Ürün bir ödeme rayıdır; gezinme de öyle çizilir: solda kesintisiz dikey hat ve üzerinde istasyonlar (`components/Shell.tsx`, `.rail` / `.station`). Sayfa içindeki numaralı bölüm başlıkları (`Section`) ve örnek akışın adımları (`.track`) aynı hattın devamıdır.
- **Her sayfa aynı iskelet:** `PageHeader` (hangi ürün, burada ne görülür) → bağlam (hangi adres) → özet sayılar → ayrıntı. Geniş boşluk yalnızca başlık ile gövde arasında; görünüm içi bloklar sıkı dizilir.
- **Yüzey:** tek kart türü (`.card`: üstten sönen ışık + 1px highlight), tanıtım sitesiyle aynı token'lar ve aynı yazı tipleri (Sora başlık, Inter gövde, JetBrains Mono kod). İç içe kutu yok.
- **Örnek akışın kontrolleri** kendi şeridinde ve "Örnek hesap" etiketiyle durur: konsolun ilk gösterdiği şey düğme değil durumdur.
- Dar ekranda kenar çubuğu üst çubuk + çekmeceye döner; KPI'lar iki sütun.

## Diller

Konsol Türkçe ve İngilizce konuşur (`next-intl`). Dil **adres çubuğunda değil**, tarayıcıda durur: her görünüm paylaşılabilir bir bağlantıdır (`?view=…&account=…`) ve dili oraya yazmak, paylaşılan bağlantının karşıdakinin dilini de değiştirmesi demekti.

Sıra: `?lang=tr|en` (destek bağlantıları için) → önceki seçim → tarayıcının dili → Türkçe. Seçim kenar çubuğunun altındaki düğmelerle değişir ve `localStorage`'a yazılır.

Sayı, saat ve süre biçimleri seçili dile uyar. **USDC tutarları uymaz:** tutar protokol metnidir ve her dilde `1,234.5678` yazılır — aynı sayının iki farklı yazımı, kopyalanıp zincirde aranan bir değerde kazançtan çok hata üretir.

Metin eklerken: `messages/tr.json` ve `messages/en.json` birlikte güncellenir, anahtar yapıları ayrışamaz. Sayı taşıyan cümlelerde ICU çoğulu kullanın (`{count, plural, one {# payment} other {# payments}}`); İngilizcede tekil/çoğul ayrımı var, Türkçede yok.

Next.js 16 + Tailwind 4, tamamen istemci tarafında çalışır.

```bash
cp .env.example .env.local   # PORT=3002, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL
npm install
npm run dev                  # http://localhost:3002
```

## Veri kaynağı

Her sayı backend'den ve zincirden gelir; backend'e ulaşılamıyorsa panel boş kalır ve bunu söyler.

- `GET /events` (SSE), `GET /stats`, `GET /demo/info`, `GET /channels`, `GET /accounts/:addr`, `GET /accounts/:addr/ledger` (Defter sekmesi), `GET /demo/agent`.
- **Fiyat grafiği** SSE'deki geçici `ticker.tick` olayından çizilir: borsanın ajana sattığı tik'in kopyasıdır, deftere yazılmaz ve yeniden bağlanınca tekrar gelmez (sayfa yenilenirse grafik o andan başlar).
- **Kontroller gerçek işlem başlatır:** "Ajanı başlat" ve "Ele geçirilmiş ajan" backend'de `agents/` sürecini çalıştırır (`POST /demo/agent/run`); "Ajanı dondur" sahibin anahtarıyla hesabı zincirde dondurur (`POST /demo/owner/freeze`); "Şimdi tahsil et" biriken kuponları tek işlemle tahsil eder (`POST /channels/:id/claim`). Backend'de `DEMO_CONTROLS=true` olmalı.
- İşlem hash'leri stellar.expert testnet'e bağlanır.
- **"Ekranı temizle" veri silmez:** o andan eski olayları gizler ve sayaçları o anki `/stats` değerinden farkla gösterir ("Bu turda"). Kesim `sessionStorage`'da durur; "tümünü göster" kaldırır.

## Dosyalar

| Dosya | İşi |
|---|---|
| `lib/types.ts` | Olay ve yanıt tipleri (BACKEND.md §8.2 ile birebir) |
| `lib/useFeed.ts` | SSE, 100 ms'lik olay paketleri, açılış verisi, periyodik sorgular, demo kontrolleri, ekran temizleme, anlık sayaçlar (`/stats` + son sorgudan beri akıştan gelenler) |
| `lib/hooks.ts` | Sayı animasyonu, öğe boyutu |
| `lib/useView.ts` | Görünüm ve adres durumu (URL'de) |
| `lib/api.ts` | Backend çağrıları ve hata biçimi |
| `lib/store.ts` | Olaylardan panel durumu; kupon satırlarını birleştirme |
| `lib/codes.ts` | Sebep kodlarının insan okunur karşılığı (sözlükten) |
| `lib/locale.ts` | Dil tercihi: `?lang=` → önceki seçim → tarayıcı → `tr`; tarayıcıda saklanır |
| `lib/t.ts` | React dışındaki modüller için çevirmen (`api.ts`, `chain.ts`, `codes.ts`) |
| `messages/*.json` | Arayüz metinleri; iki dilin anahtar yapısı birebir aynı |
| `components/*` | Kontroller, örnek akışın adımları (olaylardan türetilir), ana sayaç, fiyat grafiği, onay süresi dağılımı, kanal geçmişi, paranın yolu (hesap → kanal → satıcı), "Ne oldu?" akışı, engellenen işlemler, alım-satım, ajan terminali |

## Notlar

- Para her yerde `BigInt`; tutarlar backend'den taban birimle (7 ondalık) string gelir.
- İşaret (`components/Mark.tsx`) tanıtım sitesindeki `Wordmark.tsx` ile aynı geometriyi kullanır; biri değişirse ikisi birlikte güncellenir.
