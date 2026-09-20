"use client";

/**
 * HAVUZA YATIR / ÇEK — kullanıcının kendi imzasıyla.
 *
 * Emanet yok: işlem tarayıcıda kurulur, cüzdanda imzalanır, doğrudan zincire
 * gider. Bizim sunucumuz bu akışta yer almaz; ne anahtarı ne de parayı görür.
 *
 * Çekim havuzda BOŞTA duran USDC kadar yapılabilir: kredi olarak verilmiş kısım
 * hat kapanınca ya da tasfiyeyle döner. Bunu gizlemiyoruz, ekranda yazıyoruz.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2, Wallet } from "lucide-react";
import { invoke, tokenBalance, type ChainEnv } from "@/lib/chain";
import { big, txUrl, usdc } from "@/lib/format";
import type { DemoInfo, FloatPool, FloatPosition } from "@/lib/types";
import { cn } from "./ui";

const SCALE = 10_000_000n;

type Wallet = {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<string | null>;
  sign: (xdr: string, networkPassphrase: string, address: string) => Promise<string>;
};

/** Kullanıcının girdiği USDC metnini taban birime çevirir ("1,5" → 15000000n). */
function parseUsdc(text: string): bigint | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,7})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const v = BigInt(whole) * SCALE + BigInt(frac.padEnd(7, "0"));
  return v > 0n ? v : null;
}

export function FloatActions({
  pool,
  info,
  wallet,
  positions,
  onDone,
}: {
  pool: FloatPool;
  info: DemoInfo | null;
  wallet: Wallet;
  positions: FloatPosition[];
  /** İşlem kesinleşince havuzu yeniden okut. */
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  // Nesne kimliği her render'da değişmesin: etkiyi boşuna tetiklerdi.
  const rpcUrl = info?.rpcUrl;
  const passphrase = info?.networkPassphrase;
  const env: ChainEnv | null = useMemo(
    () => (rpcUrl && passphrase ? { rpcUrl, networkPassphrase: passphrase } : null),
    [rpcUrl, passphrase],
  );
  const mine = wallet.address ? positions.find((p) => p.address === wallet.address) : undefined;
  const shares = mine ? big(mine.shares) : 0n;
  const sharePrice = big(pool.sharePrice);
  const idle = big(pool.idle);

  // Cüzdandaki USDC: yatırılabilecek üst sınır.
  useEffect(() => {
    if (!env || !wallet.address || !info?.usdc) return;
    let stopped = false;
    void tokenBalance(env, info.usdc, wallet.address).then(
      (b) => !stopped && setBalance(b),
      () => !stopped && setBalance(0n),
    );
    return () => {
      stopped = true;
    };
  }, [env, wallet.address, info?.usdc, done]);

  if (!wallet.address)
    return (
      <div className="card grid gap-3 rounded-lg px-5 py-4">
        <p className="text-sm font-semibold">Havuza katılın</p>
        <p className="text-xs leading-relaxed text-fg-muted">
          Cüzdanınızı bağlayın: payınızı görün, USDC yatırın ya da çekin. İşlem sizin cüzdanınızda imzalanır; anahtarınız
          bize gelmez, paranız bizde durmaz.
        </p>
        <button
          type="button"
          disabled={wallet.connecting}
          onClick={() => void wallet.connect()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-contrast hover:opacity-90 disabled:opacity-50"
        >
          {wallet.connecting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
          Cüzdan bağla
        </button>
      </div>
    );

  const value = parseUsdc(amount);
  const max = mode === "deposit" ? (balance ?? 0n) : (shares * sharePrice) / SCALE;
  const tooMuch = value !== null && value > max;
  // Çekimde tutar paya çevrilir; havuzun boşta duran USDC'si sınırdır.
  const shortLiquidity = mode === "withdraw" && value !== null && value > idle;

  const submit = async () => {
    if (!env || !value || !wallet.address) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const args =
        mode === "deposit"
          ? [wallet.address, value]
          : // withdraw pay alır: tutar / pay fiyatı (aşağı yuvarlanır).
            [wallet.address, (value * SCALE) / sharePrice];
      const { hash } = await invoke({
        env,
        contractId: pool.pool,
        method: mode,
        args,
        source: wallet.address,
        sign: wallet.sign,
      });
      setDone(hash);
      setAmount("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card grid gap-4 rounded-lg px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Pozisyonunuz</p>
        <p className="tabular text-xs text-fg-subtle">
          <span className="font-mono">{wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}</span>
          {balance !== null && <> · cüzdanda {usdc(balance, 2)} USDC</>}
        </p>
      </div>

      <dl className="tabular grid grid-cols-2 gap-x-4">
        <div>
          <dt className="text-[11px] text-fg-subtle">Bugünkü değeri</dt>
          <dd className="mt-0.5 text-xl font-semibold">{usdc((shares * sharePrice) / SCALE, 2)} USDC</dd>
        </div>
        <div>
          <dt className="text-[11px] text-fg-subtle">Payınız</dt>
          <dd className="mt-0.5 text-xl font-semibold">{usdc(shares, 2)}</dd>
        </div>
      </dl>

      <div className="flex rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label="İşlem">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAmount("");
              setError(null);
            }}
            className={cn("flex-1 rounded-[5px] px-3 py-1.5", mode === m ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
          >
            {m === "deposit" ? "Yatır" : "Çek"}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <label className="grid gap-1.5">
          <span className="sr-only">Tutar (USDC)</span>
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="tabular h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-3 font-mono text-sm text-fg placeholder:text-fg-subtle"
            />
            <span className="text-xs text-fg-muted">USDC</span>
            <button
              type="button"
              onClick={() => setAmount((Number(max) / Number(SCALE)).toFixed(2))}
              className="rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              en çok
            </button>
          </div>
        </label>
        <p className="text-[11px] text-fg-subtle">
          {mode === "deposit"
            ? `Karşılığında ${value ? usdc((value * SCALE) / sharePrice, 2) : "0.00"} pay alırsınız (pay fiyatı ${usdc(sharePrice, 5)}).`
            : `Havuzda boşta duran ${usdc(idle, 2)} USDC kadar çekilebilir; kredidekiler hat kapanınca döner.`}
        </p>
      </div>

      {tooMuch && <p className="text-xs text-danger">{mode === "deposit" ? "Cüzdanınızdaki USDC yetmiyor." : "Bu kadar payınız yok."}</p>}
      {shortLiquidity && !tooMuch && <p className="text-xs text-warning">Havuzda o kadar boşta USDC yok; çekim zincirde reddedilir.</p>}
      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-xs text-success">
          İşlem zincirde kesinleşti.
          {txUrl(done) && (
            <a href={txUrl(done)!} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline underline-offset-2">
              tx <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !value || tooMuch || !env}
        onClick={() => void submit()}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-contrast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : mode === "deposit" ? (
          <ArrowDownToLine className="size-4" aria-hidden="true" />
        ) : (
          <ArrowUpFromLine className="size-4" aria-hidden="true" />
        )}
        {busy ? "Cüzdanda imzalayın…" : mode === "deposit" ? "Yatır" : "Çek"}
      </button>
      <p className="text-[11px] leading-relaxed text-fg-subtle">
        İşlem cüzdanınızda imzalanır ve doğrudan Stellar testnet&apos;e gider. Testnet: gerçek para yatırmayın.
      </p>
    </div>
  );
}
