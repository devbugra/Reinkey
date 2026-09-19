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
