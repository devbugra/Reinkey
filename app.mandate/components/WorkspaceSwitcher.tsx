"use client";

/**
 * ÇALIŞMA ALANI SEÇİCİ. Rayın tepesinde durur ve "şu an kimin verisine
 * bakıyorum" sorusunu cevaplar: demo mu, benim adresim mi. Liste açıkken
 * içeriği aşağı iter; kenar çubuğunda bu, üstte yüzen bir menüden daha az
 * kayboluyor ve dokunmatikte de sorunsuz.
 */
import { useState } from "react";
import { BookmarkPlus, Check, ChevronDown, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { ROLE_LABEL, type Profile } from "@/lib/workspace";
import { cn } from "./ui";

export function WorkspaceSwitcher({
  profiles,
  activeId,
  demoLabel,
  unsaved,
  onSelect,
  onDemo,
  onAdd,
  onRemove,
  onSave,
  wallet,
}: {
  profiles: Profile[];
  /** Etkin alanın kimliği; demo ya da kaydedilmemiş bir adres izleniyorsa null. */
  activeId: string | null;
  demoLabel: string;
  /** URL'den gelen, henüz kaydedilmemiş adres. */
  unsaved: { role: Profile["role"]; address: string } | null;
  onSelect: (p: Profile) => void;
  onDemo: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSave: (p: { role: Profile["role"]; address: string }) => void;
  /** Cüzdandan adres okuma; bağlıysa adres gösterilir. */
  wallet: { address: string | null; connecting: boolean; connect: () => void; disconnect: () => void };
}) {
  const [open, setOpen] = useState(false);
  const active = profiles.find((p) => p.id === activeId) ?? null;
  const title = active ? active.label : unsaved ? shortAddr(unsaved.address, 5, 5) : demoLabel;
  const subtitle = active
    ? `${ROLE_LABEL[active.role]} · ${shortAddr(active.address, 4, 4)}`
    : unsaved
      ? `${ROLE_LABEL[unsaved.role]} · kaydedilmedi`
      : "canlı testnet demosu";

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-start transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-fg">{title}</span>
          <span className="block truncate font-mono text-[10.5px] text-fg-subtle">{subtitle}</span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <ul className="grid gap-0.5 rounded-md border border-line bg-bg-alt p-1">
          {unsaved && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSave(unsaved);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-accent hover:bg-surface-2"
              >
                <BookmarkPlus className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">Bu adresi kaydet</span>
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDemo();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {!active && !unsaved && <Check className="size-3.5 text-accent" aria-hidden="true" />}
              <span className={cn("min-w-0 flex-1 truncate", !active && !unsaved && "text-fg")}>{demoLabel}</span>
            </button>
          </li>
          {profiles.map((p) => (
            <li key={p.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(p);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {p.id === activeId && <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">
                  {p.label}
                  <span className="ms-1.5 font-mono text-[10px] text-fg-subtle">{shortAddr(p.address, 3, 3)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`${p.label} adresini listeden çıkar`}
                title="Listeden çıkar (zincirdeki hiçbir şey silinmez)"
                className="grid size-6 shrink-0 place-items-center rounded-sm text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-accent hover:bg-surface-2"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Adres ekle
            </button>
          </li>
          <li className="border-t border-line pt-0.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (wallet.address) wallet.disconnect();
                else wallet.connect();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {wallet.connecting ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {wallet.address ? `Cüzdanı ayır (${shortAddr(wallet.address, 3, 3)})` : "Cüzdan bağla"}
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
