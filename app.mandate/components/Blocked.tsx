"use client";

/** Zincirin ve facilitator'ın engellediği işlemler: sınırın nerede uygulandığını gösterir. */
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { describeCode } from "@/lib/codes";
import { clock } from "@/lib/format";
import type { RejectionView } from "@/lib/store";
import { Code, Panel, SourceTag, TxLink, cn } from "./ui";

export function Blocked({ items }: { items: RejectionView[] }) {
  const t = useTranslations("blocked");
  const chain = items.filter((r) => r.source === "chain").length;
  return (
    <Panel title={t("title")} hint={chain > 0 ? t("hintChain", { count: chain }) : t("hint")}>
      {items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-fg-subtle">
          <ShieldCheck className="size-4" aria-hidden="true" /> {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-line" aria-live="polite">
          {items.slice(0, 6).map((r, i) => (
            <li
              key={r.key}
              className={cn("row-in grid gap-1.5 px-5 py-3", r.source === "chain" && "bg-danger-bg/40", i === 0 && r.source === "chain" && "flash-danger")}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-fg">
                {describeCode(r.code)}
                <span className="tabular ml-auto text-[11px] font-normal text-fg-subtle">{clock(r.ts)}</span>
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <Code code={r.code} />
                <SourceTag source={r.source} />
                <TxLink hash={r.tx} className="ml-auto" />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
