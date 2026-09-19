# Ajan-yerli borsa ve ödeme kontrol katmanı — proje tanımı

**Durum:** taslak, geliştirmeye hazır
**Tarih:** 19 Eylül 2026
**Etkinlik:** Stellar Pro Hackathon, İstanbul, 19–20 Eylül, Genesis track
**Ağ:** Stellar testnet (Soroban)
**Proje adı:** karar bekliyor — "ArgusPay" elendi. Aday yön: yetki/mühür teması (Tuğra, Berat) ya da fintech terimi (Mandate). Alan adı + npm adı + TÜRKPATENT kontrolü yapılmadan kesinleştirme.

---

## 1. Tek cümle

Bir yapay zekâ ajanının kimseden izin almadan gelip işlem yapabildiği, her çağrının x402 ile ödendiği ve harcama sınırının zincir üstünde uygulandığı bir borsa katmanı.

### Ayrışma noktası

Yanlış ifade: "Binance'e bot koyamazsın." Koyabilirsin — API anahtarı alıp yazarsın.

Doğru ifade: **Binance'e ajan kendi başına gelip hesap açamaz.** İnsan olmadan KYC, anahtar üretimi, abonelik, limit ayarı yok. Bizim farkımız bu: ajan cüzdanıyla gelir, kendini tanıtır, çağrı başına öder, kendi sınırıyla çalışır. Arada hiç insan yok.

### Açılış cümlesi (sunum)

Ajanlar para harcamaya başladı, harcamayı durduran katman yok.

---

## 2. Klasik borsa ile karşılaştırma

| Katman | Bugünkü borsa | Bizimki |
|---|---|---|
| Hesap açma | KYC, e-posta, panel | Yok. Cüzdan adresi kimliktir |
| Erişim | API anahtarı, rate limit | x402, çağrı başına ödeme |
| Piyasa verisi | Aylık abonelik | Çağrı başına ödeme (ileride `upto` ile sayaçlı) |
| Emir gönderme | Ücretsiz, komisyon işlemden | Emir gönderimi x402 isteği, ücret peşin |
| Bakiye | Borsa cüzdanında, emanet | Kullanıcının vault kontratında, emanet yok |
| Yetki | Panelden anahtar izinleri | Politika kontratı, zincir üstünde |
| Uzlaşma | Borsanın iç defteri | Zincirde, gerçekleşen emirde |
| Komisyon modeli | Maker/taker yüzdesi | Emir başına sabit mikro ücret |

Komisyon modelinin değişmesi tesadüf değil: ajan ekonomisinde doğru birim yüzde değil, çağrı.

---

## 3. Mimari

### Ne zincirde, ne zincir dışında

**Zincir dışı (hızlı olması gereken):**
- Eşleştirme motoru — bellekte, fiyat-zaman önceliği
- Emir defteri
- Piyasa verisi üretimi
- x402 facilitator mantığı

**Zincir üstü (güvenilmesi gereken):**
- Vault kontratı — fon kilidi, emanetsiz saklama
- Politika kontratı — limit ve yetki, `__check_auth`
- Uzlaşma — gerçekleşen emrin USDC transferi (SAC üzerinden)

Emanet sorusuna cevap hazır olmalı: fon kullanıcının vault kontratında durur, borsa yalnızca eşleştirir, transfer ancak ajanın imzaladığı yetki sınırında gerçekleşir. Bu klasik borsadan daha güvenli ve satış argümanı budur.

### Bileşenler

| Bileşen | İşi | Teknoloji |
|---|---|---|
| Vault kontratı | Fonu kilitler, emanetsiz tutar, uzlaşmayı yürütür | Rust, `soroban-sdk` |
| Politika kontratı | Limit, beyaz liste, günlük tavan. Geçilmezse imza yok | Rust, `__check_auth` |
| Eşleştirme motoru | Emirleri eşleştirir, zincir dışı | TypeScript, bellek içi |
| x402 katmanı | Her uç noktada ödeme kapısı | `@x402/stellar` |
| Piyasa verisi ucu | Defter ve fiyat verisini çağrı başına satar | Express |
| Denetim defteri | Her izin, red, ödeme ve emir; sebebiyle | Postgres + basit arayüz |
| Ajan SDK | Ürünleşme tarafı: npm paketi + API anahtarı | TypeScript |

---

## 4. API yüzeyi

Tüm uçlar x402 korumalı. İlk istek 402 ile şartları döner, imzalı tekrar istek veriyi getirir.

