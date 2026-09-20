"use client";

/** Hangi adrese bakıldığını gösteren ve değiştiren çubuk. Boş bırakılırsa örnek adrese dönülür. */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Undo2 } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { isAddress } from "@/lib/useView";
import { cn } from "./ui";

export function Identity({
  label,
  value,
  isExample,
  placeholder,
  onChange,
}: {
  label: string;
  /** Şu an gösterilen adres (örnek ya da kullanıcının girdiği). */
  value: string | null;
  isExample: boolean;
  placeholder: string;
  onChange: (address: string | null) => void;
}) {
  const t = useTranslations("identity");
  const tc = useTranslations("common");
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 card rounded-lg px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[11px] text-fg-subtle">{label}</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-sm">
          <span className="hidden sm:inline">{value ?? "—"}</span>
          <span className="sm:hidden">{shortAddr(value ?? undefined, 6, 6)}</span>
          {isExample && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 font-sans text-[11px] text-fg-muted">{t("example")}</span>
          )}
        </p>
      </div>

      <form
        className="ml-auto flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim().toUpperCase();
          if (!isAddress(v)) return setInvalid(true);
          setInvalid(false);
          setDraft("");
          onChange(v);
        }}
      >
        <label className="relative">
          <span className="sr-only">{placeholder}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            placeholder={placeholder}
            spellCheck={false}
            aria-invalid={invalid}
            className={cn(
              "h-9 w-64 rounded-md border bg-bg pl-8 pr-3 font-mono text-xs text-fg placeholder:font-sans placeholder:text-fg-subtle",
              invalid ? "border-danger" : "border-line-strong",
            )}
          />
        </label>
        <button type="submit" className="h-9 rounded-md border border-line-strong bg-surface-2 px-3 text-xs font-medium hover:bg-surface-3">
          {tc("show")}
        </button>
        {!isExample && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted hover:text-fg"
          >
            <Undo2 className="size-3.5" aria-hidden="true" /> {t("back")}
          </button>
        )}
      </form>
      {invalid && (
        <p className="w-full text-xs text-danger" role="alert">
          {t("invalid")}
        </p>
      )}
    </section>
  );
}
