"use client";

/**
 * Reinkey Float · kredi havuzu görünümü. Yatırımcı USDC yatırır, pay alır; ajanlar
 * havuzdan açılan hatla çalışır. Hesap havuza devredildiği için para politikanın
 * dışına çıkamaz ("kaçamayan sermaye"); teminat istenmez, sağlık zincirde hesaplanır.
 * Her sayı zincirden okunur; bu görünüm hiçbir işlem göndermez.
 */
import { useTranslations } from "next-intl";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { clock, int, percent, shortAddr, usdc } from "@/lib/format";
import { useSize } from "@/lib/hooks";
import type { DemoInfo, FloatLine, FloatOverview, FloatSample } from "@/lib/types";
import { FloatActions } from "../FloatActions";
import { Empty, Panel, cn } from "../ui";

const SCALE = 10_000_000n;
/** Baz puan → yüzde metni, seçili dilin biçimiyle. */
const pct = (bps: number, digits = 2) => percent(bps, digits);

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card min-w-0 rounded-lg px-4 py-4 sm:px-5">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-1.5 truncate text-lg font-semibold tracking-tight sm:text-2xl", accent && "text-gradient")}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

/** Pay fiyatı çizgisi. Tek seri; eksen yok, uçlarda değer ve saat yeter. */
function SharePriceChart({ samples }: { samples: FloatSample[] }) {
  const t = useTranslations("float");
  const [ref, { width }] = useSize<HTMLDivElement>();
  const H = 120;
  const pts = samples.map((s) => ({ t: Date.parse(s.ts), v: Number(BigInt(s.sharePrice)) / Number(SCALE) }));
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  // Eksen en az ±%0,1 genişliğinde: yüz binde birlik oynama uçurum gibi çizilmesin.
  const pad = Math.max((hi - lo) * 0.25, hi * 0.001);
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[pts.length - 1]?.t ?? 1;
  const x = (t: number) => 8 + (t1 > t0 ? ((t - t0) / (t1 - t0)) * (width - 16) : width - 16);
  const y = (v: number) => 12 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 24);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];

  return (
    <div ref={ref} className="px-5 py-4">
      {pts.length < 2 || width === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("chartWaiting", { count: pts.length })}</p>
      ) : (
        <>
          <svg width={width} height={H} role="img" aria-label={t("chartAria", { count: pts.length, last: last.v.toFixed(7) })} className="block">
            <line x1={8} x2={width - 8} y1={y(1)} y2={y(1)} stroke="var(--line)" strokeDasharray="3 3" opacity={y(1) > 0 && y(1) < H ? 1 : 0} />
            <path d={d} fill="none" stroke="var(--brand-sky)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last.t)} cy={y(last.v)} r={4} fill="var(--brand-sky)" stroke="var(--surface)" strokeWidth={2} />
          </svg>
          <p className="tabular mt-1 flex justify-between font-mono text-[10.5px] text-fg-subtle">
            <span>
              {clock(samples[0].ts)} · {pts[0].v.toFixed(5)}
            </span>
            <span>
              {last.v.toFixed(5)} · {clock(samples[samples.length - 1].ts)}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/** Sağlık göstergesi: değer / borç. Eşiğin (ör. %90) altı tasfiye bölgesi. */
function HealthBar({ line }: { line: FloatLine }) {
  const t = useTranslations("float");
  if (line.healthBps === null) return <span className="text-xs text-fg-subtle">{t("noDebt")}</span>;
  const max = 15_000;
  const pos = Math.min(line.healthBps, max) / max;
  const thr = line.liqThresholdBps / max;
  return (
    <div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-0 bg-danger/40" style={{ width: `${thr * 100}%` }} />
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", line.liquidatable ? "bg-danger" : "bg-success")}
          style={{ width: `${pos * 100}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-fg" style={{ left: `${thr * 100}%` }} aria-hidden="true" />
      </div>
      <p className="tabular mt-1 text-[11px] text-fg-subtle">
        {t("health", { ratio: pct(line.healthBps, 1), threshold: pct(line.liqThresholdBps, 0) })}
      </p>
    </div>
  );
}

export function FloatView({
  data,
  failed,
  info,
  wallet,
  onRefresh,
}: {
  data: FloatOverview | null;
  failed: boolean;
  info: DemoInfo | null;
  wallet: React.ComponentProps<typeof FloatActions>["wallet"];
  onRefresh: () => void;
}) {
  const t = useTranslations("float");
  if (!data)
    return (
      <Panel title={t("name")}>
        <Empty>{failed ? t("failed") : t("loading")}</Empty>
      </Panel>
    );
  if (!data.enabled)
    return (
      <Panel title={t("name")}>
        <Empty>{t("disabled")}</Empty>
      </Panel>
    );

  const { pool, lines, positions, history } = data;
  const sp = BigInt(pool.sharePrice);
  const gainBps = Number(((sp - SCALE) * 10_000n) / SCALE);
  const openLines = lines.filter((l) => l.open);
  const atRisk = lines.filter((l) => l.liquidatable).length;

  return (
    <>
      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 card rounded-lg px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[11px] text-fg-subtle">{t("contract")}</p>
          <p className="mt-0.5 font-mono text-sm">
            <span className="hidden md:inline">{pool.pool}</span>
            <span className="md:hidden">{shortAddr(pool.pool, 6, 6)}</span>
          </p>
        </div>
        <p className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          {t("readOnly", { ledger: int(pool.ledger) })}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={t("size")} value={`${usdc(pool.totalAssets, 2)} USDC`} sub={t("sizeSub")} accent />
        <Kpi
          label={t("sharePrice")}
          value={usdc(pool.sharePrice, 5)}
          sub={t("sharePriceSub", { gain: `${gainBps >= 0 ? "+" : ""}${pct(gainBps)}`, share: pct(pool.config.profitShareBps, 0) })}
        />
        <Kpi
          label={t("utilisation")}
          value={pct(pool.utilizationBps, 1)}
          sub={t("utilisationSub", { debt: usdc(pool.totalDebt, 2), idle: usdc(pool.idle, 2) })}
        />
        <Kpi
          label={t("lines")}
          value={t("linesValue", { count: openLines.length })}
          sub={atRisk ? t("linesRisk", { count: atRisk }) : t("linesSafe", { count: lines.length })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title={t("lines")} hint={t("linesHint")}>
          {lines.length === 0 ? (
            <Empty>{t("linesEmpty")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.account} className="grid gap-3 px-5 py-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{shortAddr(l.account, 6, 6)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px]",
                        !l.open ? "bg-surface-3 text-fg-subtle" : l.liquidatable ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
                      )}
                    >
                      {!l.open ? t("closed") : l.liquidatable ? t("liquidatable") : t("healthy")}
                    </span>
                    {l.liquidatable && <TriangleAlert className="size-4 text-danger" aria-hidden="true" />}
                    <span className="tabular ml-auto text-fg-muted">
                      {t("lineAmounts", { debt: usdc(l.debt, 2), value: usdc(l.value, 2) })}
                    </span>
                  </p>
                  <HealthBar line={l} />
                  <p className="tabular text-[11px] text-fg-subtle">
                    {t("lineHoldings", { usdc: usdc(l.usdc, 2), xlm: usdc(l.xlm, 2), price: usdc(l.price, 5) })}
                    {l.beneficiary && t("beneficiary", { address: shortAddr(l.beneficiary, 4, 4) })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid content-start gap-4">
          <FloatActions pool={pool} info={info} wallet={wallet} positions={positions} onDone={onRefresh} />
          <Panel title={t("chartTitle")} hint={t("chartHint")}>
            <SharePriceChart samples={history} />
          </Panel>

          <Panel title={t("investors")} hint={t("investorsHint")}>
            {positions.length === 0 ? (
              <Empty>{t("investorsEmpty")}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {positions.map((p) => (
                  <li key={p.address} className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="font-mono text-xs">{shortAddr(p.address, 5, 5)}</span>
                    <span className="text-xs text-fg-muted">{t("shareOfPool", { percent: pct(p.shareOfPoolBps, 1) })}</span>
                    <span className="ml-auto">
                      <span className="font-semibold">{usdc(p.value, 2)} USDC</span>{" "}
                      <span className="text-xs text-fg-subtle">{t("shares", { count: usdc(p.shares, 2) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <p className="rounded-lg border border-line bg-bg-alt px-5 py-3 text-xs leading-relaxed text-fg-muted">
        <span className="font-semibold text-fg">{t("priceNoteTitle")}</span>{" "}
        {t("priceNote", { price: usdc(pool.price, 5), threshold: pct(pool.config.liqThresholdBps, 0) })}
      </p>
    </>
  );
}
