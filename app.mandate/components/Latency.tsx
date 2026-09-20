"use client";

/** Kupon doğrulama süresinin dağılımı. Son 500 ödeme. */
import { useTranslations } from "next-intl";
import { int, ms } from "@/lib/format";
import { percentile } from "@/lib/store";
import { Empty, Panel } from "./ui";

const BUCKETS = 14;
/** Bir ödemenin zincirde kesinleşme süresi (BACKEND.md §8.4). */
const CHAIN_MS = 5000;
/** Bundan yavaş doğrulama önbellekten gelmiş olamaz: kanal zincirden okunmuştur. */
const COLD_MS = 100;

export function Latency({ samples }: { samples: number[] }) {
  const t = useTranslations("latency");
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = samples.length ? Math.max(...samples) : 0;

  // Ölçek %95'te kesilir; üstü son kovada toplanır. Uç değerler gerçek ama nadirdir:
  // bir kanalın İLK kuponunda facilitator kanalı zincirden okur (RPC, yüzlerce ms),
  // sonrakiler önbellekten doğrulanır. Ölçüm bu okumayı da içerir, gizlenmez.
  const top = Math.max(p95, 0.1);
  const cold = samples.filter((v) => v >= COLD_MS).length;
  const size = top / (BUCKETS - 1);
  const counts = Array.from({ length: BUCKETS }, () => 0);
  for (const v of samples) counts[Math.min(BUCKETS - 1, Math.floor(v / size))]++;
  const peak = Math.max(...counts, 1);

  return (
    <Panel title={t("title")} hint={t("hint", { count: samples.length })}>
      {samples.length === 0 ? (
        <Empty>{t("empty")}</Empty>
      ) : (
        <div className="grid gap-3 px-5 py-4">
          <dl className="tabular grid grid-cols-3 gap-x-4">
            {([
              [t("median"), p50],
              [t("p95"), p95],
              [t("slowest"), max],
            ] as const).map(([label, v]) => (
              <div key={label}>
                <dt className="text-[11px] text-fg-subtle">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold">{ms(v)} ms</dd>
              </div>
            ))}
          </dl>
          <div>
            <div
              className="flex h-14 items-end gap-0.5"
              role="img"
              aria-label={t("chartAria", { median: ms(p50), p95: ms(p95) })}
            >
              {counts.map((c, i) => (
                <div
                  key={i}
                  title={t("bucket", { from: ms(i * size), to: i === BUCKETS - 1 ? "∞" : ms((i + 1) * size), count: c })}
                  className="flex h-full flex-1 items-end"
                >
                  <div
                    className="w-full rounded-t-[4px] bg-brand-sky transition-[height] duration-300"
                    style={{ height: c ? `${Math.max((c / peak) * 100, 6)}%` : 0 }}
                  />
                </div>
              ))}
            </div>
            <div className="tabular mt-1 flex justify-between border-t border-line pt-1 font-mono text-[10.5px] text-fg-subtle">
              <span>0 ms</span>
              <span>{t("axisTop", { value: ms(top) })}</span>
            </div>
          </div>
          {cold > 0 && (
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              {t.rich("cold", {
                b: (c) => <span className="font-semibold text-fg-muted">{c}</span>,
                count: cold,
                threshold: int(COLD_MS),
              })}
            </p>
          )}
          {p50 > 0 && (
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              {t.rich("compare", {
                b: (c) => <span className="font-semibold text-fg-muted">{c}</span>,
                seconds: int(CHAIN_MS / 1000),
                median: ms(p50),
              })}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
