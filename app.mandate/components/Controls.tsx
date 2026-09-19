/**
 * Demo kontrolleri. Düğmeler GERÇEK işlem başlatır: ajan süreci backend'de
 * çalışır ve Stellar testnet'e işlem gönderir; dondurma sahibin anahtarıyla
 * zincirde yapılır.
 */
import { Eraser, Loader2, Play, ShieldAlert, Snowflake, Sun } from "lucide-react";
import { cn } from "./ui";

type Props = {
  disabled: boolean;
  agentRunning: boolean;
  scenario?: string;
  frozen: boolean | null;
  pending: string | null;
  error: string | null;
  onRun: (s: "trader" | "compromised") => void;
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
  const blocked = p.disabled || p.agentRunning;
  return (
    <section aria-label="Demo kontrolleri" className="rounded-lg border border-line bg-surface-1 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Btn
          tone="primary"
          onClick={() => p.onRun("trader")}
          disabled={blocked}
          busy={p.pending === "trader"}
          title="Ajan kanal açar, fiyat verisini saniye başı satın alır, DEX'te işlem yapar"
        >
          {p.pending !== "trader" && <Play className="size-4" aria-hidden="true" />}
          Ajanı başlat
        </Btn>
        <Btn
          onClick={() => p.onRun("compromised")}
          disabled={blocked}
          busy={p.pending === "compromised"}
          title="Anahtarı çalınmış ajan parayı kendi cüzdanına göndermeye çalışır"
        >
          {p.pending !== "compromised" && <ShieldAlert className="size-4" aria-hidden="true" />}
          Ele geçirilmiş ajan
        </Btn>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

        {p.frozen ? (
          <Btn onClick={() => p.onFreeze(false)} disabled={p.disabled} busy={p.pending === "unfreeze"}>
            {p.pending !== "unfreeze" && <Sun className="size-4" aria-hidden="true" />}
            Dondurmayı kaldır
          </Btn>
        ) : (
          <Btn
            tone="danger"
            onClick={() => p.onFreeze(true)}
            disabled={p.disabled || p.frozen === null}
            busy={p.pending === "freeze"}
            title="Sahip, hesabı zincirde dondurur; ajanın sonraki işlemi reddedilir"
          >
            {p.pending !== "freeze" && <Snowflake className="size-4" aria-hidden="true" />}
            Ajanı dondur
          </Btn>
        )}

        <Btn
          onClick={p.onClear}
          disabled={p.disabled || !p.canClear}
          title="Yeni tur için ekranı ve sayaçları sıfırlar. Veri silinmez; Defter'de ve 'tümünü göster' ile geri gelir"
        >
          <Eraser className="size-4" aria-hidden="true" />
          Ekranı temizle
        </Btn>

        <p className="ml-auto flex items-center gap-2 text-xs text-fg-muted" role="status">
          {p.agentRunning ? (
            <>
              <span className="pulse-dot size-2 rounded-full bg-success" aria-hidden="true" />
              Ajan çalışıyor{p.scenario === "compromised" ? " (ele geçirilmiş senaryo)" : ""} · işlemler testnet&apos;e gidiyor
            </>
          ) : (
            "Düğmeler gerçek işlem başlatır: Stellar testnet"
          )}
        </p>
      </div>

      {p.error && (
        <p className="mt-3 flex items-center justify-between gap-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {p.error}
          <button type="button" onClick={p.onDismiss} className="underline underline-offset-2">
            Kapat
          </button>
        </p>
      )}
    </section>
  );
}
