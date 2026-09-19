# NOTES — Reinkey güncellemesi (Hat 4)

`docs/LANDING.md` uygulandı. `npm run lint`, `npm run typecheck`, `npm run build` geçiyor.

## Ne değişti

- **Ad ve metinler:** `site.name = "Reinkey"`. `messages/tr.json` ve `en.json` §3'e göre baştan yazıldı; iki dilin anahtar yapısı aynı. Ad metinlerde `{name}` ile geçer; `t.raw()` dizilerinde `content/site.ts` → `withName()` doldurur.
- **Playground** (`components/landing/Playground.tsx`) yeniden yazıldı: saf bir reducer, tamsayı birim (1 = 0.0001 USDC), §4'teki politika, fiyat ve eylemler. Sayaç şeridi en üstte; zincir işlemleri 600 ms animasyon + "≈5 sn" etiketiyle, akış 40 ms/token. "Hareketi azalt" açıksa akış ve animasyon anında biter. Ekran okuyucuya yalnızca sonuçlanmış son satır duyurulur (akış sırasında her token'da değil).
- **Bölümler:** Compare (exact vs channel + ölçüm notu), Problem, Statement, HowItWorks (3 adım), Architecture (4 kart + "Neden Stellar" satırı), Features, Limits, Audience, Pricing, FAQ, Closing, Footer, Nav. Nav/Footer'da "Denetim defteri" → "Canlı panel" (`routes.ledger` → `routes.panel`). Footer'a SCF RFP bağlantısı eklendi.
- **İşaret:** anahtar (halka + gövde + tek diş) ve halkadan kavisle çıkan dizgin. `Wordmark.tsx`, `opengraph-image.tsx`, `apple-icon.tsx`, `icon.svg` aynı geometriyi kullanıyor; 16 px'te kontrol edildi. İkon ve OG'de dizgin aksan rengi alır.
- **Bu oturumda ayrıca istenenler:** hero'daki kayan istek/karar şeridi kaldırıldı; tema seçimi kaldırıldı, site yalnızca koyu temada (`components/theme/` silindi). Tema çerezi okunmadığı için `/tr` ve `/en` artık statik üretiliyor.
- `.env.example`, `lib/env.ts`, `README.md` açıklamaları güncellendi.

## Bilerek bıraktıklarım

- **Yollar backend'le aynı:** Playground, kapanış komutu ve fiyat tablosu `/demo/book` ve `/demo/chat` kullanıyor (`docs/BACKEND.md` §6). LANDING.md `GET /book`, `POST /chat` yazıyordu; gerçek uçlarla aynı olsun diye backend'dekini seçtim.
- **Kanal yokken çağrı → `CHANNEL_NOT_FOUND`:** LANDING.md'nin kod listesinde yok ama backend'in facilitator kodlarında var; bu durum için uydurma bir kod yazmak yerine onu kullandım.
- **İkinci "Kanal aç" = `top_up`:** Açık kanala basınca depozito eklenir (channel kontratındaki `top_up`). Böylece 6. depozitoda `DAILY_CAP_EXCEEDED` görülebiliyor.
- **Reddedilen zincir işlemi sayaca eklenmez:** simülasyonda düşen işlem zincire yazılmaz.
- **`VOUCHER_NOT_INCREASING`** tipte var ama hiçbir eylem tetiklemiyor (site eski kupon gönderemez).
- **Fiyat tablosu kaldı** ama yalnızca demo satıcının gerçek fiyatlarıyla (0.0005 / çağrı, 0.00002 / token; backend `.env` değerleri). Plan kartlarında rakam yok: "Ücretsiz", "Yakında", "Açık kaynak".
- Temizlik grep'inde kalanlar bilinçli: `ledger` (Stellar terimi), Satıcı planındaki "Denetim defteri" (§3 pricing), `app.mandate` (panel klasörünün gerçek adı), `matchMedia` (yanlış eşleşme).

## Emin olmadıklarım

- **Akışın "ikinci ya da üçüncüde kesilmesi" bu rakamlarla olmuyor.** 1 USDC depozito = 10 000 birim; ~200 token'lık akış 4 dilim × 10 = 40 birim → bir kanal ~250 akışa yeter. §4'teki fiyat ve depozitoyu değiştirmedim. Kesilme şu an kanal çağrılarla neredeyse doldurulunca görülüyor (test edildi: 20 birim kala akış 100. token'da, cümle ortasında `CHANNEL_EXHAUSTED` ile kesiliyor). Karar gerekiyor: ya demo için ayrı küçük bir depozito düğmesi, ya daha pahalı bir "demo LLM" fiyatı, ya da olduğu gibi bırakmak.
- "Testnet ölçümü; ledger ~5 sn." notu §3'ten birebir; gerçek ölçüm backend hazır olunca teyit edilmeli.
- İngilizce metinlerde "Live dashboard" (panel) ve "Settle" (tahsil et) karşılıkları.
- Mimari kartındaki `meter()` notu ve `open · top_up · claim · close` listesi BACKEND.md'den; kontrat arayüzü değişirse güncellenmeli.

## Ürünleştirme (19 Eylül, akşam)

- **Ürün mimarisi:** Reinkey şemsiye ad; altında iki ürün: **Meter** (satıcı, `@reinkey/meter`) ve **Reins** (ajan hesabı, `@reinkey/sdk`). Tanımlar `content/site.ts` → `products`. Ana sayfaya `Products` bölümü (Hero'dan hemen sonra), `/[locale]/meter` ve `/[locale]/reins` ürün sayfaları (`ProductPage`), ürün işaretleri (`ProductMark`) eklendi.
- **Menü:** Meter · Reins · Nasıl çalışır · Ücretler · Belgeler; "Canlı panel" → "Konsol"; birincil CTA "Geliştirmeye başla" → `/docs`. Çapalar artık `/${locale}#…` biçiminde; menü ürün sayfalarında da çalışır.
- **Belgeler:** `app/(docs)` ayrı bir kök düzen, tek dil (İngilizce), dil önekinin dışında (`proxy.ts` `/docs`'a dokunmaz). MDX (`@next/mdx`, `remark-gfm`, `rehype-slug`); tipografi `mdx-components.tsx`'te. Gezinme ağacı `content/docs.ts`.
- **Kod örnekleri** `content/snippets.ts`'te ve paketlerin gerçek arayüzüyle birebir; arayüz değişirse önce orası.
- **Dürüstlük notu:** Meter'da token/saniye akışları dış satıcıya açık DEĞİL (akış oturumları yalnızca facilitator'ın demo satıcısında). Ürün sayfası ve `/docs/meter/reference` bunu açıkça söylüyor. Paketler npm'de yayında değil; belgeler bunu da söylüyor.
