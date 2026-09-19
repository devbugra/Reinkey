import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "tr",
  // "/" -> "/tr" yönlendirmesi; her dilin kendi kanonik adresi var
  localePrefix: "always",
  localeCookie: { name: "site_locale", maxAge: 60 * 60 * 24 * 365 },
  localeDetection: true,
});

export const localeNames: Record<Locale, string> = { tr: "Türkçe", en: "English" };
export const localeDirection = (locale: string): "rtl" | "ltr" => (locale === "ar" ? "rtl" : "ltr");
