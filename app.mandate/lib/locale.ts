"use client";

/**
 * KONSOLUN DİLİ.
 *
 * Dil adres çubuğunda DEĞİL, tarayıcıda durur. Konsolun her görünümü
 * paylaşılabilir bir bağlantıdır (`?view=…&account=…`); dili oraya yazmak,
 * paylaşılan bağlantının karşıdakinin dilini de değiştirmesi demekti. Dil
 * kullanıcının kendi tercihidir, verinin bir parçası değil.
 *
 * Sıra: `?lang=` (destek bağlantıları için tek seferlik) → önceki seçim →
 * tarayıcının dili → Türkçe.
 *
 * Depo React dışında da okunur (`lib/t.ts`), bu yüzden modül düzeyinde durur
 * ve `useSyncExternalStore` ile bileşenlere bağlanır.
 */
import { useSyncExternalStore } from "react";

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { tr: "Türkçe", en: "English" };

const KEY = "reinkey.locale";
const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

let current: Locale | null = null;
const listeners = new Set<() => void>();

function detect(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(q)) return q;
  } catch {
    /* adres okunamadı */
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* depolama kapalı: seçim yalnızca bu sekmede yaşar */
  }
  const nav = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return LOCALES.find((l) => nav.startsWith(l)) ?? "tr";
}

function snapshot(): Locale {
  current ??= detect();
  return current;
}

/** React dışı okuyucular için: sunucuda ve ilk boyamada Türkçeye düşer. */
export function currentLocale(): Locale {
  if (typeof window === "undefined") return "tr";
  return snapshot();
}

export function setLocale(next: Locale) {
  if (current === next) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* depolama kapalı */
  }
  document.documentElement.lang = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Sunucu anlık görüntüsü `null` döner: panel zaten yalnızca tarayıcıda
 * çizildiği için sunucuda dil seçmenin anlamı yok ve hidrasyon uyuşmazlığı
 * da böyle önlenir.
 */
export function useLocalePreference(): Locale | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
