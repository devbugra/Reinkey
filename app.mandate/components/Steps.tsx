/**
 * Demo senaryosunun adımları (proje-tanimi.md §10). Hiçbir adım elle
 * işaretlenmez: hepsi akıştan gelen gerçek olaylardan türetilir.
 */
import { Check } from "lucide-react";
import { int } from "@/lib/format";
import type { State } from "@/lib/store";
import { cn } from "./ui";

type Step = { title: string; detail: string; done: boolean; live?: boolean; tone?: "danger" };

function derive(s: State): Step[] {
  const channels = Object.values(s.channels);
  const streams = Object.values(s.streams).filter((st) => st.unit === "second");
  const streaming = streams.some((st) => !st.ended);
  const chainRejections = s.rejections.filter((r) => r.source === "chain").length;
  const exhausted =
    s.rejections.some((r) => r.code === "CHANNEL_EXHAUSTED") || streams.some((st) => st.ended === "CHANNEL_EXHAUSTED");

  return [
    {
      title: "Yetki",
      detail: s.account ? (s.account.frozen ? "hesap donduruldu" : "sınırlar zincirde") : "hesap okunuyor",
      done: Boolean(s.account),
      tone: s.account?.frozen ? "danger" : undefined,
    },
    {
      title: "Kanal",
      detail: channels.length ? `${int(channels.length)} kanal açıldı` : "depozito kilitlenir",
      done: channels.length > 0,
    },
    {
      title: "Saniye başı veri",
      detail: s.local.dataSeconds ? `${int(s.local.dataSeconds)} sn satın alındı` : "fiyat akışı",
      done: streams.length > 0 || s.local.dataSeconds > 0,
      live: streaming,
    },
    {
      title: "Alım-satım",
      detail: s.swaps.length ? `${int(s.swaps.length)} DEX işlemi` : "sınırlar içinde",
      done: s.swaps.length > 0,
    },
    {
      title: "Zincirden red",
      detail: chainRejections ? `${int(chainRejections)} işlem engellendi` : "sınır aşılırsa",
      done: chainRejections > 0,
      tone: "danger",
    },
    {
      title: "Kesinti",
      detail: exhausted ? "depozito bitti, akış kesildi" : "depozito bitince",
      done: exhausted,
      tone: "danger",
    },
    {
      title: "Tahsilat",
      detail: s.claims.length ? `${int(s.claims.length)} zincir işlemi` : "tek işlemle",
      done: s.claims.length > 0,
    },
  ];
}

/**
 * Yedi kutu değil, tek bir hat: ray üzerinde yedi istasyon. Gerçekleşen adım dolar
 * (yeşil; red ve kesinti kırmızı), süren adım yanıp söner, bekleyen boş kalır.
 * Dar ekranda hat çizilmez, istasyonlar iki sütuna dizilir.
 */
export function Steps({ state }: { state: State }) {
  const steps = derive(state);
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="card rounded-lg px-5 py-4">
      <p className="mb-4 flex items-baseline justify-between gap-3 text-xs text-fg-subtle">
        <span>Senaryo · olaylardan türetilir, elle işaretlenmez</span>
        <span className="tabular font-mono">
          {done}/{steps.length}
        </span>
      </p>
      <ol aria-label="Senaryo adımları" className="track grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 xl:grid-cols-7 xl:gap-x-2">
        {steps.map((st, i) => {
          const danger = st.done && st.tone === "danger";
          return (
            <li key={st.title} className="relative flex items-start gap-2.5 xl:flex-col xl:items-center xl:gap-2 xl:text-center">
              <span
                className={cn(
                  "tabular relative z-[1] grid size-[1.375rem] shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                  !st.done && "border-line-strong bg-bg text-fg-subtle",
                  st.done && !danger && "border-success bg-success text-bg",
                  danger && "border-danger bg-danger text-bg",
                  st.live && "pulse-dot",
                )}
                aria-hidden="true"
              >
                {st.done && !st.live ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-xs font-semibold", st.done ? "text-fg" : "text-fg-muted")}>
                  {st.title}
                  <span className="sr-only">{st.done ? " (gerçekleşti)" : " (bekliyor)"}</span>
                </span>
                <span className="block text-[11px] leading-snug text-fg-subtle">{st.live ? "şu anda akıyor" : st.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