```
GET  /book?pair=USDC-XLM        Emir defteri anlık görüntüsü
GET  /ticker?pair=              Son fiyat, hacim
GET  /trades?pair=              Gerçekleşen işlemler
POST /order                     Emir gönderimi (ücret peşin)
DELETE /order/{id}              İptal
GET  /account/limits            Ajanın kalan bütçesi ve kuralları
GET  /account/ledger            Kendi işlem ve ödeme geçmişi
```

Keşif uçları (zaman kalırsa, x402 Bazaar uyumlu):

```
GET /discovery/resources        Katalog, filtreli
GET /discovery/search           Doğal dil arama
```

### Makineye satan servisin kuralları

- Kayıt ekranı, panel, onboarding yok. Tek yüzey HTTP.
- Ücreti satıcı sponsorlar; alıcının XLM'i olmasın, `extra.areFeesSponsored` doğru ilan edilsin.
- Her red makine okunabilir bir sebep kodu döndürür. Boş sebep yok.
- Çıktı deterministik ve sürümlü. Serbest metin dönme.
- Kendini üç formatta tanıt: OpenAPI, `llms.txt`, MCP sunucusu.

---

## 5. Politika kuralları (ilk sürüm)

| Kural | Örnek değer | Nerede uygulanıyor |
|---|---|---|
| Günlük harcama tavanı | 50 USDC | Zincir |
| Tek emir limiti | 5 USDC | Zincir |
| Enstrüman beyaz listesi | USDC-XLM | Zincir |
| Alıcı beyaz listesi | vault adresi | Zincir |
| Çağrı sıklığı | dakikada 60 | Zincir dışı |
| Veri bütçesi | günlük 2 USDC | Zincir dışı |

Kural seti zincirden ayrı bir modülde dursun; zincir tarafı yalnızca "uygula" kancası olsun. Bugün tek uygulayıcı Soroban. İkinci bir zincir gerektiğinde üst katman aynı kalır.

---

## 6. Stellar'a özgü kısıtlar

Bunlar projeyi Stellar'a bağlayan ve aynı zamanda mümkün kılan şeyler.

**Paralellik.** Protokol 23 ile Soroban işlemleri paralel işleniyor (CAP-0063: aşamalar ve bağımsız kümeler), canlı state bellekte tutuluyor. Ama bu **kapasiteyi** artırıyor, **gecikmeyi** değil. Ledger kapanışı 5 saniye, SDF hedefi 2,5 saniye ve teorik 5000 TPS.

**Sonuç:** yüksek frekanslı işlem bu yapıda mümkün değil. Hedef kitle saniye değil dakika ölçeğinde çalışan stratejiler: portföy dengeleme, DCA, sinyal bazlı giriş-çıkış, hazine yönetimi. Bunu baştan kabul et ve konumlandır; gizlersen ilk soruda yakalanır.

**Kanayacak dört yer, öncelik sırasıyla:**

1. **Auth entry imzalama.** İşlemi facilitator kurar; istemci yalnızca belirli bir kontrat çağrısına izin veren auth entry imzalar. Cüzdanın bunu desteklemesi şart.
2. **İmza ömrü.** `signatureExpirationLedger` ile sınırlı, varsayılanda ~12 ledger (60 saniye civarı). Ajan döngüsü yavaşsa imza elde ölür.
3. **Trustline.** Hesap, SEP-41 varlığını alabilmek için önce trustline açmalı. En sessiz kırılma noktası.
4. **Kaynak limitleri.** İşlem başına en fazla 200 okuma; instruction, bellek ve write-entry tavanları. Reentrancy yasak → Abstract Account deseni. Storage entry'leri TTL ile evict olur, politika state'i için uzatma stratejisi gerekir.

**Sequence number darboğazı.** Tek hesaptan seri işlem gönderilemez; yoğun trafikte kanal hesabı havuzu gerekir.

**Maliyet.** Bir uzlaşma yaklaşık 0,0023 XLM — sentin küçük bir kesri. İstek başına mikro ödemeyi mümkün kılan tek şey bu.

**x402 toplu uzlaşma yok.** `batch-settlement` ertelenmiş durumda; Stellar'da escrow kontratı, kupon deposu ve çift harcama koruması gerektiriyor. Şimdilik her gerçekleşen emir ayrı uzlaşma.

---

## 7. Teknik yığın

