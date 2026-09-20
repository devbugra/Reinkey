# Reinkey Console

Reinkey'in konsolu (Hat 3). Üç görünüm, hepsi gerçek veriden:

- **Canlı** (`/`): ödemeler, zincir işlemleri ve redler tek akışta; senaryo adımları, fiyat grafiği, demo kontrolleri.
- **Meter** (`/?view=meter`): satıcı görünümü. Bir `payTo` adresine ödeme yapan kanallar, tahsil edilen ve bekleyen gelir, elle tahsilat, adresle doldurulmuş entegrasyon örneği.
- **Reins** (`/?view=reins`): ajan hesabı görünümü. Zincirdeki politika, bugünkü harcama, hesabın kanalları, engellenen işlemler ve kalıcı defter.

Adres verilmezse backend'in demo hesabı ve demo satıcısı gösterilir; `&account=C…` ya da `&seller=G…` ile (ya da görünümdeki arama kutusuyla) herhangi bir adrese bakılır. Görünüm ve adres URL'de durur, bağlantı olarak paylaşılabilir. Demo kontrolleri (ajan başlatma, dondurma) yalnızca demo hesabı için çalışır.

## Tasarım dili

- **Ray.** Ürün bir ödeme rayıdır; gezinme de öyle çizilir: solda kesintisiz dikey hat ve üzerinde istasyonlar (`components/Shell.tsx`, `.rail` / `.station`). Sayfa içindeki numaralı bölüm başlıkları (`Section`) ve senaryo adımları (`.track`) aynı hattın devamıdır.
- **Her sayfa aynı iskelet:** `PageHeader` (hangi ürün, burada ne görülür) → bağlam (hangi adres) → özet sayılar → ayrıntı. Geniş boşluk yalnızca başlık ile gövde arasında; görünüm içi bloklar sıkı dizilir.
- **Yüzey:** tek kart türü (`.card`: üstten sönen ışık + 1px highlight), tanıtım sitesiyle aynı token'lar ve aynı yazı tipleri (Sora başlık, Inter gövde, JetBrains Mono kod). İç içe kutu yok.
- **Demo kontrolleri** kesik çizgili bir şeritte ve "DEMO" etiketiyle durur: konsolun ilk gösterdiği şey düğme değil durumdur.
- Dar ekranda kenar çubuğu üst çubuk + çekmeceye döner; KPI'lar iki sütun.

Next.js 16 + Tailwind 4, tamamen istemci tarafında çalışır.

```bash
cp .env.example .env.local   # PORT=3002, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL
npm install
npm run dev                  # http://localhost:3002
```

## Veri kaynağı

**Yalnızca gerçek backend.** Panelde örnek ya da üretilmiş veri yoktur; backend'e ulaşılamıyorsa panel boş kalır ve bunu söyler.

- `GET /events` (SSE), `GET /stats`, `GET /demo/info`, `GET /channels`, `GET /accounts/:addr`, `GET /accounts/:addr/ledger` (Defter sekmesi), `GET /demo/agent`.
- **Fiyat grafiği** SSE'deki geçici `ticker.tick` olayından çizilir: borsanın ajana sattığı tik'in kopyasıdır, deftere yazılmaz ve yeniden bağlanınca tekrar gelmez (sayfa yenilenirse grafik o andan başlar).
- **Kontroller gerçek işlem başlatır:** "Ajanı başlat" ve "Ele geçirilmiş ajan" backend'de `agents/` sürecini çalıştırır (`POST /demo/agent/run`); "Ajanı dondur" sahibin anahtarıyla hesabı zincirde dondurur (`POST /demo/owner/freeze`); "Şimdi tahsil et" biriken kuponları tek işlemle tahsil eder (`POST /channels/:id/claim`). Backend'de `DEMO_CONTROLS=true` olmalı.
- İşlem hash'leri stellar.expert testnet'e bağlanır.
- **"Ekranı temizle" veri silmez:** o andan eski olayları gizler ve sayaçları o anki `/stats` değerinden farkla gösterir ("Bu turda"). Kesim `sessionStorage`'da durur; "tümünü göster" kaldırır.
- **Sunum modu** (başlıkta): paneli %125 büyütür ve tam ekrana geçer.

## Dosyalar

| Dosya | İşi |
|---|---|
| `lib/types.ts` | Olay ve yanıt tipleri (BACKEND.md §8.2 ile birebir) |
| `lib/useFeed.ts` | SSE, 100 ms'lik olay paketleri, açılış verisi, periyodik sorgular, demo kontrolleri, ekran temizleme, anlık sayaçlar (`/stats` + son sorgudan beri akıştan gelenler) |
| `lib/hooks.ts` | Sayı animasyonu, öğe boyutu |
| `lib/useView.ts` | Görünüm ve adres durumu (URL'de) |
| `lib/api.ts` | Backend çağrıları ve hata biçimi |
| `lib/store.ts` | Olaylardan panel durumu; kupon satırlarını birleştirme |
| `lib/codes.ts` | Sebep kodlarının Türkçe açıklaması |
| `components/*` | Kontroller, senaryo adımları (olaylardan türetilir), ana sayaç, fiyat grafiği, onay süresi dağılımı, kanal geçmişi, paranın yolu (hesap → kanal → borsa), "Ne oldu?" akışı, engellenen işlemler, alım-satım, ajan terminali |

## Notlar

- Para her yerde `BigInt`; tutarlar backend'den taban birimle (7 ondalık) string gelir.
- İşaret (`components/Mark.tsx`) geçici; kesin logo landing tarafında çizilince aynı geometriyle güncellenmeli.
