import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { docs, site } from "@/content/site";
import { snippets } from "@/content/snippets";
import { Footer } from "@/components/landing/Footer";
import { Nav } from "@/components/landing/Nav";
import { ProductPage } from "@/components/landing/ProductPage";
import { env } from "@/lib/env";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/reins">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "products.reins.meta" });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${env.siteUrl}/${l}/reins`]));
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: `${env.siteUrl}/${locale}/reins`, languages },
    // Üst düzenin openGraph alanları birleşmez, ezilir: url, siteName ve type burada yinelenir.
    openGraph: {
      type: "website",
      siteName: site.name,
      url: `${env.siteUrl}/${locale}/reins`,
      title: `${site.name} ${t("title")}`,
      description: t("description"),
    },
  };
}

export default async function Page({ params }: PageProps<"/[locale]/reins">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Nav />
      <main id="main-content" className="flex-1">
        <ProductPage
          product="reins"
          code={{ title: "agent.ts", body: snippets.reins, install: snippets.reinsInstall }}
          response={{ title: "agent.ts", body: snippets.reinsReject }}
          quickstart={docs.quickstartReins}
        />
      </main>
      <Footer />
    </>
  );
}
