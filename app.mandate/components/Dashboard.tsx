"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge, KeyRound, Landmark, Maximize2, Minimize2, PlugZap } from "lucide-react";
import { env } from "@/lib/env";
import { big } from "@/lib/format";
import { useFeed, type Connection } from "@/lib/useFeed";
import { useFloat } from "@/lib/useFloat";
import { useView, type View } from "@/lib/useView";
import { Blocked } from "./Blocked";
import { Channels } from "./Channels";
import { Controls } from "./Controls";
import { Flow } from "./Flow";
import { Hero } from "./Hero";
import { Latency } from "./Latency";
import { Mark } from "./Mark";
import { Price } from "./Price";
import { Steps } from "./Steps";
import { Terminal } from "./Terminal";
import { Timeline } from "./Timeline";
import { Trades } from "./Trades";
import { cn } from "./ui";
import { FloatView } from "./views/FloatView";
import { MeterView } from "./views/MeterView";
import { ReinsView } from "./views/ReinsView";

const CONNECTION: Record<Connection, { label: string; dot: string; text: string }> = {
  live: { label: "Canlı · Stellar testnet", dot: "bg-success pulse-dot", text: "text-success" },
  connecting: { label: "Bağlanıyor…", dot: "bg-warning pulse-dot", text: "text-warning" },
  offline: { label: "Backend'e ulaşılamıyor", dot: "bg-danger", text: "text-danger" },
};

const PRESENT_KEY = "reinkey.present";

/** Sunum modu: panel büyür ve tam ekrana geçer; tercih bu tarayıcıda hatırlanır. */
function usePresent() {
  const [present, setPresent] = useState(() => {
    try {
      return localStorage.getItem(PRESENT_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PRESENT_KEY, present ? "1" : "0");
    } catch {
      /* depolama kapalı */
    }
  }, [present]);
  const toggle = () => {
    const next = !present;
    setPresent(next);
    // Tam ekran reddedilebilir (izin, iframe); büyütme yine de çalışır.
    if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  return [present, toggle] as const;
}

/**
 * Konsolun üç görünümü. Ürün adları (Meter, Reins) tanıtım sitesiyle aynıdır:
 * satıcı Meter'a, ajan sahibi Reins'e bakar; "Canlı" ikisini tek akışta gösterir.
 */
const VIEWS: { id: View; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "live", label: "Canlı", hint: "Ödemeler, zincir işlemleri ve redler, tek akışta", icon: <Activity className="size-3.5" aria-hidden="true" /> },
  { id: "meter", label: "Meter", hint: "Satıcı: gelir, kanallar, tahsilat", icon: <Gauge className="size-3.5" aria-hidden="true" /> },
  { id: "reins", label: "Reins", hint: "Ajan hesabı: politika, harcama, defter", icon: <KeyRound className="size-3.5" aria-hidden="true" /> },
  { id: "float", label: "Float", hint: "Kredi havuzu: büyüklük, pay fiyatı, hatların sağlığı", icon: <Landmark className="size-3.5" aria-hidden="true" /> },
];

