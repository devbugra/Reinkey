"use client";

/** Hangi adrese bakıldığını gösteren ve değiştiren çubuk. Boş bırakılırsa demo adresine dönülür. */
import { useState } from "react";
import { Search, Undo2 } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { isAddress } from "@/lib/useView";
import { cn } from "./ui";

export function Identity({
  label,
  value,
  isDemo,
  placeholder,
  onChange,
}: {
  label: string;
  /** Şu an gösterilen adres (demo ya da kullanıcının girdiği). */
  value: string | null;
  isDemo: boolean;
  placeholder: string;
  onChange: (address: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface-1 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[11px] text-fg-subtle">{label}</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-sm">
          <span className="hidden sm:inline">{value ?? "—"}</span>
          <span className="sm:hidden">{shortAddr(value ?? undefined, 6, 6)}</span>
          {isDemo && <span className="rounded-full bg-surface-3 px-2 py-0.5 font-sans text-[11px] text-fg-muted">demo</span>}
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
          Göster
        </button>
        {!isDemo && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted hover:text-fg"
          >
            <Undo2 className="size-3.5" aria-hidden="true" /> Demoya dön
          </button>
        )}
      </form>
      {invalid && (
        <p className="w-full text-xs text-danger" role="alert">
          Geçerli bir Stellar adresi girin: G… ya da C… ile başlayan 56 karakter.
        </p>
      )}
    </section>
  );
}
