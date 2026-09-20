import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { docs, site } from "@/content/site";
import { snippets } from "@/content/snippets";
import { Footer } from "@/components/landing/Footer";
import { Nav } from "@/components/landing/Nav";
import { ProductPage } from "@/components/landing/ProductPage";
import { env } from "@/lib/env";
import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/float">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "products.float.meta" });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${env.siteUrl}/${l}/float`]));
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: `${env.siteUrl}/${locale}/float`, languages },
    // Üst düzenin openGraph alanları birleşmez, ezilir: url, siteName ve type burada yinelenir.
    openGraph: {
      type: "website",
      siteName: site.name,
      url: `${env.siteUrl}/${locale}/float`,
      title: `${site.name} ${t("title")}`,
      description: t("description"),
    },
  };
}

export default async function Page({ params }: PageProps<"/[locale]/float">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Nav />
      <main id="main-content" className="flex-1">
        <ProductPage
          product="float"
          code={{ title: "HTTP", body: snippets.float, install: snippets.floatRead }}
          response={{ title: "HTTP", body: snippets.floatHealth }}
          quickstart={docs.float}
        />
      </main>
      <Footer />
    </>
  );
}
