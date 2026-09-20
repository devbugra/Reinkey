import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { routing } from "@/i18n/routing";

const SITE_URL = env.siteUrl;

/** Dil önekli sayfalar; belgeler tek dildedir ve ayrıca eklenir. */
const PAGES = ["", "/meter", "/reins", "/float"];
const DOCS = [
  "/docs",
  "/docs/concepts",
  "/docs/meter/quickstart",
  "/docs/meter/reference",
  "/docs/reins/quickstart",
  "/docs/reins/policy",
  "/docs/float",
  "/docs/reason-codes",
  "/docs/api",
  "/docs/mcp",
  "/docs/console",
  "/docs/testnet",
  "/docs/limits",
  "/docs/security",
];

/** Her derlemede "bugün değişti" demek arama motoruna yalan söylemektir; içerik değişince elle güncellenir. */
const LAST_MODIFIED = new Date("2026-09-20");

export default function sitemap(): MetadataRoute.Sitemap {
  const localized = PAGES.flatMap((page) => {
    const languages = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${page}`]));
    return routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${page}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: page === "" ? (locale === routing.defaultLocale ? 1 : 0.8) : 0.7,
      alternates: { languages: { ...languages, "x-default": `${SITE_URL}/en${page}` } },
    }));
  });
  const docs = DOCS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  return [...localized, ...docs];
}
