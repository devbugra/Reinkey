"use client";

/**
 * ÖRNEK HESABIN KONTROLLERİ.
 *
 * Yalnızca örnek hesapta görünür (bkz. Dashboard.tsx): kendi adresini bağlayan
 * birinin konsolunda senaryo düğmesi işi yoktur. Düğmeler GERÇEK işlem başlatır:
 * ajan süreci backend'de çalışır ve Stellar testnet'e işlem gönderir; dondurma
 * sahibin anahtarıyla zincirde yapılır.
 */
import { useTranslations } from "next-intl";
import { Eraser, Loader2, MessageSquareWarning, Play, ShieldAlert, Snowflake, Sun } from "lucide-react";
import type { Scenario } from "@/lib/types";
import { cn } from "./ui";

type Props = {
  disabled: boolean;
  agentRunning: boolean;
  scenario?: string;
  frozen: boolean | null;
  pending: string | null;
  error: string | null;
  onRun: (s: Scenario) => void;
  onFreeze: (frozen: boolean) => void;
  /** Ekranda temizlenecek bir şey var mı? */
  canClear: boolean;
  onClear: () => void;
  onDismiss: () => void;
};

function Btn({
  children,
  onClick,
  disabled,
  tone = "default",
  busy,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "default";
  busy?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        tone === "primary" && "bg-accent text-accent-contrast hover:opacity-90",
        tone === "danger" && "border border-danger/40 bg-danger-bg text-danger hover:bg-danger/20",
        tone === "default" && "border border-line-strong bg-surface-2 text-fg hover:bg-surface-3",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Controls(p: Props) {
  const t = useTranslations("controls");
  const tc = useTranslations("common");
  const blocked = p.disabled || p.agentRunning;
  const scenario =
    p.scenario === "compromised"
      ? t("scenarioCompromised")
      : p.scenario === "injected"
        ? t("scenarioInjected")
        : "";

  return (
    <section aria-label={t("aria")} className="rounded-lg border border-line bg-bg-alt/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="me-1 rounded-sm bg-surface-3 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted">
          {t("badge")}
        </span>
        <Btn tone="primary" onClick={() => p.onRun("trader")} disabled={blocked} busy={p.pending === "trader"} title={t("runTitle")}>
          {p.pending !== "trader" && <Play className="size-4" aria-hidden="true" />}
          {t("run")}
        </Btn>
        <Btn onClick={() => p.onRun("compromised")} disabled={blocked} busy={p.pending === "compromised"} title={t("compromisedTitle")}>
          {p.pending !== "compromised" && <ShieldAlert className="size-4" aria-hidden="true" />}
          {t("compromised")}
        </Btn>
        <Btn onClick={() => p.onRun("injected")} disabled={blocked} busy={p.pending === "injected"} title={t("injectedTitle")}>
          {p.pending !== "injected" && <MessageSquareWarning className="size-4" aria-hidden="true" />}
          {t("injected")}
        </Btn>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

        {p.frozen ? (
          <Btn onClick={() => p.onFreeze(false)} disabled={p.disabled} busy={p.pending === "unfreeze"}>
            {p.pending !== "unfreeze" && <Sun className="size-4" aria-hidden="true" />}
            {t("unfreeze")}
          </Btn>
        ) : (
          <Btn
            tone="danger"
            onClick={() => p.onFreeze(true)}
            disabled={p.disabled || p.frozen === null}
            busy={p.pending === "freeze"}
            title={t("freezeTitle")}
          >
            {p.pending !== "freeze" && <Snowflake className="size-4" aria-hidden="true" />}
            {t("freeze")}
          </Btn>
        )}

        <Btn onClick={p.onClear} disabled={p.disabled || !p.canClear} title={t("clearTitle")}>
          <Eraser className="size-4" aria-hidden="true" />
          {t("clear")}
        </Btn>

        <p className="ml-auto flex items-center gap-2 text-xs text-fg-muted" role="status">
          {p.agentRunning ? (
            <>
              <span className="pulse-dot size-2 rounded-full bg-success" aria-hidden="true" />
              {t("running", { scenario })}
            </>
          ) : (
            t("idle")
          )}
        </p>
      </div>

      {p.error && (
        <p className="mt-3 flex items-center justify-between gap-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {p.error}
          <button type="button" onClick={p.onDismiss} className="underline underline-offset-2">
            {tc("close")}
          </button>
        </p>
      )}
    </section>
  );
}
