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
 *
 * ESKİ AD HÂLÂ KABUL EDİLİR. Bu değerler derleme anında gömülür, dolayısıyla
 * ad değişikliği ancak barındırıcıdaki değişken de güncellenirse çalışır. Yalnızca
 * yeni adı arayan bir sürüm, eski adın yazılı olduğu bir projeye çıkınca konsolu
 * tamamen açılmaz hâle getirdi (20 Eylül). İkisini de okuyoruz.
 *
 * Değerler .env.local'dan gelir (.env.example'ı kopyalayın).
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

/**
 * Eksik olması ÖLÜMCÜL DEĞİL: tanıtım sitesine giden bağlantı kırılır, konsolun
 * geri kalanı çalışır. Modül değerlendirmesinde hata fırlatmak tüm uygulamayı
 * açılmaz yapıyordu; bir logo bağlantısı için bu orantısız.
 */
function optional(names: string[], values: (string | undefined)[]): string {
  const i = values.findIndex((v) => !!v);
  if (i < 0) {
    console.error(
      `${names.join(" / ")} tanımlı değil: tanıtım sitesine giden bağlantılar çalışmayacak.`,
    );
    return "";
  }
  return values[i]!.replace(/\/$/, "");
}

export const env = {
  /** x402 korumalı API (backend) */
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  /** Tanıtım sitesi (depodaki `landing-page`): logo ve belge bağlantıları oraya gider */
  marketingUrl: optional(
    ["NEXT_PUBLIC_MARKETING_URL", "NEXT_PUBLIC_SITE_URL"],
    [process.env.NEXT_PUBLIC_MARKETING_URL, process.env.NEXT_PUBLIC_SITE_URL],
  ),
} as const;

/**
 * Konsolun kendi adresi buraya yazılırsa logo ve belge bağlantıları kullanıcıyı
 * bulunduğu sayfaya geri atar: kırık değil, hiçbir şey yapmayan bir bağlantı —
 * sessizce fark edilmez. Ad artık bunu zorlaştırıyor ama yapılandırma yine de
 * elle giriliyor; tarayıcıda gürültülü bir uyarı bırakmak ucuz.
 */
if (typeof window !== "undefined" && env.marketingUrl) {
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
