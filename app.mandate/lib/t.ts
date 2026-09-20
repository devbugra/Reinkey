"use client";

/**
 * REACT DIŞINDA ÇEVİRİ.
 *
 * `api.ts`, `chain.ts`, `codes.ts` gibi modüller bileşen değildir; `useTranslations`
 * kullanamazlar. Bunlar için aynı sözlükten beslenen bir çevirmen tutulur.
 * Çevirmen dil başına bir kez kurulur; dil değişince bir sonraki çağrı yeni
 * dilin çevirmenini alır.
 */
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import { currentLocale, type Locale } from "./locale";

type Messages = typeof tr;
const MESSAGES: Record<Locale, Messages> = { tr, en: en as Messages };

const cache = new Map<Locale, ReturnType<typeof createTranslator<Messages>>>();

export function t() {
  const locale = currentLocale();
  let translator = cache.get(locale);
  if (!translator) {
    translator = createTranslator({
      locale,
      messages: MESSAGES[locale],
      // Eksik anahtar konsolu çökertmez; anahtarın kendisi görünür ve fark edilir.
      onError: () => {},
      getMessageFallback: ({ key }) => key,
    });
    cache.set(locale, translator);
  }
  return translator;
}

/** Sözlükte karşılığı olmayan kodlar ham hâliyle gösterilir; sessizce kaybolmaz. */
export function hasMessage(section: keyof Messages, key: string): boolean {
  const s = MESSAGES[currentLocale()][section] as Record<string, unknown> | undefined;
  return Boolean(s && key in s);
}
