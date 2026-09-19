"use client";

/**
 * Ajanın satın aldığı fiyat verisi: borsanın ajana sattığı her tik'in kopyası
 * (SSE `ticker.tick`). Üstünde ajanın DEX işlemleri işaretlenir; "veriyi alıp o
 * veriyle işlem yapıyor" anlatısının görünen hâli. Üretilmiş nokta yoktur.
 */
import { useState } from "react";
import { clock, int } from "@/lib/format";
import { useSize } from "@/lib/hooks";
import type { SwapView, Tick } from "@/lib/store";
import { Empty, Panel } from "./ui";

const MIN_H = 220;
const M = { top: 16, right: 62, bottom: 24, left: 10 };
const WINDOW_MS = 180_000;
/** Tik'ler arası bundan uzun boşluk ayrı bir akış demektir; çizgi birleştirilmez. */
const GAP_MS = 5_000;

const price = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 });

export function Price({ ticks, swaps, streaming }: { ticks: Tick[]; swaps: SwapView[]; streaming: boolean }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  // Panel, yanındaki sütunun boyuna uzar; grafik o alanı doldurur.
  const H = Math.max(height, MIN_H);
  const [hover, setHover] = useState<number | null>(null);

  const last = ticks[ticks.length - 1];
  const t1 = last?.t ?? 0;
  const visible = ticks.filter((k) => k.t >= t1 - WINDOW_MS);
  const t0 = visible[0]?.t ?? 0;

  const lo = Math.min(...visible.map((k) => k.price));
  const hi = Math.max(...visible.map((k) => k.price));
  // Testnet havuzunda fiyat uzun süre sabit kalabilir; düz çizgi ortada dursun.
  const pad = hi > lo ? (hi - lo) * 0.25 : hi * 0.001;
  const y0 = lo - pad;
  const y1 = hi + pad;

  const iw = Math.max(width - M.left - M.right, 1);
  const ih = H - M.top - M.bottom;
  const x = (t: number) => M.left + (t1 > t0 ? ((t - t0) / (t1 - t0)) * iw : iw);
  const y = (p: number) => M.top + (1 - (p - y0) / (y1 - y0)) * ih;

  const path = visible
    .map((k, i) => `${i === 0 || k.t - visible[i - 1].t > GAP_MS ? "M" : "L"}${x(k.t).toFixed(1)},${y(k.price).toFixed(1)}`)
    .join("");

  const nearest = (t: number) =>
    visible.reduce((best, k) => (Math.abs(k.t - t) < Math.abs(best.t - t) ? k : best), visible[0]);

  const marks = swaps
    .map((s) => ({ s, t: Date.parse(s.ts) }))
    .filter((m) => visible.length > 0 && m.t >= t0 && m.t <= t1 + GAP_MS)
    .map((m) => ({ ...m, at: nearest(m.t) }));

  const gridValues = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y0 + (y1 - y0) * 0.85];
  const hovered = hover !== null && visible.length > 0 ? nearest(t0 + ((hover - M.left) / iw) * (t1 - t0)) : null;

  return (
    <Panel
      className="h-full"
      title="Ajanın satın aldığı veri · XLM/USDC"
      hint="Borsanın ajana saniye başı sattığı fiyat akışının aynısı · kaynak: Soroswap havuzu"
      action={
        last ? (
          <p className="tabular shrink-0 text-right">
            <span className="block text-lg font-semibold leading-tight">{price(last.price)}</span>
            <span className="block text-[11px] text-fg-subtle">
              {streaming ? "canlı · " : ""}
              {int(ticks.length)} sn veri teslim edildi
            </span>
          </p>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        <div ref={ref} className="relative min-h-[220px] flex-1">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty>Ajan fiyat akışına bağlanınca satın aldığı veri burada saniye saniye görünür.</Empty>
            </div>
          ) : (
            width > 0 && (
              <>
                <svg
                  width={width}
                  height={H}
                  role="img"
                  aria-label={`XLM/USDC fiyatı, son ${int(visible.length)} saniye. Son fiyat ${price(last.price)}. ${int(marks.length)} DEX işlemi işaretli.`}
                  onPointerMove={(e) => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
                  onPointerLeave={() => setHover(null)}
                  className="absolute inset-0 block touch-none"
                >
                  {gridValues.map((v) => (
                    <g key={v}>
                      <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                      <text x={M.left + iw + 8} y={y(v) + 3.5} fontSize={10.5} fill="var(--fg-subtle)" className="tabular font-mono">
                        {price(v)}
                      </text>
                    </g>
                  ))}
                  <text x={M.left} y={H - 7} fontSize={10.5} fill="var(--fg-subtle)" className="tabular font-mono">
                    {clock(new Date(t0).toISOString())}
                  </text>
                  <text x={M.left + iw} y={H - 7} fontSize={10.5} textAnchor="end" fill="var(--fg-subtle)" className="tabular font-mono">
                    {clock(new Date(t1).toISOString())}
                  </text>

                  <path d={path} fill="none" stroke="var(--brand-sky)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

                  {marks.map(({ s, at }) => (
                    <g key={s.key}>
                      <line x1={x(at.t)} x2={x(at.t)} y1={M.top} y2={M.top + ih} stroke="var(--brand-lavender)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                      <circle cx={x(at.t)} cy={y(at.price)} r={5} fill="var(--brand-lavender)" stroke="var(--surface)" strokeWidth={2} />
                      <text x={x(at.t)} y={M.top - 4} fontSize={10.5} textAnchor="middle" fill="var(--fg-muted)">
                        alım
                      </text>
                    </g>
                  ))}

                  <circle
                    cx={x(last.t)}
                    cy={y(last.price)}
                    r={4}
                    fill="var(--brand-sky)"
                    stroke="var(--surface)"
                    strokeWidth={2}
                    className={streaming ? "pulse-dot" : undefined}
                  />

                  {hovered && (
                    <g pointerEvents="none">
                      <line x1={x(hovered.t)} x2={x(hovered.t)} y1={M.top} y2={M.top + ih} stroke="var(--line-strong)" strokeWidth={1} />
                      <circle cx={x(hovered.t)} cy={y(hovered.price)} r={4.5} fill="var(--fg)" stroke="var(--surface)" strokeWidth={2} />
                    </g>
                  )}
                </svg>

                {hovered && (
                  <div
                    className="tabular pointer-events-none absolute top-2 z-10 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-[11px] shadow-lg"
                    style={x(hovered.t) > width / 2 ? { right: width - x(hovered.t) + 12 } : { left: x(hovered.t) + 12 }}
                  >
                    <p className="font-mono text-fg-subtle">{clock(new Date(hovered.t).toISOString())}</p>
                    <p className="mt-1 text-sm font-semibold text-fg">{price(hovered.price)} USDC</p>
                    <p className="mt-0.5 text-fg-muted">
                      alış {price(hovered.bid)} · satış {price(hovered.ask)}
                    </p>
                    <p className="text-fg-subtle">ledger {int(hovered.ledger)}</p>
                  </div>
                )}
              </>
            )
          )}
        </div>

        {visible.length > 0 && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-2.5 text-[11px] text-fg-muted">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-brand-sky" aria-hidden="true" /> 1 XLM fiyatı (havuz orta fiyatı)
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-brand-lavender" aria-hidden="true" /> ajanın DEX işlemi
            </li>
            <li className="ml-auto text-fg-subtle">her nokta = ödenmiş 1 saniye</li>
          </ul>
        )}
      </div>
    </Panel>
  );
}
