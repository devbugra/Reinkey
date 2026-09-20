"use client";

/**
 * BORSA · kotasyon ve politika kararı.
 *
 * Kendi likidite havuzumuz yok: takas Stellar'da zaten var olan havuzda olur ve
 * fonlar hiçbir aşamada bize geçmez. Bu ekranın değeri rota değil, yanındaki
 * karar: ajanın KENDİ hesabı bu işlemi kabul eder mi? Kural kaynağı hesabın
 * kontratı; burada zincire gitmeden ve ücret ödemeden aynı kurallar uygulanır.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, CircleCheck, CircleX, Info } from "lucide-react";
import { int, usdc } from "@/lib/format";
import type { DexSide } from "@/lib/types";
import { useQuote } from "@/lib/useQuote";
import { Empty, Panel, cn } from "../ui";

const SCALE = 10_000_000n;
const SLIPPAGES = [50, 100, 300];

/** "1,5" → 15000000n. Boş ya da geçersizse null. */
function parseAmount(text: string): bigint | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,7})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const v = BigInt(whole) * SCALE + BigInt(frac.padEnd(7, "0"));
  return v > 0n ? v : null;
}

const price = (v: string | bigint, digits = 5) =>
  (Number(typeof v === "bigint" ? v : BigInt(v)) / Number(SCALE)).toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function Row({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm" title={title}>
      <span className="text-fg-muted">{label}</span>
      <span className="tabular text-fg">{value}</span>
    </div>
  );
}

export function DexView({ account }: { account: string | null }) {
  const t = useTranslations("dex");
  const [side, setSide] = useState<DexSide>("USDC_XLM");
  const [text, setText] = useState("0.5");
  const [slippageBps, setSlippageBps] = useState(100);
  const amountIn = parseAmount(text);
  const { quote, loading, error } = useQuote({ side, amountIn, account, slippageBps });

  const sell = side === "USDC_XLM" ? "USDC" : "XLM";
  const buy = side === "USDC_XLM" ? "XLM" : "USDC";
  const impact = quote?.price.impactBps ?? 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel title={t("ticket")} hint={t("ticketHint")}>
        <div className="grid gap-4 px-5 py-4">
          <div className="flex rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label={t("sideAria")}>
            {(["USDC_XLM", "XLM_USDC"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={side === s}
                onClick={() => setSide(s)}
                className={cn(
                  "flex-1 rounded-[5px] px-3 py-1.5",
                  side === s ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {s === "USDC_XLM" ? "USDC → XLM" : "XLM → USDC"}
              </button>
            ))}
          </div>

          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("amount")}</span>
            <span className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputMode="decimal"
                className="tabular h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-3 font-mono text-base text-fg"
              />
              <span className="text-sm text-fg-muted">{sell}</span>
            </span>
          </label>

          <div className="flex justify-center">
            <ArrowDown className="size-4 text-fg-subtle" aria-hidden="true" />
          </div>

          <div className="rounded-md border border-line bg-bg-alt px-4 py-3">
            <p className="text-[11px] text-fg-subtle">{t("youGet")}</p>
            <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight">
              {quote ? `${usdc(quote.amountOut, 4)} ${buy}` : loading ? "…" : "—"}
            </p>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("slippage")}</span>
            <div className="flex gap-1.5">
              {SLIPPAGES.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  onClick={() => setSlippageBps(bps)}
                  className={cn(
                    "tabular rounded-md border px-2.5 py-1 text-xs",
                    slippageBps === bps ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-fg-muted hover:text-fg",
                  )}
                >
                  %{(bps / 100).toLocaleString("tr-TR")}
                </button>
              ))}
            </div>
          </div>

          {quote && (
            <dl className="grid gap-2 border-t border-line pt-3">
              <Row label={t("minOut")} value={`${usdc(quote.minOut, 4)} ${buy}`} />
              <Row label={t("execution")} value={price(quote.price.execution)} />
              <Row label={t("pool")} value={price(quote.price.pool)} />
              {quote.price.conservative && (
                <Row label={t("conservative")} value={price(quote.price.conservative)} title={t("conservativeTitle")} />
              )}
              <Row
                label={t("impact")}
                value={
                  <span className={cn(impact > 300 ? "text-danger" : impact > 100 ? "text-warning" : "text-fg")}>
                    %{(impact / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                  </span>
                }
              />
              <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">{t("minOutHint")}</p>
            </dl>
          )}
        </div>
      </Panel>

      <div className="grid content-start gap-4">
        <Panel title={t("verdictTitle")} hint={t("verdictHint")}>
          {!quote ? (
            <Empty>{error ? t("error") : loading ? t("loading") : t("empty")}</Empty>
          ) : !quote.policy.caps ? (
            <div className="flex items-start gap-2.5 px-5 py-4 text-sm text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              {t("noAccount")}
            </div>
          ) : (
            <div className="grid gap-4 px-5 py-4">
              <p
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium",
                  quote.policy.allowed ? "bg-success-bg text-success" : "bg-danger-bg text-danger",
                )}
              >
                {quote.policy.allowed ? (
                  <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleX className="size-4 shrink-0" aria-hidden="true" />
                )}
                {quote.policy.allowed ? t("allowed") : t("rejected")}
                {quote.policy.code && (
                  <span className="ms-auto rounded-sm bg-danger/20 px-1.5 py-px font-mono text-[11px]">{quote.policy.code}</span>
                )}
              </p>
              <p className="text-xs leading-relaxed text-fg-muted">
                {quote.policy.allowed ? t("allowedBody") : quote.policy.message}
              </p>

              <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
                {[
                  [t("capsCounted"), usdc(quote.policy.caps.counted)],
                  [t("capsTx"), usdc(quote.policy.caps.perTxCap)],
                  [t("capsRemaining"), usdc(quote.policy.caps.remainingToday)],
                  [t("capsDaily"), usdc(quote.policy.caps.dailyCap)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] text-fg-subtle">{label}</dt>
                    <dd className="mt-0.5 text-sm">{value} USDC</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-fg-subtle">{t("preview")}</p>
            </div>
          )}
        </Panel>

        {quote && (
          <>
            <Panel title={t("liquidity")} hint={t("liquidityHint")}>
              <p className="tabular px-5 py-3.5 font-mono text-xs text-fg-muted">
                {quote.liquidity.source} ·{" "}
                {t("reserves", {
                  usdc: usdc(quote.liquidity.reserveUsdc, 0),
                  xlm: usdc(quote.liquidity.reserveXlm, 0),
                  ledger: int(quote.liquidity.ledger),
                })}
              </p>
            </Panel>

            <Panel title={t("callTitle")} hint={t("callHint")}>
              <pre className="overflow-x-auto bg-bg px-5 py-4 font-mono text-[11.5px] leading-relaxed text-fg-muted">
                <code>
                  {`${quote.call.method}(
  amount_in:      ${quote.call.args.amount_in},
  amount_out_min: ${quote.call.args.amount_out_min},
  path:           [${sell}, ${buy}],
  to:             ${String(quote.call.args.to).slice(0, 10)}…,
)`}
                </code>
              </pre>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