```
Ağ:        Stellar testnet
RPC:       https://soroban-testnet.stellar.org
Fonlama:   https://friendbot.stellar.org?addr=G...
Varlık:    testnet USDC (SAC üzerinden)
Kontrat:   Rust + soroban-sdk
Ödeme:     @x402/stellar (Apache-2.0, iki ağı da destekler)
Sunucu:    Node + TypeScript + Express
Veri:      Postgres
Cüzdan:    Freighter (birincil), Passkey Kit (zaman kalırsa)
```

### Repo yapısı

```
contracts/
  vault/            Fon kilidi ve uzlaşma
  policy/           Limit ve yetki, __check_auth
packages/
  sdk/              Politika istemcisi — ileride satılacak npm paketi
  core/             Zincirden bağımsız kural motoru
apps/
  exchange/         Eşleştirme motoru + emir defteri
  gateway/          x402 korumalı API yüzeyi
  agent/            Demo ajanları (alıcı ve satıcı)
  ledger/           Denetim defteri ve arayüz
```

### Kurulum komutları

```bash
cargo install --locked stellar-cli

stellar keys generate --global alice --network testnet --fund
stellar contract init contracts/policy
cd contracts/policy && stellar contract build

stellar contract deploy \
  --wasm target/wasm32v1-none/release/policy.wasm \
  --source alice --network testnet

stellar contract bindings typescript \
  --id C... --network testnet --output-dir ./packages/sdk/generated
```

---

## 8. 36 saatlik plan

| Saat | İş | Blok sonunda elde |
|---|---|---|
| 0–3 | Kurulum, testnet hesapları, USDC trustline, `@x402/stellar` ile tek ödeme | Zincirde tamamlanmış tek x402 ödemesi |
| 3–7 | Gateway: 402 dönen, ödeme doğrulanınca veri veren `GET /book` | Dışarıdan çağrılabilen ücretli API |
| 7–12 | Politika kontratı: limit, beyaz liste, `__check_auth` | Zincirde reddedilen bir işlem |
| 12–16 | Eşleştirme motoru + `POST /order` | Emir giriyor, eşleşiyor |
| 16–20 | Uyku ve tampon | — |
| 20–24 | Vault kontratı ve uzlaşma | Eşleşen emir zincirde kapanıyor |
| 24–28 | İki demo ajanı: biri alıyor, biri satıyor | Kendi kendine işleyen döngü |
| 28–31 | Denetim defteri ve arayüz | Her karar sebebiyle görünür |
| 31–33 | Sağlamlaştırma, hata kodları, canlıya alma | Jüriye verilecek URL |
| 33–36 | Sunum, video yedeği, teslim | Teslim edilmiş proje |

**Kesme kuralları:**
- 12. saatte politika kontratı zincirde çalışmıyorsa → politikayı sunucuda uygula, kontratı 28–31 arası ekle.
- 33. saatten sonra yeni özellik yok, sadece düzeltme ve sunum.
- Sunumdan 4 saat önce ne çalışıyorsa proje odur. Gerisi kesilir.
- Keşif uçları (Bazaar) opsiyonel. Çekirdek çalışmadan başlanmaz.

---

## 9. Demo senaryosu

Sahnede iki dakika, sırasıyla:

1. İki ajan başlar. Hiçbiri kayıt olmamış, anahtar almamış. Yalnızca cüzdanları var.
2. Biri `GET /book` çağırır, çağrı başına öder, defteri alır.
3. `POST /order` ile emir gönderir, ücreti peşin öder. İkinci ajan karşı tarafı doldurur.
4. Emir eşleşir, uzlaşma zincirde kapanır. Ekranda işlem hash'i görünür.
5. Üçüncü emir günlük limiti aşar. Red sunucudan değil **zincirden** gelir; sebep kodu defterde görünür.
6. Defter açılır: hangi ajan ne harcadı, hangi kural neyi durdurdu.

**Kapanış cümlesi:** Bu bir video değil, şu anda canlı bir URL. Jürinin kendi ajanı da çağırabilir.

**Sunumda söylenmeyecekler:** teknik zorluklar, yetişmeyen özellikler, yol haritası detayı. Üçü de soru gelirse cevaplanır, gelmeden anlatılmaz.

---

## 10. Riskler ve plan B'ler

