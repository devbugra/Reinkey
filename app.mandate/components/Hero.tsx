"use client";

/** Ana cümle: "N ödeme → M zincir işlemi" ve aynı işin ödeme başına işlemle karşılığı. */
import { useTranslations } from "next-intl";
import { duration, int, usdc } from "@/lib/format";
import { useAnimatedNumber } from "@/lib/hooks";
import type { Totals } from "@/lib/useFeed";

function Bar({ label, value, sub, ratio, tone }: { label: string; value: string; sub: string; ratio: number; tone: "ours" | "theirs" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular text-fg">
          <span className="font-semibold">{value}</span> <span className="text-fg-subtle">{sub}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={tone === "ours" ? "h-full rounded-full bg-success" : "h-full rounded-full bg-fg-subtle"}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 1.5 : 0)}%`, transition: "width 400ms" }}
        />
      </div>
    </div>
  );
}

export function Hero({
  totals,
  dataSeconds,
  onShowAll,
}: {
  totals: Totals | null;
  dataSeconds: number;
  onShowAll: () => void;
}) {
  const t = useTranslations("summary");
  const payments = useAnimatedNumber(totals?.payments ?? 0);
  const txs = useAnimatedNumber(totals?.txs ?? 0);
  const exactTx = totals?.exactTx ?? 0;
  const max = Math.max(exactTx, totals?.txs ?? 0, 1);
  const dash = totals ? null : "—";

  return (
    <section className="card grid gap-6 rounded-xl px-6 py-7 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div>
        <p className="flex flex-wrap items-center gap-x-3 text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
          {totals?.scoped ? t("thisRun") : t("soFar")}
          {totals?.scoped && (
            <button
              type="button"
              onClick={onShowAll}
              className="normal-case tracking-normal text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg"
            >
              {t("showAll")}
            </button>
          )}
        </p>
        <p className="font-display tabular mt-2 flex flex-wrap items-baseline gap-x-3 text-4xl font-semibold tracking-tight 2xl:text-5xl" aria-live="polite">
          {/* İki yarı ayrı ayrı bölünmez: "38 zincir / işlemi" diye kırılmasın. */}
          <span className="whitespace-nowrap">
            <span className="text-gradient">{dash ?? int(payments)}</span>
            <span className="text-fg-muted"> {t("payments", { count: Math.round(payments) })}</span>
          </span>
          <span className="text-fg-subtle" aria-hidden="true">→</span>
          <span className="whitespace-nowrap">
            <span>{dash ?? int(txs)}</span>
            <span className="text-fg-muted"> {t("chainTxs", { count: Math.round(txs) })}</span>
          </span>
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">{t("lead")}</p>
        <dl className="tabular mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-fg-subtle">{t("volume")}</dt>
            <dd className="mt-0.5 font-semibold">{totals ? `${usdc(totals.volume)} USDC` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("data")}</dt>
            <dd className="mt-0.5 font-semibold">{duration(dataSeconds)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("latency")}</dt>
            <dd className="mt-0.5 font-semibold text-accent">{totals ? `${totals.latencyMs} ms` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("rejected")}</dt>
            <dd className="mt-0.5 font-semibold">{totals ? int(totals.rejected) : "—"}</dd>
          </div>
        </dl>
      </div>

      {/*
       * Aynı ödemelerin iki maliyeti. Rakip kıyaslaması değil, ölçü: kanal
       * olmadan her ödeme ayrı bir Stellar işlemi olurdu ve ledger başına
       * ~5 saniye beklerdi.
       */}
      <div className="grid gap-4 rounded-lg border border-line bg-bg-alt p-5">
        <p className="text-xs font-medium text-fg-muted">{t("compareTitle")}</p>
        <Bar label={t("withChannel")} value={int(totals?.txs ?? 0)} sub={t("txUnit")} ratio={(totals?.txs ?? 0) / max} tone="ours" />
        <Bar
          label={t("perPayment")}
          value={int(exactTx)}
          sub={`${t("txUnit")} · ≈ ${duration(totals?.exactSeconds ?? 0)}`}
          ratio={exactTx / max}
          tone="theirs"
        />
        <p className="text-[11px] leading-relaxed text-fg-subtle">{t("compareNote")}</p>
      </div>
    </section>
  );
}
