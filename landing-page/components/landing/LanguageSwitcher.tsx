"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeDirection, localeNames, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Dil değiştirici: aynı sayfada kalır, seçim çerezde saklanır (next-intl). */
export function LanguageSwitcher({
  className,
  variant = "select",
}: {
  className?: string;
  variant?: "select" | "list";
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const change = (next: Locale) => {
    router.replace(pathname, { locale: next });
  };

  if (variant === "list") {
    return (
      <ul
        className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}
        aria-label={t("languageSwitcher")}
      >
        {routing.locales.map((l) => (
          <li key={l}>
            <button
              type="button"
              lang={l}
              dir={localeDirection(l)}
              onClick={() => change(l)}
              aria-current={l === locale ? "true" : undefined}
              className={cn(
                "text-sm transition-colors duration-150 hover:text-fg",
                l === locale ? "text-fg" : "text-fg-muted",
              )}
            >
              {localeNames[l]}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("languageSwitcher")}</span>
      <Globe
        className="pointer-events-none absolute start-3 size-4 text-fg-subtle"
        aria-hidden="true"
      />
      <select
        value={locale}
        onChange={(e) => change(e.target.value as Locale)}
        className="h-9 appearance-none rounded-full border border-line bg-surface-1 ps-9 pe-4 text-sm text-fg-muted shadow-[var(--card-shadow)] transition-colors duration-150 hover:border-line-strong hover:text-fg focus:outline-none focus-visible:border-accent"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
