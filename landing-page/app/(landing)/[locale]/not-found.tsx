import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { docs } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/landing/Footer";
import { Nav } from "@/components/landing/Nav";
import { routing } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "404",
  robots: { index: false, follow: false },
};

/**
 * Tanıtım sitesinin 404'ü. Dil öneki burada okunamaz (not-found'a parametre
 * geçmez), bu yüzden metinler varsayılan dilde verilir ve bağlantılar dil
 * önekiyle yazılır.
 */
export default async function LocaleNotFound() {
  const locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    <>
      <Nav />
      <main id="main-content" className="flex flex-1 items-center py-32">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-accent-text">404</p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
            <p className="mx-auto mt-6 max-w-[55ch] text-fg-muted">{t("body")}</p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={`/${locale}`} size="lg">
                {t("home")}
              </Button>
              <Button href={docs.home} variant="secondary" size="lg">
                {t("docs")}
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
