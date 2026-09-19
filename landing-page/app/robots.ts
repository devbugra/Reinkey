import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { routing } from "@/i18n/routing";

const SITE_URL = env.siteUrl;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: routing.locales.map((l) => `/${l}`) }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
