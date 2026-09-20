"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * HERO GÖRSELİ: KANAL SİMÜLASYONU.
 *
 * Ürünün tek cümlelik iddiasını ("1000 ödeme, 2 zincir işlemi") sayfa
 * açılır açılmaz gösterir: kanal açılır (1 işlem), bin kupon milisaniyede
 * akar, tahsilat tek işlemle biter; döngü başa sarar. Aşağıdaki Playground
 * ile aynı fiyat ve birimleri kullanır (1 birim = 0.0001 USDC, 5 birim /
 * çağrı). Ağ isteği yok; her şey tarayıcıda.
 *
 * Zaman tek bir rAF döngüsünden okunur; görünmezken ve arka plan sekmede
 * durur, geri gelince kaldığı yerden sürer. "Hareketi azalt" açıksa döngü
 * yoktur, son durum sabit çizilir.
 */
const TOTAL = 1000;
const PRICE = 5;
const DEPOSIT = 10_000;
const LEDGER_SECONDS = 5;
const MAX_LINES = 7;

/** Zaman çizelgesi (ms). */
const T = {
  openSettle: 1300,
  streamStart: 1800,
  streamEnd: 5800,
  claimStart: 6400,
  claimSettle: 7700,
  loop: 10600,
} as const;
const LINE_EVERY = 190;

const usdc = (units: number) =>
  `${Math.floor(units / 10_000)}.${String(units % 10_000).padStart(4, "0")}`;
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

type Line = {
  id: string;
  label: string;
  source: "chain" | "facilitator";
  status: "pending" | "ok";
  kind: "open" | "book" | "chat" | "claim";
  n: number;
  cumulative: number;
};

type View = { vouchers: number; txs: number; lines: Line[]; phase: "open" | "stream" | "claim" | "done" };

function compute(elapsed: number): View {
  const t = elapsed % T.loop;
  const lines: Line[] = [];

  const openDone = t >= T.openSettle;
  lines.push({ id: "open", label: "channel.open", source: "chain", status: openDone ? "ok" : "pending", kind: "open", n: 0, cumulative: 0 });

  let vouchers = 0;
  if (t >= T.streamStart) {
    const p = Math.min(1, (t - T.streamStart) / (T.streamEnd - T.streamStart));
    vouchers = Math.round(TOTAL * easeOutCubic(p));
    const count = Math.min(Math.floor((Math.min(t, T.streamEnd) - T.streamStart) / LINE_EVERY) + 1, 200);
    for (let k = 0; k < count; k += 1) {
      const at = T.streamStart + k * LINE_EVERY;
      const pk = Math.min(1, (at - T.streamStart) / (T.streamEnd - T.streamStart));
      const n = Math.max(1, Math.round(TOTAL * easeOutCubic(pk)));
      lines.push({
        id: `v${k}`,
        label: k % 4 === 3 ? "POST /demo/chat" : "GET /demo/book",
        source: "facilitator",
        status: "ok",
        kind: k % 4 === 3 ? "chat" : "book",
        n,
        cumulative: n * PRICE,
      });
    }
  }

  let txs = openDone ? 1 : 0;
  let phase: View["phase"] = openDone ? "stream" : "open";
  if (t >= T.claimStart) {
    const claimDone = t >= T.claimSettle;
    if (claimDone) txs = 2;
    phase = claimDone ? "done" : "claim";
    lines.push({ id: "claim", label: "channel.claim", source: "chain", status: claimDone ? "ok" : "pending", kind: "claim", n: TOTAL, cumulative: TOTAL * PRICE });
  }

  return { vouchers, txs, lines: lines.slice(-MAX_LINES).reverse(), phase };
}

const FINAL: View = compute(T.claimSettle + 1);

/** "Hareketi azalt" tercihi; sunucuda ve ilk boyamada kapalı sayılır. */
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const q = window.matchMedia(REDUCED_QUERY);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

