/**
 * Ortam değişkenleri. Adreslerin TEK kaynağı burası; kodda localhost yazılmaz.
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
  /** Tanıtım sitesi */
  siteUrl: required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL),
} as const;
