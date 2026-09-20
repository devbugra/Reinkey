/**
 * Ortam değişkenleri. Adreslerin TEK kaynağı burası; kodda localhost yazılmaz.
 *
 * ADLANDIRMA KURALI (iki uygulamada da geçerli):
 *   NEXT_PUBLIC_SITE_URL   → uygulamanın KENDİ adresi (canonical, OG, sitemap)
 *   diğer her adres        → gittiği servisin adıyla anılır
 *
 * Bu yüzden konsolda `NEXT_PUBLIC_SITE_URL` YOKTUR. Konsolun kendi adresine
 * ihtiyacı yok (dizine eklenmiyor, OG üretmiyor); tanıtım sitesine giden
 * bağlantı ise `NEXT_PUBLIC_MARKETING_URL` adıyla durur. Eskiden ikisi de
 * `NEXT_PUBLIC_SITE_URL` diye anılıyordu ve aynı ad iki uygulamada zıt anlama
 * geliyordu: sitede "kendi adresim", konsolda "başka bir uygulamanın adresi".
 * Vercel'de iki proje yan yana durduğu için bu, er geç yanlış doldurulacak bir
 * alandı — üç ayrı yerdeki "DİKKAT" notu da bunun kanıtıydı.
 *
 * Değerler .env.local'dan gelir (.env.example'ı kopyalayın). Eksik bir değer
 * sessizce varsayılana düşmez, hata verir.
 *
 * `process.env.NEXT_PUBLIC_X` erişimleri tek tek ve harfi harfine yazılmalı;
 * Next.js yalnızca bu biçimi derleme anında istemci koduna gömer.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} tanımlı değil. .env.example dosyasını .env.local olarak kopyalayıp doldurun.`,
    );
  }
  return value.replace(/\/$/, "");
}

export const env = {
  /** x402 korumalı API (backend) */
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  /** Tanıtım sitesi (depodaki `landing-page`): logo ve belge bağlantıları oraya gider */
  marketingUrl: required("NEXT_PUBLIC_MARKETING_URL", process.env.NEXT_PUBLIC_MARKETING_URL),
} as const;

/**
 * Konsolun kendi adresi buraya yazılırsa logo ve belge bağlantıları kullanıcıyı
 * bulunduğu sayfaya geri atar: kırık değil, hiçbir şey yapmayan bir bağlantı —
 * sessizce fark edilmez. Ad artık bunu zorlaştırıyor ama yapılandırma yine de
 * elle giriliyor; tarayıcıda gürültülü bir uyarı bırakmak ucuz.
 */
if (typeof window !== "undefined") {
  try {
    if (new URL(env.marketingUrl).origin === window.location.origin) {
      console.error(
        `NEXT_PUBLIC_MARKETING_URL konsolun kendi adresini gösteriyor (${env.marketingUrl}). ` +
          "Tanıtım sitesinin adresi yazılmalı, ör. https://www.reinkey.com",
      );
    }
  } catch {
    /* Biçimsiz URL: bağlantılar zaten kırık görünür, burada susmak doğru. */
  }
}

/**
 * Stellar ağı: cüzdanın bağlandığı ağ ve explorer bağlantıları buna göre kurulur.
 * Backend'in ağıyla aynı olmalıdır (`GET /demo/info → networkPassphrase`).
 */
export const stellarNetwork: "testnet" | "public" =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "public" ? "public" : "testnet";
