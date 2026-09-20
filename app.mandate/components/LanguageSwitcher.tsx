"use client";

/** Dil seçimi. Tercih tarayıcıda saklanır; adres çubuğuna yazılmaz (bkz. lib/locale.ts). */
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_NAMES, setLocale, type Locale } from "@/lib/locale";
import { cn } from "./ui";

export function LanguageSwitcher() {
  const active = useLocale() as Locale;
  const t = useTranslations("language");

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-bg-alt px-2 py-1.5">
      <Globe className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      <span id="dil-etiketi" className="sr-only">
        {t("label")}
      </span>
      <div role="group" aria-labelledby="dil-etiketi" className="flex min-w-0 flex-1 gap-0.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => setLocale(l)}
            aria-pressed={l === active}
            className={cn(
              "min-w-0 flex-1 truncate rounded-sm px-2 py-0.5 text-[11px] transition-colors",
              l === active ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
