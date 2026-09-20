"use client";

/** Panelin küçük yapı taşları. */
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import type { Source } from "@/lib/types";
import { txUrl, shortHash } from "@/lib/format";

export const cn = clsx;

export function Panel({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "card flex min-w-0 flex-col rounded-lg",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 truncate text-xs text-fg-subtle">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const SOURCE_STYLE: Record<Source, string> = {
  chain: "border-brand-lavender/40 text-brand-lavender",
  facilitator: "border-brand-sky/40 text-brand-sky",
  gateway: "border-line-strong text-fg-muted",
};

export function SourceTag({ source }: { source: Source }) {
  const t = useTranslations("sources");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-px font-mono text-[10px] uppercase tracking-wider",
        SOURCE_STYLE[source],
      )}
    >
      {t(source)}
    </span>
  );
}

export function Code({ code, tone = "danger" }: { code: string; tone?: "danger" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1.5 py-px font-mono text-[11px] font-medium",
        tone === "danger" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
      )}
    >
      {code}
    </span>
  );
}

export function TxLink({ hash, className }: { hash: string | null | undefined; className?: string }) {
  const t = useTranslations("ui");
  if (!hash) return null;
  const url = txUrl(hash);
  const label = shortHash(hash);
  const cls = cn("font-mono text-[11px] text-fg-subtle", className);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(cls, "underline decoration-line-strong underline-offset-2 hover:text-accent")}
      title={t("txLink")}
    >
      tx {label}
    </a>
  ) : (
    <span className={cls}>tx {label}</span>
  );
}

/**
 * SAYFA BAŞLIĞI. Her görünüm bununla açılır: hangi ürün, burada ne görülür,
 * neye bakılıyor (bağlam) ve ne yapılabilir (eylemler). "Neredeyim" sorusunun cevabı.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** Sağ taraf: bağlam ve eylemler. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-2">
      <div className="min-w-0 max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{lead}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/**
 * BÖLÜM. Sayfa içindeki numaralı istasyon: kenar çubuğundaki rayın devamı. Numara
 * sırayı, başlık konuyu, ipucu o bölümde neye bakılacağını söyler.
 */
export function Section({
  index,
  title,
  hint,
  action,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="station" data-on="true" aria-hidden="true" />
        <span className="tabular font-mono text-[11px] text-fg-subtle">{String(index).padStart(2, "0")}</span>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
        <span className="h-px min-w-8 flex-1 bg-line" aria-hidden="true" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-fg-subtle">{children}</p>;
}

/** Üç bölmeli çubuk: tahsil edilen | kabul edilmiş ama tahsil edilmemiş | kalan. */
export function DepositBar({
  claimed,
  pending,
  className,
}: {
  claimed: number;
  pending: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="presentation"
    >
      <div className="h-full bg-brand-lavender transition-[width] duration-300" style={{ width: `${claimed * 100}%` }} />
      <div className="h-full bg-brand-sky transition-[width] duration-150" style={{ width: `${pending * 100}%` }} />
    </div>
  );
}
