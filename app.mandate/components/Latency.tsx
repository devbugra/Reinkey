/** Kupon doğrulama süresinin dağılımı: "X ms" iddiasının kanıtı. Son 500 ödeme. */
import { int, ms } from "@/lib/format";
import { percentile } from "@/lib/store";
import { Empty, Panel } from "./ui";

const BUCKETS = 14;
/** Klasik x402'de bir ödemenin zincirde kesinleşme süresi (BACKEND.md §8.4). */
const EXACT_MS = 5000;
/** Bundan yavaş doğrulama önbellekten gelmiş olamaz: kanal zincirden okunmuştur. */
const COLD_MS = 100;

export function Latency({ samples }: { samples: number[] }) {
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
    <Panel title="Ödeme onay süresi" hint={`Son ${int(samples.length)} kuponun doğrulanma süresi · zincire gitmeden`}>
      {samples.length === 0 ? (
        <Empty>Henüz ödeme yok.</Empty>
      ) : (
        <div className="grid gap-3 px-5 py-4">
          <dl className="tabular grid grid-cols-3 gap-x-4">
            {[
              ["Ortanca", p50],
              ["%95", p95],
              ["En yavaş", max],
            ].map(([label, v]) => (
              <div key={label}>
                <dt className="text-[11px] text-fg-subtle">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold">{ms(v as number)} ms</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="flex h-14 items-end gap-0.5" role="img" aria-label={`Onay süresi dağılımı: ortanca ${ms(p50)} ms, yüzde 95 ${ms(p95)} ms`}>
              {counts.map((c, i) => (
                <div
                  key={i}
                  title={`${ms(i * size)}–${i === BUCKETS - 1 ? "∞" : ms((i + 1) * size)} ms · ${int(c)} ödeme`}
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
              <span>{ms(top)} ms ve üstü (%5)</span>
            </div>
          </div>
          {cold > 0 && (
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              <span className="font-semibold text-fg-muted">{int(cold)} kupon</span> {int(COLD_MS)} ms&apos;den yavaş: bir kanalın ilk
              kuponunda kanal zincirden okunur, sonrakiler önbellekten doğrulanır.
            </p>
          )}
          {p50 > 0 && (
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              Klasik x402&apos;de her ödeme zincirde ≈ {int(EXACT_MS / 1000)} sn&apos;de kesinleşir: ortancaya göre{" "}
              <span className="font-semibold text-fg-muted">{int(Math.round(EXACT_MS / p50))} kat</span> yavaş.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
