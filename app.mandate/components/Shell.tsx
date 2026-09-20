"use client";

/**
 * KABUK: solda ray, sağda sayfa.
 *
 * Gezinme bir menü değil bir hattır: kesintisiz dikey çizgi üzerinde istasyonlar.
 * Üst grup izleme ("şu an ne oluyor"), orta grup ürünler (kim bakıyor: satıcı,
 * ajan sahibi, sermaye), alt grup geliştirici bağlantıları. Durum (ağ, bağlantı)
 * ve dil hattın sonunda durur; sayfa içeriğiyle yarışmaz.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { env, stellarNetwork } from "@/lib/env";
import type { Connection } from "@/lib/useFeed";
import type { View } from "@/lib/useView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Mark } from "./Mark";
import { cn } from "./ui";

/** Etiketler çeviriden gelir; ürün adları (Meter, Reins, Float) marka olduğu için çevrilmez. */
const GROUPS: { title: "watch" | "products"; items: { id: View; label?: string; sub: string }[] }[] = [
  { title: "watch", items: [{ id: "live", sub: "liveSub" }] },
  {
    title: "products",
    items: [
      { id: "meter", label: "Meter", sub: "meterSub" },
      { id: "reins", label: "Reins", sub: "reinsSub" },
      { id: "float", label: "Float", sub: "floatSub" },
      { id: "dex", sub: "dexSub" },
    ],
  },
];

const CONNECTION: Record<Connection, { dot: string; text: string }> = {
  live: { dot: "bg-success pulse-dot", text: "text-success" },
  connecting: { dot: "bg-warning pulse-dot", text: "text-warning" },
  offline: { dot: "bg-danger", text: "text-danger" },
};

function Nav({ view, onView }: { view: View; onView: (v: View) => void }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("aria")} className="rail flex flex-col gap-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 ps-8 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">{t(g.title)}</p>
          <ul className="flex flex-col">
            {g.items.map((it) => {
              const on = view === it.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onView(it.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-md py-2 pe-3 ps-[0.4375rem] text-start transition-colors",
                      on ? "bg-surface-2/70" : "hover:bg-surface-1",
                    )}
                  >
                    <span className="station shrink-0" data-on={on} aria-hidden="true" />
                    <span className="min-w-0 ps-1.5">
                      <span className={cn("block text-sm font-medium", on ? "text-fg" : "text-fg-muted group-hover:text-fg")}>
                        {it.label ?? t(it.id as "live")}
                      </span>
                      <span className="block truncate text-[11px] text-fg-subtle">{t(it.sub as "liveSub")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div>
        <p className="mb-1.5 ps-8 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">{t("developer")}</p>
        <ul className="flex flex-col">
          {[
            [t("docs"), `${env.marketingUrl}/docs`],
            [t("api"), `${env.apiUrl}/docs`],
            ["llms.txt", `${env.apiUrl}/llms.txt`],
          ].map(([label, href]) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-md py-1.5 pe-3 ps-[0.4375rem] text-sm text-fg-muted transition-colors hover:bg-surface-1 hover:text-fg"
              >
                <span className="station shrink-0 opacity-50" aria-hidden="true" />
                <span className="ps-1.5">{label}</span>
                <ArrowUpRight className="ms-auto size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function Status({ connection }: { connection: Connection }) {
  const t = useTranslations("status");
  const c = CONNECTION[connection];
  return (
    <div className="grid gap-2">
      <div className="rounded-md border border-line bg-bg-alt px-3 py-2.5" role="status">
        <p className={cn("flex items-center gap-2 text-xs font-medium", c.text)}>
          <span className={cn("size-2 rounded-full", c.dot)} aria-hidden="true" />
          {t(connection)}
        </p>
        <p className="mt-1 text-[11px] text-fg-subtle">{t("network", { network: t(stellarNetwork === "public" ? "mainnet" : "testnet") })}</p>
      </div>
      <LanguageSwitcher />
    </div>
  );
}

function Brand() {
  const t = useTranslations("shell");
  return (
    <a href={env.marketingUrl} className="flex items-center gap-2.5" aria-label={t("siteLabel")}>
      <Mark className="size-6 text-accent" />
      <span className="font-display text-base font-semibold tracking-tight">Reinkey</span>
      <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] text-fg-muted">{t("badge")}</span>
    </a>
  );
}

export function Shell({
  view,
  onView,
  connection,
  workspace,
  navKey,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  connection: Connection;
  /** Çalışma alanı seçici (rayın tepesinde). */
  workspace?: React.ReactNode;
  /** Gezinme durumunun özeti: değiştiğinde (görünüm, adres, karşılama) dar ekran çekmecesi kapanır. */
  navKey: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const ts = useTranslations("status");
  // Çekmece, açıldığı gezinme durumuna bağlıdır: çalışma alanı seçicisinden bir adres
  // seçildiğinde de (yalnızca menüden değil) kendiliğinden kapanır, etki gerekmez.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === navKey;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenFor((typeof next === "function" ? next(open) : next) ? navKey : null);
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const go = (v: View) => {
    setOpen(false);
    onView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app-bg min-h-full">
      {/* Geniş ekran: sabit kenar çubuğu */}
      <aside className="fixed inset-y-0 start-0 z-20 hidden w-(--rail-w) flex-col border-e border-line bg-bg/80 px-4 py-5 backdrop-blur lg:flex">
        <div className="px-1">
          <Brand />
        </div>
        {workspace && <div className="mt-5">{workspace}</div>}
        <div className="mt-6 flex-1 overflow-y-auto">
          <Nav view={view} onView={go} />
        </div>
        <Status connection={connection} />
      </aside>

      {/* Dar ekran: üst çubuk + çekmece */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label={open ? tc("closeMenu") : tc("openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-9 place-items-center rounded-md border border-line text-fg"
        >
          {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col gap-6 overflow-y-auto bg-bg px-4 py-6 lg:hidden">
          {workspace}
          <Nav view={view} onView={go} />
          <Status connection={connection} />
        </div>
      )}

      <div className="lg:ps-(--rail-w)">
        <main id="main" className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1320px] px-4 pb-8 text-[11px] text-fg-subtle sm:px-8">
          {t("footer", { api: env.apiUrl, network: ts(stellarNetwork === "public" ? "mainnet" : "testnet") })}
        </footer>
      </div>
    </div>
  );
}
