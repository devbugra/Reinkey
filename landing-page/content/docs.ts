import type { Metadata } from "next";
import { env } from "@/lib/env";
import { site } from "@/content/site";

/** Belgelerin gezinme ağacı. Sıra okuma sırasıdır; "önceki / sonraki" da buradan türetilir. */
export const docsNav = [
  {
    title: "Get started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/concepts", label: "How it works" },
      { href: "/docs/console", label: "Console guide" },
      { href: "/docs/testnet", label: "Testnet setup" },
    ],
  },
  {
    title: "AI assistants",
    items: [{ href: "/docs/mcp", label: "Paid MCP tool calls" }],
  },
  {
    title: "Reinkey Meter",
    items: [
      { href: "/docs/meter/quickstart", label: "Quickstart" },
      { href: "/docs/meter/reference", label: "Reference" },
    ],
  },
  {
    title: "Reinkey Reins",
    items: [
      { href: "/docs/reins/quickstart", label: "Quickstart" },
      { href: "/docs/reins/policy", label: "Policy & rejections" },
    ],
  },
  {
    title: "Reinkey Float",
    items: [{ href: "/docs/float", label: "Credit pool" }],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/reason-codes", label: "Reason codes" },
      { href: "/docs/api", label: "Facilitator API" },
      { href: "/docs/limits", label: "Limits" },
      { href: "/docs/security", label: "Security model" },
    ],
  },
] as const;

export const docsPages = docsNav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));

/**
 * Her belge sayfasının üst verisi tek yerden.
 *
 * Belgeler tek dilde ve dil öneki dışında; kanonik adres yolun kendisidir.
 * `openGraph` ÜST DÜZENDEKİ alanlarla BİRLEŞMEZ, ezilir: url, siteName ve type
 * burada yinelenmeli, yoksa sayfa OG'de adsız kalır.
 */
export function docsMeta(path: string, title: string, description: string): Metadata {
  const url = `${env.siteUrl}${path}`;
  const ogTitle = `${title} — ${site.name} Docs`;
  /* Sabit adres; `opengraph-image.tsx` dosya kuralı alt sayfalara inmiyor (bkz. docs/og/route.tsx). */
  const image = { url: `${env.siteUrl}/docs/og`, width: 1200, height: 630, alt: `${site.name} Docs` };
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: `${site.name} Docs`,
      url,
      title: ogTitle,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: ogTitle, description, images: [image] },
  };
}
