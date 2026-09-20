"use client";

/**
 * Örnek hesabın akışı. Hiçbir adım elle işaretlenmez: hepsi akıştan gelen
 * gerçek olaylardan türetilir. Yalnızca örnek hesapta gösterilir.
 */
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { State } from "@/lib/store";
import { cn } from "./ui";

type Step = { key: string; title: string; detail: string; done: boolean; live?: boolean; tone?: "danger" };

function derive(s: State, t: ReturnType<typeof useTranslations<"steps">>): Step[] {
  const channels = Object.values(s.channels);
  const streams = Object.values(s.streams).filter((st) => st.unit === "second");
  const streaming = streams.some((st) => !st.ended);
  const chainRejections = s.rejections.filter((r) => r.source === "chain").length;
  const exhausted =
    s.rejections.some((r) => r.code === "CHANNEL_EXHAUSTED") || streams.some((st) => st.ended === "CHANNEL_EXHAUSTED");

  return [
    {
      key: "authority",
      title: t("authority"),
      detail: s.account ? (s.account.frozen ? t("authorityFrozen") : t("authorityOn")) : t("authorityIdle"),
      done: Boolean(s.account),
      tone: s.account?.frozen ? "danger" : undefined,
    },
    {
      key: "channel",
      title: t("channel"),
      detail: channels.length ? t("channelDone", { count: channels.length }) : t("channelIdle"),
      done: channels.length > 0,
    },
    {
      key: "data",
      title: t("data"),
      detail: s.local.dataSeconds ? t("dataDone", { count: s.local.dataSeconds }) : t("dataIdle"),
      done: streams.length > 0 || s.local.dataSeconds > 0,
      live: streaming,
    },
    {
      key: "trade",
      title: t("trade"),
      detail: s.swaps.length ? t("tradeDone", { count: s.swaps.length }) : t("tradeIdle"),
      done: s.swaps.length > 0,
    },
    {
      key: "reject",
      title: t("reject"),
      detail: chainRejections ? t("rejectDone", { count: chainRejections }) : t("rejectIdle"),
      done: chainRejections > 0,
      tone: "danger",
    },
    {
      key: "cut",
      title: t("cut"),
      detail: exhausted ? t("cutDone") : t("cutIdle"),
      done: exhausted,
      tone: "danger",
    },
    {
      key: "claim",
      title: t("claim"),
      detail: s.claims.length ? t("claimDone", { count: s.claims.length }) : t("claimIdle"),
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
  const t = useTranslations("steps");
  const steps = derive(state, t);
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="card rounded-lg px-5 py-4">
      <p className="mb-4 flex items-baseline justify-between gap-3 text-xs text-fg-subtle">
        <span>{t("header")}</span>
        <span className="tabular font-mono">
          {done}/{steps.length}
        </span>
      </p>
      <ol aria-label={t("aria")} className="track grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 xl:grid-cols-7 xl:gap-x-2">
        {steps.map((st, i) => {
          const danger = st.done && st.tone === "danger";
          return (
            <li key={st.key} className="relative flex items-start gap-2.5 xl:flex-col xl:items-center xl:gap-2 xl:text-center">
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
                  <span className="sr-only">{st.done ? t("done") : t("pending")}</span>
                </span>
                <span className="block text-[11px] leading-snug text-fg-subtle">{st.live ? t("streaming") : st.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
