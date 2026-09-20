# Sunum akışı (≈3 dakika)

Sahne: solda konsol (https://www.reinkey.io), sağda terminal.
Tek cümlelik iddia: **x402 Stellar'da makine hızında çalışmıyor; biz eksik şemayı koyduk.**

Her rakam canlıdır. Ekranda ne varsa zincirden ya da gerçek bir çağrıdan gelir.

## Sunumdan 10 dakika önce

1. `curl -s https://reinkey.onrender.com/health` — ücretsiz katmanda servis uyuyabilir, uyandır.
2. `curl -s https://reinkey.onrender.com/accounts/<demoAccountId>` — `spentToday` günlük
   tavanın (5 USDC) altında mı. Bir tur ≈ 0,55 USDC harcar.
3. Konsolu `?key=<DEMO_CONTROL_KEY>` ile aç, **Ekranı temizle**: sayaçlar bu turdan başlasın.
4. Terminalde iki sekme hazırla, henüz çalıştırma:
   - `pnpm --filter @reinkey/agents exec tsx compare.ts`
   - `pnpm demo:injected`
5. Claude Desktop açık ve `reinkey` MCP sunucusu bağlı olsun.

## Akış

| # | Ekranda | Söylenen |
|---|---|---|
| 1 | Terminal: `compare.ts` çalışıyor | "x402 bugün Stellar'da şöyle çalışıyor: her ödeme ayrı bir işlem. Üç ödeme, üç işlem, 24 saniye. Ajan saniyede onlarca çağrı yapıyor; bu matematik tutmuyor." |
| 2 | Aynı çıktının ikinci yarısı | "Bizim şemayla: tek işlemle bir **oturum** açılıyor. Aynı üç ödeme bir işlem. Sonra aynı oturumda 40 ödeme daha — 0,1 saniye, **sıfır** yeni zincir işlemi." |
| 3 | Konsol, **Canlı akış**, *Ajanı başlat* | "Ajan kayıt olmadı, API anahtarı almadı. Tek işlemle oturumu açtı; depozito kilitlendi." — kanal kartında tek tx hash |
| 4 | Fiyat grafiği dolmaya başlar | "Borsanın canlı fiyat akışına bağlandı ve **dinlediği saniye kadar** ödüyor. Saniye başına ödeme, ayrı işlem olsaydı mümkün değildi." |
| 5 | Ana sayaç | "Şu an *N ödeme, 3 zincir işlemi*." |
| 6 | **Reins** görünümü | "Ödeyen taraf bir kontrat. Günde 5 USDC, işlem başına 1 USDC, yalnızca bu satıcı, yalnızca USDC↔XLM. Bu sınırlar sunucumuzda değil, `__check_auth` içinde." |
| 7 | **Engellenen işlemler** kırmızı satır | "Tavanı aşan işlemi denedi: `PER_TX_CAP_EXCEEDED`. Bu bir uyarı penceresi değil, **başarısız bir Stellar işlemi**. Hash'i burada." |
| 8 | Claude Desktop | "Şimdi asistana soruyorum: *XLM fiyatına bak, uygunsa yarım USDC'lik al.*" — asistan `reinkey_stream` ile fiyata ödüyor, `reinkey_quote` ile bakıyor, `reinkey_swap` diyor |
| 9 | Asistanın yanıtı | "`reinkey_budget` diyor ki: bu konuşmada 8 ödeme, 2 zincir işlemi. Ve tavanı aşan emri zincir reddetti — asistan bunu açıklayabiliyor ama aşamıyor. **MCP konuşan her asistan artık bir Stellar ödeyicisi.**" |
| 10 | **Meter** görünümü | "Satıcı tarafı: yüzlerce ödeme, tek tahsilat işlemi. Her ödemenin imzalı bir makbuzu var; *imzayı doğrula* tarayıcıda çalışıyor, bize sormuyor." |
| 11 | **Reins** → *Kendi ajan hesabını kur* | "Ve bu bir demo değil: cüzdanınızı bağlayın, tek işlemde kendi hesabınızı kurun, sınırları siz yazın. Sonra o sınırları yalnızca siz değiştirebilirsiniz." |

**Kapanış:** "`channel` şemasını açık spec olarak yayımladık. Biz bir uygulama değil,
Stellar'da x402'nin eksik şemasıyız; bunun üstünde başka cüzdanlar da çalışabilir.
reinkey.io şu anda canlı, `npm i @reinkey/mcp` ile jürinin kendi asistanı da bağlanabilir."

## Hazır cevaplar

- **"Facilitator'a güvenmek gerekiyor mu?"** Hayır. Kuponu herkes doğrulayabilir, `claim`'i
  herkes çağırabilir, para yalnızca oturumun satıcısına gider. Facilitator çökerse satıcı elindeki
  son kuponla tahsil eder, tavan yine durur.
- **"Kendi borsanızı mı yaptınız?"** Hayır. Likiditeyi Stellar'da zaten var olan havuzlar taşıyor.
  Biz ajanın ona kayıtsız, ölçülü ve sınırlı erişmesini sağlıyoruz; `GET /dex/quote` *bu işlem senin
  hesabından geçer mi* sorusunu zincire gitmeden, ücret ödemeden cevaplar.
- **"Neden Stellar?"** Protokol içindeki özel hesap auth'u (`__check_auth`), iç içe yetkilendirme
  ağaçları, USDC'nin SAC'ı, ücret sponsorluğu ve sentin kesri maliyetle 5 saniyelik kesinleşme.
  Aynı tasarım EVM'de ek altyapı ister.
- **"Ajanın anahtarı çalınırsa?"** Yapabileceği en fazla şey politikanın izin verdiği kadardır:
  yalnızca izinli alıcılara, tavanlar içinde. Sınırı yükseltemez, dondurmayı kaldıramaz; bunlar
  sahibin cüzdanına aittir.
- **"Merkezi borsada bu sınır nasıl uygulanır?"** Uygulanmaz; dürüst sınırımız bu. Zincirde
  uygulanan işlem sınırı yalnızca zincir üstü işlemlerde geçerli.

## Yedek plan

- Testnet RPC yavaşlarsa fiyat akışı `PRICE_SOURCE_UNAVAILABLE` ile başlamaz. O durumda
  **Defter** sekmesine geç: önceki koşuların kalıcı kaydı orada, tx hash'leriyle.
- Backend'e hiç ulaşılamazsa `compare.ts` çıktısının ekran görüntüsü ve yedek video.
- Günlük tavan dolduysa (`DAILY_CAP_EXCEEDED`) yeni koşu yapma; bu bir hata değil, ürünün
  çalıştığının kanıtı — öyle anlat ve önceki turun kaydını göster.