function Header({
  connection,
  present,
  onPresent,
  view,
  onView,
}: {
  connection: Connection;
  present: boolean;
  onPresent: () => void;
  view: View;
  onView: (v: View) => void;
}) {
  const c = CONNECTION[connection];
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
        <a href={env.siteUrl} className="flex items-center gap-2.5" aria-label="Reinkey tanıtım sitesi">
          <Mark className="size-6 text-accent" />
          <span className="text-base font-semibold tracking-tight">Reinkey</span>
        </a>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-muted">Console</span>
        <nav aria-label="Görünüm" className="flex items-center gap-1 rounded-full border border-line p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.hint}
              aria-current={view === v.id ? "page" : undefined}
              onClick={() => onView(v.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                view === v.id ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className={cn("flex items-center gap-2 text-xs", c.text)} role="status">
            <span className={cn("size-2 rounded-full", c.dot)} aria-hidden="true" />
            {c.label}
          </span>
          <nav className="flex items-center gap-3 text-xs text-fg-muted">
            <a className="hover:text-fg" href={`${env.siteUrl}/docs`} target="_blank" rel="noreferrer">Docs</a>
            <a className="hover:text-fg" href={`${env.apiUrl}/docs`} target="_blank" rel="noreferrer">API</a>
          </nav>
          <button
            type="button"
            onClick={onPresent}
            aria-pressed={present}
            title="Projeksiyon için büyük yazı ve tam ekran"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            {present ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
            {present ? "Sunumdan çık" : "Sunum modu"}
          </button>
        </div>
      </div>
    </header>
  );
}

function Offline() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-bg px-5 py-4 text-sm" role="alert">
      <PlugZap className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div>
        <p className="font-medium text-fg">Backend&apos;e ulaşılamıyor: {env.apiUrl}</p>
        <p className="mt-1 text-fg-muted">
          Bu panel yalnızca gerçek veriyi gösterir; örnek ya da üretilmiş veri yoktur. Backend&apos;i başlatın:{" "}
          <code className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-xs">cd backend &amp;&amp; npm run start:dev</code>
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [nav, setNav] = useView();
  const f = useFeed(nav.account);
  const { state } = f;
  const [present, togglePresent] = usePresent();
  const float = useFloat(nav.view === "float");
  // Adres verilmediyse backend'in demo hesabı ve demo satıcısı gösterilir.
  const accountAddr = nav.account ?? state.info?.account ?? null;
  const sellerAddr = nav.seller ?? state.info?.seller ?? null;
  const demoAccount = nav.account === null || nav.account === state.info?.account;
  const perSecond = state.info ? big(state.info.prices.tickerPerSecond) : 1000n;
  const live = f.connection === "live";
  const streaming = Object.values(state.streams).some((s) => s.unit === "second" && !s.ended);

  return (
    <div className={cn("flex min-h-full flex-col", present && "present")}>
      <Header
        connection={f.connection}
        present={present}
        onPresent={togglePresent}
        view={nav.view}
        onView={(view) => setNav({ view })}
      />

      <main id="main" className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-6 sm:px-6">
        {f.connection === "offline" && <Offline />}

        {f.actionError && nav.view !== "live" && (
          <p className="flex items-center justify-between gap-3 rounded-md bg-danger-bg px-4 py-2.5 text-xs text-danger" role="alert">
            {f.actionError}
            <button type="button" onClick={f.clearError} className="underline underline-offset-2">
              Kapat
            </button>
          </p>
        )}

        {nav.view === "meter" && (
          <MeterView
            seller={sellerAddr}
            isDemo={nav.seller === null || nav.seller === state.info?.seller}
            channels={state.channels}
            claims={state.claims}
            canClaim={live}
            claiming={f.pending === "claim"}
            onClaim={(id) => void f.claim(id)}
            onSeller={(seller) => setNav({ seller })}
          />
        )}

        {nav.view === "float" && <FloatView data={float.data} failed={float.failed} />}

        {nav.view === "reins" && (
          <ReinsView
            address={accountAddr}
            isDemo={demoAccount}
            account={state.account}
            channels={state.channels}
            rejections={state.rejections}
            rows={state.rows}
            perSecond={perSecond}
            onAccount={(account) => setNav({ account })}
          />
        )}

        {nav.view === "live" && (
          <>
            <Controls
              disabled={!live}
              agentRunning={state.agent.running}
              scenario={state.agent.scenario}
              frozen={demoAccount && state.account ? state.account.frozen : null}
              pending={f.pending}
              error={f.actionError}
              onRun={(s) => void f.runAgent(s)}
              onFreeze={(v) => void f.setFrozen(v)}
              canClear={state.rows.length > 0 || state.logs.length > 0}
              onClear={() => void f.clear()}
              onDismiss={f.clearError}
            />

            <Steps state={state} />

            <Hero totals={f.totals} dataSeconds={state.local.dataSeconds} onShowAll={f.showAll} />

            <Flow
              account={state.account}
              channels={state.channels}
              streams={state.streams}
              claims={state.claims}
              dataSeconds={state.local.dataSeconds}
              rejection={state.rejections.find((r) => r.source === "chain")}
              canClaim={live}
              claiming={f.pending === "claim"}
              onClaim={(id) => void f.claim(id)}
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Price ticks={state.ticks} swaps={state.swaps} streaming={streaming} />
              <div className="grid content-start gap-4">
                <Trades items={state.swaps} />
                <Latency samples={state.local.latencies} />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Timeline rows={state.rows} perSecond={perSecond} account={accountAddr} />
              <div className="grid content-start gap-4">
                <Blocked items={state.rejections} />
                <Terminal logs={state.logs} running={state.agent.running} />
              </div>
            </div>

            <Channels channels={state.channels} />
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1440px] px-4 pb-8 text-[11px] text-fg-subtle sm:px-6">
        Tüm veriler canlıdır: {env.apiUrl} · işlem bağlantıları stellar.expert&apos;e gider · testnet, emanetsiz protokol.
      </footer>
    </div>
  );
}
