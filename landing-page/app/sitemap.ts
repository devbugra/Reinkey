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
];

export default function sitemap(): MetadataRoute.Sitemap {
  const localized = PAGES.flatMap((page) => {
    const languages = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${page}`]));
    return routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${page}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: page === "" ? (locale === routing.defaultLocale ? 1 : 0.8) : 0.7,
      alternates: { languages: { ...languages, "x-default": `${SITE_URL}/tr${page}` } },
    }));
  });
  const docs = DOCS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  return [...localized, ...docs];
}
