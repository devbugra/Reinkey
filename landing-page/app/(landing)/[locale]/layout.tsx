import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { site } from "@/content/site";
import { env } from "@/lib/env";
import { fontVariables } from "@/lib/fonts";
import { localeDirection, routing } from "@/i18n/routing";
import "../../globals.css";

const SITE_URL = env.siteUrl;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${SITE_URL}/${l}`]),
  );
  const ogLocale = { tr: "tr_TR", en: "en_US" }[locale] ?? "tr_TR";
  const title = t("title", { name: site.name });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s — ${site.name}` },
    description: t("description"),
    applicationName: site.name,
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: { ...languages, "x-default": `${SITE_URL}/tr` },
    },
    openGraph: {
      type: "website",
      locale: ogLocale,
      url: `${SITE_URL}/${locale}`,
      siteName: site.name,
      title,
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t("description"),
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = localeDirection(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      data-scroll-behavior="smooth"
      className={`${fontVariables} h-full scroll-smooth antialiased`}
    >
      <head>
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;translate:none!important}`}</style>
        </noscript>
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
