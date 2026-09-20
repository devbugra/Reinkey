"use client";

/**
 * KARŞILAMA — konsola ilk kez giren biri ne görmeli?
 *
 * Konsol bir adres izleyicisidir: önce rol sorulur (satıcıyım / ajan sahibiyim /
 * sermaye), sonra tek şey istenir: bir adres. Kayıt, parola, API anahtarı yok;
 * adres tarayıcıda saklanır.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Gauge, KeyRound, Landmark, Loader2, Play, Wallet } from "lucide-react";
import { env } from "@/lib/env";
import { isAddress } from "@/lib/useView";
import type { Role } from "@/lib/workspace";
import { cn } from "./ui";

const ROLES: { role: Role | "float"; icon: React.ReactNode }[] = [
  { role: "seller", icon: <Gauge className="size-5" aria-hidden="true" /> },
  { role: "agent", icon: <KeyRound className="size-5" aria-hidden="true" /> },
  { role: "float", icon: <Landmark className="size-5" aria-hidden="true" /> },
];

export function Onboarding({
  onPick,
  onExample,
  onFloat,
  wallet,
}: {
  onPick: (role: Role, address: string) => void;
  onExample: () => void;
  onFloat: () => void;
  /** Cüzdan bağlayınca adres yazmaya gerek kalmaz. */
  wallet: { address: string | null; connecting: boolean; error: string | null; connect: () => Promise<string | null> };
}) {
  const t = useTranslations("onboarding");
  const tw = useTranslations("workspace");
  const [open, setOpen] = useState<Role | null>(null);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 py-6">
      <header className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2rem]">{t("title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{t("lead")}</p>
      </header>

      <ul className="grid gap-4 lg:grid-cols-3">
        {ROLES.map((r) => {
          const isOpen = r.role !== "float" && open === r.role;
          const ns = r.role as "seller" | "agent" | "float";
          return (
            <li key={r.role}>
              <div className={cn("card flex h-full flex-col rounded-lg p-5 transition-colors", isOpen && "border-accent/50")}>
                <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2 text-accent">{r.icon}</span>
                <h2 className="mt-4 text-base font-semibold">{t(`${ns}.title`)}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{t(`${ns}.body`)}</p>

                {r.role === "float" ? (
                  <button
                    type="button"
                    onClick={onFloat}
                    className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
                  >
                    {t("float.cta")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                ) : isOpen ? (
                  <form
                    className="mt-5 grid gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = draft.trim().toUpperCase();
                      if (!isAddress(v)) return setInvalid(true);
                      onPick(r.role as Role, v);
                    }}
                  >
                    <label className="grid gap-1.5">
                      <span className="sr-only">{t(`${ns}.placeholder`)}</span>
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setInvalid(false);
                        }}
                        placeholder={t(`${ns}.placeholder`)}
                        spellCheck={false}
                        aria-invalid={invalid}
                        className={cn(
                          "h-9 w-full rounded-md border bg-bg px-3 font-mono text-xs text-fg placeholder:font-sans placeholder:text-fg-subtle",
                          invalid ? "border-danger" : "border-line-strong",
                        )}
                      />
                    </label>
                    <p className={cn("text-[11px] leading-snug", invalid ? "text-danger" : "text-fg-subtle")}>
                      {invalid ? t("invalid") : t(`${ns}.hint`)}
                    </p>
                    <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-contrast hover:opacity-90">
                      {t("open")}
                    </button>
                    {r.role === "seller" && (
                      <>
                        <span className="my-0.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-fg-subtle">
                          <span className="h-px flex-1 bg-line" aria-hidden="true" /> {t("or")}{" "}
                          <span className="h-px flex-1 bg-line" aria-hidden="true" />
                        </span>
                        <button
                          type="button"
                          disabled={wallet.connecting}
                          onClick={() => {
                            void wallet.connect().then((addr) => addr && onPick("seller", addr));
                          }}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3 disabled:opacity-50"
                        >
                          {wallet.connecting ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Wallet className="size-4" aria-hidden="true" />
                          )}
                          {t("connectWallet")}
                        </button>
                        <p className="text-[11px] leading-snug text-fg-subtle">{t("walletHint")}</p>
                        {wallet.error && (
                          <p className="text-[11px] text-danger" role="alert">
                            {wallet.error}
                          </p>
                        )}
                      </>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(r.role as Role);
                      setDraft("");
                      setInvalid(false);
                    }}
                    className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
                  >
                    {t("connectAs", { role: tw(r.role === "agent" ? "roleAgent" : "roleSeller") })}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-bg-alt/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("exampleTitle")}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{t("exampleBody")}</p>
        </div>
        <button
          type="button"
          onClick={onExample}
          className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast hover:opacity-90"
        >
          <Play className="size-4" aria-hidden="true" />
          {t("exampleCta")}
        </button>
      </div>

      <p className="text-xs text-fg-subtle">
        {t("noAccount")}{" "}
        <a href={`${env.marketingUrl}/docs/reins/quickstart`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {t("reinsQuickstart")}
        </a>{" "}
        · {t("sellNote")}{" "}
        <a href={`${env.marketingUrl}/docs/meter/quickstart`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {t("meterQuickstart")}
        </a>
      </p>
    </div>
  );
}
