/** Tanıtım sitesi sabitleri. Metinler messages/*.json içinde; burada yalnızca dil bağımsız değerler. */
import { env } from "@/lib/env";

export const site = {
  /* Ad yalnızca buradan okunur: logo, başlıklar ve metinlerdeki {name} yer tutucusu dahil. */
  name: "Reinkey",
  url: env.siteUrl,
  network: "Stellar testnet",
} as const;

/**
 * `t.raw()` ile okunan dizilerde ICU biçimlendirmesi çalışmaz; içlerindeki
 * {name} yer tutucusu burada doldurulur. `t()` ile okunan tekil metinlerde
 * ad `t("key", { name: site.name })` ile verilir.
 */
export function withName(text: string): string {
  return text.replaceAll("{name}", site.name);
}

/**
 * ÜRÜNLER. Reinkey şemsiye addır; altında iki adlandırılmış ürün durur.
 * Adlar çevrilmez (marka). `path` dil önekinden sonraki yoldur.
 *
 *  - Meter: satıcı tarafı, kullanım bazlı tahsilat. Koddaki `meter()` ile aynı ad.
 *  - Reins: ajan tarafı, zincirde uygulanan harcama yetkisi. Slogandan gelir:
 *    "Give your agent the keys. Keep the reins."
 */
export const products = {
  meter: { key: "meter", name: "Meter", path: "/meter", pkg: "@reinkey/meter" },
  reins: { key: "reins", name: "Reins", path: "/reins", pkg: "@reinkey/sdk" },
} as const;
export type ProductKey = keyof typeof products;

/** Geliştirici belgeleri: tek dilde (İngilizce), dil önekinin DIŞINDA (`app/(docs)`). */
export const docs = {
  home: "/docs",
  quickstartMeter: "/docs/meter/quickstart",
  quickstartReins: "/docs/reins/quickstart",
} as const;

/**
 * Tanıtım sitesindeki çapa isimleri.
 * Değerler İngilizcedir; iki dilde de aynı adresler paylaşılabilsin diye çevrilmez.
 */
export const anchors = {
  top: "#top",
  playground: "#try",
  problem: "#problem",
  howItWorks: "#how-it-works",
  architecture: "#architecture",
  products: "#products",
  features: "#product",
  limits: "#limits",
  audience: "#who-its-for",
  pricing: "#pricing",
  faq: "#faq",
  closing: "#get-started",
} as const;

/**
 * DIŞ ADRESLER.
 *
 * Sitenin hesap sayfası yok: ürünün tek yüzeyi HTTP. Bağlantılar ya x402
 * korumalı API'ye (kendini OpenAPI ve llms.txt ile tanıtır) ya da canlı
 * panele gider. Adresler derleme anında gömülür (`NEXT_PUBLIC_*`).
 */
export const routes = {
  api: env.apiUrl,
  openapi: `${env.apiUrl}/openapi.json`,
  llms: `${env.apiUrl}/llms.txt`,
  panel: env.appUrl,
} as const;

export const external = {
  stellar: "https://developers.stellar.org",
  x402: "https://github.com/x402-foundation/x402",
  x402Stellar: "https://www.npmjs.com/package/@x402/stellar",
  networkLimits: "https://lab.stellar.org/network-limits",
  scfRfp: "https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track",
} as const;

/**
 * OG görseli Satori ile render edilir; Satori CSS değişkeni okuyamaz.
 * Değerler globals.css'teki token'ların birebir karşılığıdır.
 */
export const ogPalette = {
  bg: "#05060F",
  fg: "#EEF0FF",
  fgMuted: "rgba(238, 240, 255, 0.68)",
  accent: "#74B1F9",
  line: "rgba(238, 240, 255, 0.16)",
  /* Hero videosunun rampası: gök mavisi → kraliyet mavisi → indigo */
  gradient: "linear-gradient(90deg, #74B1F9 0%, #5466FD 55%, #4C2FF9 100%)",
} as const;
