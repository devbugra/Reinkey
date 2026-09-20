"use client";

/**
 * Meter · satıcı finansı. Üç kavram ayrı tutulur: kazanılan (imzalı kuponlar),
 * tahsil edilen (zincirde cüzdana geçen), alacak (aradaki fark). Kaynak denetim
 * defteridir; rapor ile defter ayrışamaz.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { env } from "@/lib/env";
import { duration, int, shortAddr, usdc } from "@/lib/format";
import { currentLocale } from "@/lib/locale";
import { useRevenue } from "@/lib/useRevenue";
import { Empty, Panel, cn } from "./ui";

const label = (resource: string) => {
  try {
    const u = new URL(resource);
    return `${u.host}${u.pathname}`;
  } catch {
    return resource;
  }
};
const UNIT: Record<string, "unitRequest" | "unitToken" | "unitSecond"> = {
  request: "unitRequest",
  token: "unitToken",
  second: "unitSecond",
};

export function Revenue({ seller, active }: { seller: string | null; active: boolean }) {
  const t = useTranslations("revenue");
  const [bucket, setBucket] = useState<"hour" | "day">("hour");
  const r = useRevenue(seller, active, bucket);

  if (!r)
    return (
      <Panel title={t("title")}>
        <Empty>{seller ? t("loading") : t("noSeller")}</Empty>
      </Panel>
    );

  const earned = BigInt(r.totals.earned);
  const peak = r.series.reduce((m, s) => Math.max(m, Number(BigInt(s.earned)), Number(BigInt(s.settled))), 1);
  const topResource = r.byResource.reduce((m, x) => Math.max(m, Number(BigInt(x.amount))), 1);
  const fmtT = (iso: string) =>
    new Date(iso).toLocaleString(currentLocale(), bucket === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel
        title={t("title")}
        hint={t("hint", { days: r.window.days, payments: int(r.totals.payments), buyers: int(r.totals.buyers) })}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label={t("rangeAria")}>
              {(["hour", "day"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={bucket === b}
                  onClick={() => setBucket(b)}
                  className={cn("rounded-[5px] px-2.5 py-1", bucket === b ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
                >
                  {b === "hour" ? t("hourly") : t("daily")}
                </button>
              ))}
            </div>
            <a
              href={`${env.apiUrl}/sellers/${r.payTo}/settlements.csv`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg"
              title={t("csvTitle")}
            >
              <Download className="size-3.5" aria-hidden="true" /> CSV
            </a>
          </div>
        }
      >
        <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line px-5 py-4 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-fg-subtle">{t("earned")}</dt>
            <dd className="mt-0.5 text-base font-semibold">{usdc(r.totals.earned)} USDC</dd>
          </div>
          <div>
            <dt className="text-[11px] text-fg-subtle">{t("settled")}</dt>
            <dd className="mt-0.5 text-base font-semibold">{usdc(r.totals.settled)} USDC</dd>
          </div>
          <div>
            <dt className="text-[11px] text-fg-subtle">{t("receivable")}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold", BigInt(r.totals.receivable) > 0n && "text-accent")}>{usdc(r.totals.receivable)} USDC</dd>
          </div>
          <div>
            <dt className="text-[11px] text-fg-subtle">{t("perSettlement")}</dt>
            <dd className="mt-0.5 text-base font-semibold">
              {r.totals.paymentsPerSettlement ?? "—"}
              <span className="ml-1.5 text-xs font-normal text-fg-subtle">{t("settlements", { count: r.totals.settlements })}</span>
            </dd>
          </div>
        </dl>

        {r.series.length === 0 ? (
          <Empty>{t("emptyWindow")}</Empty>
        ) : (
          <div className="px-5 py-4">
            <div className="flex h-32 items-end gap-2" role="img" aria-label={t("chartAria")}>
              {r.series.map((s) => (
                <div
                  key={s.t}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={t("bar", { time: fmtT(s.t), earned: usdc(s.earned), settled: usdc(s.settled), payments: int(s.payments) })}
                >
                  <div className="flex h-full items-end justify-center gap-0.5">
                    <div className="w-1/2 max-w-5 rounded-t-[4px] bg-brand-sky" style={{ height: `${(Number(BigInt(s.earned)) / peak) * 100}%` }} />
                    <div className="w-1/2 max-w-5 rounded-t-[4px] bg-brand-lavender" style={{ height: `${(Number(BigInt(s.settled)) / peak) * 100}%` }} />
                  </div>
                  <p className="tabular mt-1.5 truncate border-t border-line pt-1 text-center font-mono text-[10px] text-fg-subtle">{fmtT(s.t)}</p>
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-fg-muted">
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-sky" aria-hidden="true" /> {t("legendEarned")}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-lavender" aria-hidden="true" /> {t("legendSettled")}
              </li>
            </ul>
          </div>
        )}
      </Panel>

      <div className="grid content-start gap-4">
        <Panel title={t("byResource")} hint={t("byResourceHint")}>
          {r.byResource.length === 0 ? (
            <Empty>{t("byResourceEmpty")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {r.byResource.slice(0, 6).map((x) => (
                <li key={`${x.resource}-${x.unit}`} className="grid gap-1.5 px-5 py-3">
                  <p className="tabular flex items-baseline gap-3 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs text-fg-muted">{label(x.resource)}</span>
                    <span className="ml-auto shrink-0 font-semibold">{usdc(x.amount)}</span>
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-brand-sky" style={{ width: `${(Number(BigInt(x.amount)) / topResource) * 100}%` }} />
                  </div>
                  <p className="tabular text-[11px] text-fg-subtle">
                    {t("share", {
                      count: int(x.payments),
                      unit: UNIT[x.unit] ? t(UNIT[x.unit]) : x.unit,
                      percent: earned > 0n ? Math.round(Number((BigInt(x.amount) * 1000n) / earned) / 10) : 0,
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("aging")} hint={t("agingHint")}>
          {r.receivables.length === 0 ? (
            <Empty>{t("agingEmpty")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {r.receivables.map((x) => (
                <li key={x.channelId} className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="font-mono text-xs">#{x.channelId}</span>
                  <span className="font-mono text-xs text-fg-muted">{shortAddr(x.payer, 4, 4)}</span>
                  <span className="text-[11px] text-fg-subtle">
                    {x.ageSeconds !== null ? t("ago", { age: duration(x.ageSeconds) }) : "—"}
                    {x.expiresInSeconds !== null && t("expires", { in: duration(x.expiresInSeconds) })}
                  </span>
                  <span className="ml-auto font-semibold">{usdc(x.amount)} USDC</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