export function HeroVisual() {
  const t = useTranslations("playground");
  const th = useTranslations("hero.visual");
  const ref = useRef<HTMLDivElement>(null);
  const [live, setView] = useState<View>(() => compute(0));
  const reduced = useReducedMotion();
  // Hareket azaltılmışsa döngü yoktur; son durum sabit çizilir.
  const view = reduced ? FINAL : live;

  useEffect(() => {
    const element = ref.current;
    if (!element || reduced) return;

    let frame = 0;
    let running = false;
    let last = 0;
    let acc = 0;
    let lastPaint = -1;

    const step = (now: number) => {
      if (!running) return;
      acc += now - last;
      last = now;
      // 30 kare/sn yeter; her karede state yazmak DOM'u boşuna yorar.
      if (now - lastPaint > 33) {
        lastPaint = now;
        setView(compute(acc));
      }
      frame = requestAnimationFrame(step);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && document.visibilityState === "visible") start();
        else stop();
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const paid = view.vouchers * PRICE;
  const claimed = view.phase === "done";
  const channelPct = claimed ? 0 : Math.round((paid / DEPOSIT) * 100);
  const exactSeconds = view.vouchers * LEDGER_SECONDS;
  const exactTime =
    exactSeconds < 60
      ? t("counters.seconds", { n: exactSeconds })
      : t("counters.minutes", { n: Math.round(exactSeconds / 60) });

  const describe = (line: Line) => {
    switch (line.kind) {
      case "open":
        return line.status === "pending"
          ? t("trace.pending")
          : `${t("trace.deposit", { amount: usdc(DEPOSIT) })} → tx`;
      case "claim":
        return line.status === "pending"
          ? t("trace.pending")
          : t("trace.claim", { count: line.n, amount: usdc(line.cumulative) });
      case "chat":
        return `402 → ${t("trace.voucher")} #${line.n} (${usdc(line.cumulative)}) → 200 · ${t("trace.tokens", { count: 200 })}`;
      default:
        return `402 → ${t("trace.voucher")} #${line.n} (${usdc(line.cumulative)}) → 200`;
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Panelin arkasında nefes alan marka ışığı. */}
      <div
        aria-hidden="true"
        className="breathe pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[70%] w-[90%] -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--brand-blue)_38%,transparent)_0%,transparent_70%)] blur-3xl"
      />

      <div className="card overflow-hidden rounded-xl bg-surface-1/90 backdrop-blur-xl">
        {/* Başlık şeridi */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-fg-subtle/30" />
            <span className="size-2.5 rounded-full bg-fg-subtle/20" />
            <span className="size-2.5 rounded-full bg-fg-subtle/15" />
          </span>
          <span dir="ltr" className="ms-2 truncate rounded-full bg-bg px-3 py-1 font-mono text-xs text-fg-subtle">
            agent-01 → demo-seller · stellar:testnet
          </span>
          {/*
            Etiket sade ve DURAĞAN: yanıp sönen yeşil bir nokta "canlı yayın"
            demektir. Buradaki sayılar canlı değil, ürünün kendi birimleriyle
            kurulmuş bir örnek akış; rozet de onu söylemeli.
          */}
          <span className="ms-auto rounded-full border border-line px-2.5 py-1 text-[11px] font-medium tracking-[0.1em] text-fg-subtle uppercase">
            {th("badge")}
          </span>
        </div>

        <div className="grid lg:grid-cols-12">
          {/* Sol: iz */}
          <ol
            dir="ltr"
            aria-hidden="true"
            className="relative flex h-[19.5rem] flex-col justify-end overflow-hidden border-b border-line font-mono text-xs lg:col-span-7 lg:border-e lg:border-b-0"
          >
            {/* Üstte zemine erime: eski satırlar sessizce kaybolur. */}
            <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-linear-to-b from-surface-1 to-transparent" />
            {view.lines.slice().reverse().map((line) => (
              <li key={line.id} className="flex items-baseline gap-3 border-t border-line/60 px-4 py-2.5 first:border-t-0">
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    line.status === "ok" && line.source === "chain" && "bg-accent/15 text-accent-text",
                    line.status === "ok" && line.source === "facilitator" && "bg-success-bg text-success",
                    line.status === "pending" && "bg-surface-3 text-fg-muted",
                    line.status === "pending" && !reduced && "soft-pulse",
                  )}
                >
                  {line.status === "ok" ? "OK" : "…"}
                </span>
                <span className="w-28 shrink-0 truncate text-fg sm:w-32">{line.label}</span>
                {/* Dar ekranda tam açıklama sığmaz; yalnızca kupon numarası kalır. */}
                <span className="hidden min-w-0 flex-1 truncate text-fg-muted sm:block">{describe(line)}</span>
                <span className="min-w-0 flex-1 truncate text-fg-muted sm:hidden">
                  {line.kind === "book" || line.kind === "chat" ? `#${line.n}` : line.status === "ok" ? "OK" : "…"}
                </span>
                <span className={cn("shrink-0 tabular-nums", line.source === "chain" ? "text-accent-text" : "text-fg-subtle")}>
                  {line.source === "chain" ? t("trace.chainTime") : t("trace.voucherTime")}
                </span>
              </li>
            ))}
          </ol>

          {/* Sağ: sayaçlar */}
          <dl className="grid grid-cols-2 gap-px bg-line lg:col-span-5 lg:grid-cols-2">
            <div className="bg-surface-1 px-5 py-4">
              <dt className="text-xs text-fg-subtle">{t("counters.vouchers")}</dt>
              <dd dir="ltr" className="mt-1 font-display text-3xl font-semibold text-accent-text tabular-nums sm:text-4xl">
                {view.vouchers.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="bg-surface-1 px-5 py-4">
              <dt className="text-xs text-fg-subtle">{t("counters.txs")}</dt>
              <dd dir="ltr" className="mt-1 font-display text-3xl font-semibold text-fg tabular-nums sm:text-4xl">
                {view.txs}
              </dd>
            </div>
            <div className="col-span-2 bg-surface-1 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-fg-muted">{t("meters.channel")}</dt>
                <dd dir="ltr" className="font-mono text-fg tabular-nums">
                  {usdc(claimed ? 0 : paid)} / {usdc(DEPOSIT)}
                </dd>
              </div>
              <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{ width: `${channelPct}%`, backgroundImage: "var(--accent-gradient)" }}
                />
              </div>
            </div>
            <div className="bg-surface-1 px-5 py-4">
              <dt className="text-xs text-fg-subtle">{t("counters.paid")}</dt>
              <dd dir="ltr" className="mt-1.5 font-mono text-sm font-medium text-fg tabular-nums">
                {usdc(paid)} USDC
              </dd>
            </div>
            <div className="bg-surface-1 px-5 py-4">
              <dt className="text-xs text-fg-subtle">{t("counters.exact")}</dt>
              <dd dir="ltr" className="mt-1.5 font-mono text-sm text-fg-muted tabular-nums">
                {t("counters.exactValue", { count: view.vouchers, time: exactTime })}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
