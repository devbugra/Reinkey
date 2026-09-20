"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlugZap } from "lucide-react";
import { env } from "@/lib/env";
import { big } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import { useFloat } from "@/lib/useFloat";
import { useWallet } from "@/lib/wallet";
import { useWorkspaces, type Profile, type Role } from "@/lib/workspace";
import { useView } from "@/lib/useView";
import { Blocked } from "./Blocked";
import { Channels } from "./Channels";
import { Controls } from "./Controls";
import { Flow } from "./Flow";
import { Hero } from "./Hero";
import { Latency } from "./Latency";
import { Price } from "./Price";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { Steps } from "./Steps";
import { Terminal } from "./Terminal";
import { Timeline } from "./Timeline";
import { Trades } from "./Trades";
import { PageHeader, Section, cn } from "./ui";
import { DexView } from "./views/DexView";
import { FloatView } from "./views/FloatView";
import { MeterView } from "./views/MeterView";
import { ReinsView } from "./views/ReinsView";

function Offline() {
  const t = useTranslations("offline");
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-bg px-5 py-4 text-sm" role="alert">
      <PlugZap className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div>
        <p className="font-medium text-fg">{t("title", { api: env.apiUrl })}</p>
        <p className="mt-1 text-fg-muted">
          {t("body")}{" "}
          <code className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-xs">cd backend &amp;&amp; npm run start:dev</code>
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const t = useTranslations();
  const [nav, setNav] = useView();
  const ws = useWorkspaces();
  const wallet = useWallet();
  const f = useFeed(nav.account);
  const { state } = f;
  const float = useFloat(nav.view === "float");
  const [adding, setAdding] = useState(false);

  /**
   * Adres çözümü: URL > örnek hesap. URL tek gerçek kaynaktır, böylece her
   * görünüm paylaşılabilir bir bağlantıdır; kayıtlı alanlar yalnızca
   * "adreslerim" listesi.
   */
  const accountAddr = nav.account ?? state.info?.account ?? null;
  const sellerAddr = nav.seller ?? state.info?.seller ?? null;
  const isExample = nav.account === null || nav.account === state.info?.account;
  const activeProfile =
    ws.profiles.find((p) => (p.role === "agent" ? p.address === nav.account : p.address === nav.seller)) ?? null;
  /** URL'den gelen ama kayıtlı olmayan adres: seçicide "kaydet" olarak sunulur. */
  const unsaved: { role: Role; address: string } | null = activeProfile
    ? null
    : nav.account
      ? { role: "agent", address: nav.account }
      : nav.seller
        ? { role: "seller", address: nav.seller }
        : null;

  /** Bir alana geçiş: adresi URL'ye yazar ve o rolün görünümünü açar. */
  const openProfile = (p: Profile) => {
    setNav(
      p.role === "agent"
        ? { view: "reins", account: p.address, seller: null }
        : { view: "meter", seller: p.address, account: null },
    );
    window.scrollTo({ top: 0 });
  };
  const pick = (role: Role, address: string) => {
    const label = `${t(role === "agent" ? "workspace.roleAgent" : "workspace.roleSeller")} ${address.slice(0, 4)}…${address.slice(-4)}`;
    openProfile(ws.add({ role, address, label }));
    setAdding(false);
  };
  const showExample = () => {
    ws.dismiss();
    setAdding(false);
    setNav({ view: "live", account: null, seller: null });
  };

  /**
   * Karşılama yalnızca "çıplak" ilk girişte: URL'de adres ya da görünüm belirtilmişse
   * (paylaşılan bir bağlantı) doğrudan o sayfa açılır.
   */
  const welcome = (!ws.onboarded && !nav.account && !nav.seller && nav.view === "live") || adding;
  const perSecond = state.info ? big(state.info.prices.tickerPerSecond) : 1000n;
  const live = f.connection === "live";
  const streaming = Object.values(state.streams).some((s) => s.unit === "second" && !s.ended);

  return (
    <Shell
      view={nav.view}
      onView={(view) => setNav({ view })}
      connection={f.connection}
      workspace={
        <WorkspaceSwitcher
          profiles={ws.profiles}
          activeId={activeProfile?.id ?? null}
          unsaved={unsaved}
          onSelect={openProfile}
          onExample={showExample}
          onAdd={() => setAdding(true)}
          onRemove={ws.remove}
          onSave={(p) => pick(p.role, p.address)}
          wallet={{
            address: wallet.address,
            connecting: wallet.connecting,
            connect: () => void wallet.connect(),
            disconnect: () => void wallet.disconnect(),
          }}
        />
      }
    >
      {welcome ? (
        <Onboarding
          wallet={wallet}
          onPick={pick}
          onExample={showExample}
          onFloat={() => {
            ws.dismiss();
            setAdding(false);
            setNav({ view: "float" });
          }}
        />
      ) : (
        <>
          {f.connection === "offline" && <Offline />}

          {f.actionError && nav.view !== "live" && (
            <p className="flex items-center justify-between gap-3 rounded-md bg-danger-bg px-4 py-2.5 text-xs text-danger" role="alert">
              {f.actionError}
              <button type="button" onClick={f.clearError} className="underline underline-offset-2">
                {t("common.close")}
              </button>
            </p>
          )}

          {nav.view === "meter" && (
            <>
              <PageHeader eyebrow={t("meter.eyebrow")} title={t("meter.title")} lead={t("meter.lead")} />
              {/* Görünüm içi bloklar sıkı dizilir; geniş boşluk yalnızca başlık ile gövde arasındadır. */}
              <div className="grid gap-4">
                <MeterView
                  seller={sellerAddr}
                  isExample={nav.seller === null || nav.seller === state.info?.seller}
                  channels={state.channels}
                  claims={state.claims}
                  canClaim={live}
                  claiming={f.pending === "claim"}
                  onClaim={(id) => void f.claim(id)}
                  onSeller={(seller) => setNav({ seller })}
                />
              </div>
            </>
          )}

          {nav.view === "dex" && (
            <>
              <PageHeader eyebrow={t("dex.eyebrow")} title={t("dex.title")} lead={t("dex.lead")} />
              <DexView account={accountAddr} />
            </>
          )}

          {nav.view === "float" && (
            <>
              <PageHeader eyebrow={t("float.eyebrow")} title={t("float.title")} lead={t("float.lead")} />
              <div className="grid gap-4">
                <FloatView data={float.data} failed={float.failed} info={state.info} wallet={wallet} onRefresh={float.refresh} />
              </div>
            </>
          )}

          {nav.view === "reins" && (
            <>
              <PageHeader eyebrow={t("reins.eyebrow")} title={t("reins.title")} lead={t("reins.lead")} />
              <div className="grid gap-4">
                <ReinsView
                  address={accountAddr}
                  isExample={isExample}
                  account={state.account}
                  channels={state.channels}
                  rejections={state.rejections}
                  rows={state.rows}
                  perSecond={perSecond}
                  onAccount={(account) => setNav({ account })}
                />
              </div>
            </>
          )}

          {nav.view === "live" && (
            <>
              <PageHeader eyebrow={t("live.eyebrow")} title={t("live.title")} lead={t("live.lead")} />

              <Section index={1} title={t("live.summary")} hint={t("live.summaryHint")}>
                <Hero totals={f.totals} dataSeconds={state.local.dataSeconds} onShowAll={f.showAll} />
                {/*
                 * Örnek akış kontrolleri YALNIZCA örnek hesapta. Kendi adresini
                 * bağlayan biri için bu düğmeler hem çalışmaz (backend onları
                 * yalnızca örnek hesap için kabul eder) hem de anlamsızdır:
                 * konsol onun verisini izler, senaryo oynatmaz.
                 */}
                {isExample && (
                  <>
                    <Steps state={state} />
                    <Controls
                      disabled={!live}
                      agentRunning={state.agent.running}
                      scenario={state.agent.scenario}
                      frozen={state.account ? state.account.frozen : null}
                      pending={f.pending}
                      error={f.actionError}
                      onRun={(s) => void f.runAgent(s)}
                      onFreeze={(v) => void f.setFrozen(v)}
                      canClear={state.rows.length > 0 || state.logs.length > 0}
                      onClear={() => void f.clear()}
                      onDismiss={f.clearError}
                    />
                  </>
                )}
              </Section>

              <Section index={2} title={t("live.flow")} hint={t("live.flowHint")}>
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
              </Section>

              <Section index={3} title={t("live.market")} hint={t("live.marketHint")}>
                {/* Grafik boşken sütun boyuna uzamasın: boş bir kutu sayfanın en büyük öğesi olmamalı. */}
                <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]", state.ticks.length === 0 && "xl:items-start")}>
                  <Price ticks={state.ticks} swaps={state.swaps} streaming={streaming} />
                  <div className="grid content-start gap-4">
                    <Trades items={state.swaps} />
                    <Latency samples={state.local.latencies} />
                  </div>
                </div>
              </Section>

              <Section index={4} title={t("live.events")} hint={t("live.eventsHint")}>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <Timeline rows={state.rows} perSecond={perSecond} account={accountAddr} />
                  <div className="grid content-start gap-4">
                    <Blocked items={state.rejections} />
                    {isExample && <Terminal logs={state.logs} running={state.agent.running} />}
                  </div>
                </div>
                <Channels channels={state.channels} />
              </Section>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