| Risk | Belirti | Plan B |
|---|---|---|
| Auth entry imzalama tutmaz | 6. saatte ödeme geçmiyor | Facilitator'ı kendi sunucuna göm (self-facilitation) |
| Politika kontratı yetişmez | 12. saat, `__check_auth` çalışmıyor | Sunucu tarafında uygula, kontratı sona bırak |
| İmza süresi doluyor | Aralıklı "expired" hataları | Ajan döngüsünü kısalt, imzayı istek anında al |
| Trustline eksik | Ödeme sessizce başarısız | Kurulum betiğine trustline adımını koy, hesapları önceden hazırla |
| Testnet dalgalanır | RPC yavaş ya da hatalı | Yerel `stellar/quickstart` konteyneri yedekte |
| Canlı demo çöker | Sahnede bağlantı yok | 90 saniyelik önceden çekilmiş video |
| Kapsam şişer | 20. saatte üç parça yarım | Keşif ve defter kesilir, çekirdek üçlüye dönülür |

**Kalıcı ürün riskleri:**
- Politika motoru tek başına taklit edilebilir. Savunmayı risk verisi kalitesi ve denetim derinliği sağlar.
- Ajan ödemeleri henüz hacim üretmiyor. Ürün yalnızca ajanlara değil, otomatik ödeme yapan her arka plan sistemine konumlanmalı.

---

## 11. Kapsam dışı ve hukuk

**Kapsam dışı:** KYC ve kimlik doğrulama, fiat giriş/çıkış, müşteri parası saklama, yatırım tavsiyesi, yüksek frekanslı işlem, mainnet.

**Hukuki sınır:** KYC'siz emanet borsası Türkiye'de lisanssız çalışamaz. Bizim yapı emanetsiz — fon kullanıcının kontratında. Bu bizi "borsa işletmecisi" değil "protokol" tarafına yaklaştırır. Mainnet'e çıkmadan önce avukat görüşü alınacak. Hackathon testnet olduğu için bugün engel yok; teslimde "testnet, emanetsiz protokol" ifadesi kullanılacak.

**Konumlandırma:** Borsa olma, borsalara ve ajanlara takılan ara katman ol. Alıcı da borsa olabilir; sen altyapı satarsın.

---

## 12. Zincir bağımsızlığı

Hackathon için Stellar'a özgü yazıyoruz, mecburuz. Ama şu ayrım baştan konulmalı, sonradan bir günlük değil bir aylık iş olur:

**Stellar'a gömülü kalır:** politika kontratı (`__check_auth` Soroban'a özgü), vault kontratı, SAC üzerinden uzlaşma, ücret sponsorluğu.

**Zincirden bağımsız kalır:** eşleştirme motoru, x402 katmanı (protokol zaten zincir bağımsız, yalnızca `network` alanı değişir), kural motoru, defter, API yüzeyi.

Sunumda tersi söylenir: "Stellar için yaptık, çünkü ücret sponsorluğu, auth entry modeli ve sentin kesri uzlaşma maliyeti bu ürünü mümkün kılan tek yer." Bu doğrudur ve jüri bunu duymak ister.

---

## 13. Hackathon sonrası

**Ürün çekirdeği.** Satılan şey borsanın kendisi değil, altındaki kontrol katmanı: npm paketi + API anahtarı ile entegre edilen SDK.

**Gelir modeli.** Aylık taban + hacim. Hedef müşteri başına yıllık 15.000 dolar civarı; 20 müşteri anlamlı bir tekrarlayan gelir demek.

**İlk dağıtım kanalı.** Mevcut freelance müşteri portföyü. Ürün oturduğunda doğrudan onların sistemine entegre edilir.

**Grant yolu.** SCF Build Award 150.000 dolara kadar XLM veriyor; RFP track'i geliştirici araçları için ve açık RFP'lerden biri x402 facilitator + Bazaar. Hackathon çıktısı teknik yeterlilik kanıtı olur. Soroban kontratları için ücretsiz denetim imkânı (Audit Bank) da var.

**İlk 90 gün.** 30 gün: kod yazmadan 10 potansiyel kurumsal müşteriyle konuş, hangi acı için bütçe ayırdıklarını öğren. 30–90 gün: bir müşteriye ücretli pilot sat, bedava kullandırma.

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

- [ ] Proje adı
- [ ] İşlem çifti: USDC-XLM mi, iki test varlığı mı
- [ ] Emir ücreti: sabit mi, tutara oranlı mı
- [ ] Cüzdan: yalnızca Freighter mı, Passkey Kit de mi
- [ ] Keşif uçları bu hackathonda yapılacak mı
