"use client";

/**
 * KABUK: solda ray, sağda sayfa.
 *
 * Gezinme bir menü değil bir hattır: kesintisiz dikey çizgi üzerinde istasyonlar.
 * Üst grup izleme ("şu an ne oluyor"), orta grup ürünler (kim bakıyor: satıcı,
 * ajan sahibi, sermaye), alt grup geliştirici bağlantıları. Durum (ağ, bağlantı)
 * hattın sonunda durur; sayfa içeriğiyle yarışmaz.
 */
import { useEffect, useState } from "react";
import { ArrowUpRight, Maximize2, Menu, Minimize2, X } from "lucide-react";
import { env } from "@/lib/env";
import type { Connection } from "@/lib/useFeed";
import type { View } from "@/lib/useView";
import { Mark } from "./Mark";
import { cn } from "./ui";

type Item = { id: View; label: string; sub: string };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "İzle", items: [{ id: "live", label: "Canlı akış", sub: "Şu an ne oluyor" }] },
  {
    title: "Ürünler",
    items: [
      { id: "meter", label: "Meter", sub: "Satıcı · gelir ve tahsilat" },
      { id: "reins", label: "Reins", sub: "Ajan hesabı · sınırlar" },
      { id: "float", label: "Float", sub: "Sermaye · kredi havuzu" },
    ],
  },
];

const CONNECTION: Record<Connection, { label: string; dot: string; text: string }> = {
  live: { label: "Canlı", dot: "bg-success pulse-dot", text: "text-success" },
  connecting: { label: "Bağlanıyor…", dot: "bg-warning pulse-dot", text: "text-warning" },
  offline: { label: "Backend'e ulaşılamıyor", dot: "bg-danger", text: "text-danger" },
};

function Nav({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <nav aria-label="Konsol" className="rail flex flex-col gap-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 ps-8 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">{g.title}</p>
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
                      <span className={cn("block text-sm font-medium", on ? "text-fg" : "text-fg-muted group-hover:text-fg")}>{it.label}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">{it.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div>
        <p className="mb-1.5 ps-8 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">Geliştirici</p>
        <ul className="flex flex-col">
          {[
            ["Belgeler", `${env.siteUrl}/docs`],
            ["API (OpenAPI)", `${env.apiUrl}/docs`],
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

function Status({ connection, present, onPresent }: { connection: Connection; present: boolean; onPresent: () => void }) {
  const c = CONNECTION[connection];
  return (
    <div className="grid gap-2">
      <div className="rounded-md border border-line bg-bg-alt px-3 py-2.5" role="status">
        <p className={cn("flex items-center gap-2 text-xs font-medium", c.text)}>
          <span className={cn("size-2 rounded-full", c.dot)} aria-hidden="true" />
          {c.label}
        </p>
        <p className="mt-1 text-[11px] text-fg-subtle">Stellar testnet · emanetsiz</p>
      </div>
      <button
        type="button"
        onClick={onPresent}
        aria-pressed={present}
        title="Projeksiyon için büyük yazı ve tam ekran"
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        {present ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
        {present ? "Sunumdan çık" : "Sunum modu"}
      </button>
    </div>
  );
}

function Brand() {
  return (
    <a href={env.siteUrl} className="flex items-center gap-2.5" aria-label="Reinkey tanıtım sitesi">
      <Mark className="size-6 text-accent" />
      <span className="font-display text-base font-semibold tracking-tight">Reinkey</span>
      <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] text-fg-muted">Console</span>
    </a>
  );
}

export function Shell({
  view,
  onView,
  connection,
  present,
  onPresent,
  workspace,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  connection: Connection;
  present: boolean;
  onPresent: () => void;
  /** Çalışma alanı seçici (rayın tepesinde). */
  workspace?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);
  const go = (v: View) => {
    setOpen(false);
    onView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className={cn("app-bg min-h-full", present && "present")}>
      {/* Geniş ekran: sabit kenar çubuğu */}
      <aside className="fixed inset-y-0 start-0 z-20 hidden w-(--rail-w) flex-col border-e border-line bg-bg/80 px-4 py-5 backdrop-blur lg:flex">
        <div className="px-1">
          <Brand />
        </div>
        {workspace && <div className="mt-5">{workspace}</div>}
        <div className="mt-6 flex-1 overflow-y-auto">
          <Nav view={view} onView={go} />
        </div>
        <Status connection={connection} present={present} onPresent={onPresent} />
      </aside>

      {/* Dar ekran: üst çubuk + çekmece */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
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
          <Status connection={connection} present={present} onPresent={onPresent} />
        </div>
      )}

      <div className="lg:ps-(--rail-w)">
        <main id="main" className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1320px] px-4 pb-8 text-[11px] text-fg-subtle sm:px-8">
          Tüm veriler canlıdır: {env.apiUrl} · işlem bağlantıları stellar.expert&apos;e gider · testnet, emanetsiz protokol.
        </footer>
      </div>
    </div>
  );
}
