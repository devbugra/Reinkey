/**
 * Ortam değişkenleri. Adreslerin TEK kaynağı burası; kodda localhost yazılmaz.
 *
 * Değerler .env.local'dan gelir (.env.example'ı kopyalayın). Eksik bir değer
 * sessizce varsayılana düşmez, derlemeyi durdurur: yanlış adrese giden bir
 * bağlantı fark edilmeden canlıya çıkabilir.
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
  /*
   * Canlıya localhost adresiyle çıkmak: bağlantılar ziyaretçinin kendi
   * makinesine gider ve sitede hiçbir şey görünürde bozulmaz. Bu yüzden
   * ÜRETİM derlemesi durdurulur — barındırıcıya (Vercel, Render, Docker)
   * bakılmaksızın, çünkü hangi platformda derlendiğini bilmek gerekmiyor:
   * NODE_ENV=production + localhost her durumda hatadır.
   *
   * Yerel makinede üretim derlemesi denemek isteyen (ör. `next build` ile
   * paket boyutuna bakmak) ya gerçek adresleri verir ya da bilerek
   * ALLOW_LOCALHOST_URLS=1 der. Sessizce geçmez.
   */
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCALHOST_URLS !== "1" &&
    /localhost|127\.0\.0\.1/.test(value)
  ) {
    throw new Error(
      `${name} üretimde localhost olamaz: ${value}. ` +
        "Gerçek adresi verin (bkz. .env.example) ya da yerel bir üretim derlemesi için ALLOW_LOCALHOST_URLS=1.",
    );
  }
  return value.replace(/\/$/, "");
}

export const env = {
  /** Tanıtım sitesinin kanonik adresi (Open Graph, sitemap, robots) */
  siteUrl: required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL),
  /** x402 korumalı API (gateway) */
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  /** Canlı panel (app.mandate) */
  appUrl: required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL),
} as const;
