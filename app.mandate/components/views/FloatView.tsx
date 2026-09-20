"use client";

/**
 * Reinkey Float · kredi havuzu görünümü. Yatırımcı USDC yatırır, pay alır; ajanlar
 * havuzdan açılan hatla çalışır. Hesap havuza devredildiği için para politikanın
 * dışına çıkamaz ("kaçamayan sermaye"); teminat istenmez, sağlık zincirde hesaplanır.
 * Her sayı zincirden okunur; bu görünüm hiçbir işlem göndermez.
 */
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { clock, shortAddr, usdc } from "@/lib/format";
import { useSize } from "@/lib/hooks";
import type { FloatLine, FloatOverview, FloatSample } from "@/lib/types";
import { Empty, Panel, cn } from "../ui";

const SCALE = 10_000_000n;
const pct = (bps: number, digits = 2) => `${(bps / 100).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

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
        <p className="py-8 text-center text-sm text-fg-subtle">
          Geçmiş birikiyor: pay fiyatı dakikada bir örnekleniyor ({pts.length} örnek).
        </p>
      ) : (
        <>
          <svg width={width} height={H} role="img" aria-label={`Pay fiyatı geçmişi, ${pts.length} örnek, son değer ${last.v.toFixed(7)}`} className="block">
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
  if (line.healthBps === null) return <span className="text-xs text-fg-subtle">borç yok</span>;
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
        değer / borç <span className="font-semibold text-fg">{pct(line.healthBps, 1)}</span> · tasfiye eşiği {pct(line.liqThresholdBps, 0)}
      </p>
    </div>
  );
}

export function FloatView({ data, failed }: { data: FloatOverview | null; failed: boolean }) {
  if (!data) return <Panel title="Reinkey Float">{<Empty>{failed ? "Havuz okunamadı. Backend çalışıyor mu?" : "Havuz zincirden okunuyor…"}</Empty>}</Panel>;
  if (!data.enabled)
    return (
      <Panel title="Reinkey Float">
        <Empty>Bu facilitator bir kredi havuzuna bağlı değil (CREDIT_POOL_ID).</Empty>
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
          <p className="text-[11px] text-fg-subtle">Kredi havuzu (kontrat)</p>
          <p className="mt-0.5 font-mono text-sm">
            <span className="hidden md:inline">{pool.pool}</span>
            <span className="md:hidden">{shortAddr(pool.pool, 6, 6)}</span>
          </p>
        </div>
        <p className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          Salt okunur · her sayı zincirden · ledger {pool.ledger.toLocaleString("tr-TR")}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Havuz büyüklüğü" value={`${usdc(pool.totalAssets, 2)} USDC`} sub="Boşta duran + açık borç + XLM × fiyat" accent />
        <Kpi
          label="Pay fiyatı"
          value={usdc(pool.sharePrice, 5)}
          sub={`Başlangıçtan beri ${gainBps >= 0 ? "+" : ""}${pct(gainBps)} · kâr payı ${pct(pool.config.profitShareBps, 0)}`}
        />
        <Kpi label="Kullanım" value={pct(pool.utilizationBps, 1)} sub={`${usdc(pool.totalDebt, 2)} USDC açık borç · ${usdc(pool.idle, 2)} boşta`} />
        <Kpi
          label="Kredi hatları"
          value={`${openLines.length} açık`}
          sub={atRisk ? `${atRisk} hat tasfiye edilebilir` : `${lines.length} bilinen hat · riskte olan yok`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Kredi hatları" hint="Hesap havuza devredilmiştir: para politikanın dışına çıkamaz, bu yüzden teminat yok">
          {lines.length === 0 ? (
            <Empty>Bilinen kredi hattı yok (CREDIT_ACCOUNT_IDS).</Empty>
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
                      {!l.open ? "kapalı" : l.liquidatable ? "tasfiye edilebilir" : "sağlıklı"}
                    </span>
                    {l.liquidatable && <TriangleAlert className="size-4 text-danger" aria-hidden="true" />}
                    <span className="tabular ml-auto text-fg-muted">
                      borç <span className="font-semibold text-fg">{usdc(l.debt, 2)}</span> · değer{" "}
                      <span className="font-semibold text-fg">{usdc(l.value, 2)}</span> USDC
                    </span>
                  </p>
                  <HealthBar line={l} />
                  <p className="tabular text-[11px] text-fg-subtle">
                    hesapta {usdc(l.usdc, 2)} USDC + {usdc(l.xlm, 2)} XLM × {usdc(l.price, 5)}
                    {l.beneficiary && <> · kâr lehdarı {shortAddr(l.beneficiary, 4, 4)}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Pay fiyatı" hint="Kârla kapanan her hat pay fiyatını yükseltir; tasfiye zararı düşürür">
            <SharePriceChart samples={history} />
          </Panel>

          <Panel title="Yatırımcılar" hint="Pay × pay fiyatı = bugünkü USDC karşılığı">
            {positions.length === 0 ? (
              <Empty>Gösterilecek yatırımcı yok (FLOAT_INVESTORS).</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {positions.map((p) => (
                  <li key={p.address} className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="font-mono text-xs">{shortAddr(p.address, 5, 5)}</span>
                    <span className="text-xs text-fg-muted">havuzun {pct(p.shareOfPoolBps, 1)}&apos;i</span>
                    <span className="ml-auto">
                      <span className="font-semibold">{usdc(p.value, 2)} USDC</span>{" "}
                      <span className="text-xs text-fg-subtle">· {usdc(p.shares, 2)} pay</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <p className="rounded-lg border border-line bg-bg-alt px-5 py-3 text-xs leading-relaxed text-fg-muted">
        <span className="font-semibold text-fg">Fiyat ihtiyatlıdır:</span> oracle (Reflector) ile DEX havuz fiyatından düşük olanı kullanılır; DEX fiyatı
        şişirilerek hesap sağlıklı gösterilemez. Şu an 1 XLM = {usdc(pool.price, 5)} USDC. Değer borcun {pct(pool.config.liqThresholdBps, 0)}&apos;inin altına
        düşerse herkes tasfiyeyi tetikleyebilir: hesap dondurulur, kalan fon havuza döner.
      </p>
    </>
  );
}
