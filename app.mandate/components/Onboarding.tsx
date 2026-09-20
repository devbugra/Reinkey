"use client";

/**
 * KARŞILAMA — konsola ilk kez giren biri ne görmeli?
 *
 * Önceki hâlinde konsol doğrudan BİZİM demo hesabımızı gösteriyordu: gelen kişi
 * kendi verisini nasıl bağlayacağını bilmiyordu. Burada önce rol sorulur
 * (satıcıyım / ajan sahibiyim / sermaye), sonra tek şey istenir: bir adres.
 * Kayıt, parola, API anahtarı yok; adres tarayıcıda saklanır.
 */
import { useState } from "react";
import { ArrowRight, Gauge, KeyRound, Landmark, Loader2, Play, Wallet } from "lucide-react";
import { env } from "@/lib/env";
import { isAddress } from "@/lib/useView";
import { ROLE_LABEL, type Role } from "@/lib/workspace";
import { cn } from "./ui";

const ROLES: {
  role: Role | "float";
  icon: React.ReactNode;
  title: string;
  body: string;
  placeholder: string;
  hint: string;
}[] = [
  {
    role: "seller",
    icon: <Gauge className="size-5" aria-hidden="true" />,
    title: "Bir API satıyorum",
    body: "Çağrı, token ya da saniye başına tahsilat. Ne kazandığınızı, ne kadarının zincirde cüzdanınıza geçtiğini görün.",
    placeholder: "Ödeme adresiniz: G…",
    hint: "Ödemelerin yatacağı Stellar adresi (payTo). Kanal açan alıcılar bu adrese öder.",
  },
  {
    role: "agent",
    icon: <KeyRound className="size-5" aria-hidden="true" />,
    title: "Bir ajan çalıştırıyorum",
    body: "Ajanın zincirde yazılı politikası: tavanlar, izinli alıcılar, izinli çiftler. Her red sebebiyle görünür.",
    placeholder: "Reinkey hesabı: C…",
    hint: "Ajanın harcama yetkisini tutan hesap kontratı. Henüz yoksa aşağıdaki betikle kurulur.",
  },
  {
    role: "float",
    icon: <Landmark className="size-5" aria-hidden="true" />,
    title: "Sermaye sağlıyorum",
    body: "Kredi havuzunun büyüklüğü, pay fiyatı ve açık hatların sağlığı. Havuz herkese açık; adres gerekmez.",
    placeholder: "",
    hint: "",
  },
];

export function Onboarding({
  onPick,
  onDemo,
  onFloat,
  wallet,
}: {
  onPick: (role: Role, address: string) => void;
  onDemo: () => void;
  onFloat: () => void;
  /** Cüzdan bağlayınca adres yazmaya gerek kalmaz. */
  wallet: { address: string | null; connecting: boolean; error: string | null; connect: () => Promise<string | null> };
}) {
  const [open, setOpen] = useState<Role | null>(null);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 py-6">
      <header className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Reinkey Console</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2rem]">Konsolu kendi verinize bağlayın</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Kayıt yok, parola yok, API anahtarı yok. Tek gereken bir adres: konsol onu zincirden okur ve tarayıcınızda saklar.
          Hiçbir şey bize gönderilmez.
        </p>
      </header>

      <ul className="grid gap-4 lg:grid-cols-3">
        {ROLES.map((r) => {
          const isOpen = r.role !== "float" && open === r.role;
          return (
            <li key={r.role}>
              <div className={cn("card flex h-full flex-col rounded-lg p-5 transition-colors", isOpen && "border-accent/50")}>
                <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2 text-accent">{r.icon}</span>
                <h2 className="mt-4 text-base font-semibold">{r.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{r.body}</p>

                {r.role === "float" ? (
                  <button
                    type="button"
                    onClick={onFloat}
                    className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
                  >
                    Havuzu aç
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
                      <span className="sr-only">{r.placeholder}</span>
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setInvalid(false);
                        }}
                        placeholder={r.placeholder}
                        spellCheck={false}
                        aria-invalid={invalid}
                        className={cn(
                          "h-9 w-full rounded-md border bg-bg px-3 font-mono text-xs text-fg placeholder:font-sans placeholder:text-fg-subtle",
                          invalid ? "border-danger" : "border-line-strong",
                        )}
                      />
                    </label>
                    <p className={cn("text-[11px] leading-snug", invalid ? "text-danger" : "text-fg-subtle")}>
                      {invalid ? "G… ya da C… ile başlayan 56 karakterlik bir Stellar adresi girin." : r.hint}
                    </p>
                    <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-contrast hover:opacity-90">
                      Konsolu aç
                    </button>
                    {r.role === "seller" && (
                      <>
                        <span className="my-0.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-fg-subtle">
                          <span className="h-px flex-1 bg-line" aria-hidden="true" /> ya da{" "}
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
                          Cüzdan bağla
                        </button>
                        <p className="text-[11px] leading-snug text-fg-subtle">
                          Freighter, xBull, Albedo, Lobstr, Rabet, Hana. Adres cüzdandan okunur; anahtarınız cüzdandan çıkmaz.
                        </p>
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
                    {ROLE_LABEL[r.role as Role]} olarak bağlan
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-dashed border-line-strong bg-bg-alt/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Önce nasıl göründüğüne bakın</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Canlı demo hesabı Stellar testnet&apos;te çalışıyor: bir ajan veri satın alır, işlem yapar, sınırı aşınca zincir reddeder.
          </p>
        </div>
        <button
          type="button"
          onClick={onDemo}
          className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast hover:opacity-90"
        >
          <Play className="size-4" aria-hidden="true" />
          Demoyu izle
        </button>
      </div>

      <p className="text-xs text-fg-subtle">
        Henüz bir ajan hesabınız yok mu?{" "}
        <a href={`${env.siteUrl}/docs/reins/quickstart`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Reins hızlı başlangıcı
        </a>{" "}
        · API satmaya başlamak için{" "}
        <a href={`${env.siteUrl}/docs/meter/quickstart`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Meter hızlı başlangıcı
        </a>
      </p>
    </div>
  );
}
