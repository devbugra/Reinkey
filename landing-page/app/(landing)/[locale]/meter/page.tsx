import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { docs, site } from "@/content/site";
import { snippets } from "@/content/snippets";
import { Footer } from "@/components/landing/Footer";
import { Nav } from "@/components/landing/Nav";
import { ProductPage } from "@/components/landing/ProductPage";
import { env } from "@/lib/env";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/meter">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "products.meter.meta" });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${env.siteUrl}/${l}/meter`]));
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: `${env.siteUrl}/${locale}/meter`, languages },
    // Üst düzenin openGraph alanları birleşmez, ezilir: url, siteName ve type burada yinelenir.
    openGraph: {
      type: "website",
      siteName: site.name,
      url: `${env.siteUrl}/${locale}/meter`,
      title: `${site.name} ${t("title")}`,
      description: t("description"),
    },
  };
}

export default async function Page({ params }: PageProps<"/[locale]/meter">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Nav />
      <main id="main-content" className="flex-1">
        <ProductPage
          product="meter"
          code={{ title: "server.ts", body: snippets.meter, install: snippets.meterInstall }}
          response={{ title: "GET /book", body: snippets.meter402 }}
          quickstart={docs.quickstartMeter}
        />
      </main>
      <Footer />
    </>
  );
}
