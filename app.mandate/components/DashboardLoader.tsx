"use client";

/*
 * Panel yalnızca tarayıcıda çalışır: EventSource ve canlı sayaçlar sunucuda
 * anlamsız. Sunucuda boş iskelet render edilir; böylece hidrasyon uyuşmazlığı
 * da olmaz.
 *
 * Dil de burada çözülür ve sağlayıcı panelin TAMAMINI sarar — yükleme
 * iskeleti dahil, çünkü o da çeviri okur.
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import { useLocalePreference, type Locale } from "@/lib/locale";

const MESSAGES: Record<Locale, typeof tr> = { tr, en: en as typeof tr };

function Splash({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-fg-subtle" role="status">
      {label ?? ""}
    </div>
  );
}

function Loading() {
  const t = useTranslations("common");
  return <Splash label={t("loading")} />;
}

const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false, loading: Loading });

/** <html lang> tarayıcıda güncellenir: düzen sunucu bileşenidir, dili bilemez. */
function SyncHtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

export function DashboardLoader() {
  const locale = useLocalePreference();
  if (!locale) return <Splash />;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      // Saatler kullanıcının saat dilimindedir; konsol bir işletim aracı,
      // rapor değil: "az önce" ile duvar saati aynı olmalı.
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <SyncHtmlLang locale={locale} />
      <Dashboard />
    </NextIntlClientProvider>
  );
}
