import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "İlerleme"}
      >
        {/* Tamamlananda aksan rengi, öncesinde nötr: renk yalnızca durum bildirir. */}
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            v === 100 ? "bg-accent" : "bg-fg",
          )}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-10 text-end text-xs tabular-nums text-fg-muted">
        %{v}
      </span>
    </div>
  );
}
