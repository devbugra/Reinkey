"use client";

/**
 * HESAP YÖNETİMİ — sahibin kendi imzasıyla.
 *
 *  - PolicyEditor: tavanları, alıcıları, süreyi ve borsa iznini değiştirir;
 *    hesabı dondurur ya da çözer. Yalnızca bağlı cüzdan hesabın SAHİBİYSE açılır.
 *  - CreateAccount: bağlı cüzdanı sahip yaparak yeni bir Reinkey hesabı kurar ve
 *    ajan için tarayıcıda bir anahtar üretir.
 *
 * İki akışta da sunucumuz yoktur: işlem tarayıcıda kurulur, cüzdanda imzalanır,
 * doğrudan zincire gider. Sınırı biz koymayız; koyamayız da.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Plus, ShieldCheck, Snowflake, Sun, Wallet as WalletIcon } from "lucide-react";
import { LEDGERS_PER_DAY, createAccount, invokeAsOwner, newAgentKey, policyScVal, type PolicyInput } from "@/lib/account";
import { getJson } from "@/lib/api";
import type { ChainEnv } from "@/lib/chain";
import { describeCode } from "@/lib/codes";
import { big, int, shortAddr, txUrl } from "@/lib/format";
import type { AccountSnapshot, DemoInfo } from "@/lib/types";
import { Panel, cn } from "./ui";

const SCALE = 10_000_000n;

export type AdminWallet = {
  address: string | null;
  connecting: boolean;
  /** Cüzdan bağlanamadıysa sebebi; kullanıcı pencereyi kapattıysa null. */
  error?: string | null;
  connect: () => Promise<string | null>;
  sign: (xdr: string, networkPassphrase: string, address: string) => Promise<string>;
  signAuth: (preimageXdr: string, networkPassphrase: string, address: string) => Promise<Uint8Array>;
};

/** "1,5" → 15000000n. Sıfır ve negatif geçersizdir. */
function parseUsdc(text: string): bigint | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,7})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const v = BigInt(whole) * SCALE + BigInt(frac.padEnd(7, "0"));
  return v > 0n ? v : null;
}

/** Taban birim → düzenlenebilir metin ("10000000" → "1"). */
function editable(base: string | bigint): string {
  const v = big(base);
  const frac = (v % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${v / SCALE}${frac ? `.${frac}` : ""}`;
}

/** Satır satır adres listesi; boşluk ve virgül de ayırıcıdır. */
function parseAddresses(text: string): { list: string[]; bad: string | null } {
  const list = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
  const bad = list.find((a) => !/^[GC][A-Z2-7]{55}$/.test(a)) ?? null;
  return { list, bad };
}

function useChainEnv(info: DemoInfo | null): ChainEnv | null {
  const rpcUrl = info?.rpcUrl;
  const passphrase = info?.networkPassphrase;
  return useMemo(() => (rpcUrl && passphrase ? { rpcUrl, networkPassphrase: passphrase } : null), [rpcUrl, passphrase]);
}

async function latestLedger(): Promise<number | null> {
  const h = await getJson<{ latestLedger?: number }>("/health");
  return h?.latestLedger ?? null;
}

const field = "tabular h-9 w-full min-w-0 rounded-md border border-line-strong bg-bg px-3 font-mono text-sm text-fg placeholder:text-fg-subtle";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-contrast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
const secondary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong px-3 text-sm text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

type Done = { hash: string; confirmed: boolean };

function Result({ error, done, doneLabel }: { error: string | null; done: Done | null; doneLabel: string }) {
  const t = useTranslations("admin");
  return (
    <>
      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs", done.confirmed ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
          {done.confirmed ? doneLabel : t("unconfirmed")}
          {txUrl(done.hash) && (
            <a href={txUrl(done.hash)!} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline underline-offset-2">
              tx <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </p>
      )}
    </>
  );
}

/** Zincirin sebep kodu geldiyse okunur açıklamasıyla gösterilir. */
function explain(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  return /^[A-Z][A-Z0-9_]+$/.test(msg) ? `${msg} · ${describeCode(msg)}` : msg;
}

export function PolicyEditor({
  account,
  info,
  wallet,
  isExample = false,
  onDone,
}: {
  account: AccountSnapshot;
  info: DemoInfo | null;
  wallet: AdminWallet;
  /** Örnek hesap: sahibi biziz; ziyaretçiye "sahip cüzdanını bağla" demek çıkmaz sokaktır. */
  isExample?: boolean;
  /** Yazma kesinleşince hesabı yeniden okut. */
  onDone: () => void;
}) {
  const t = useTranslations("admin");
  const env = useChainEnv(info);
  const p = account.policy;
  const [perTx, setPerTx] = useState(() => editable(p.perTxCap));
  const [daily, setDaily] = useState(() => editable(p.dailyCap));
  const [payees, setPayees] = useState(() => p.payees.join("\n"));
  const [dex, setDex] = useState(() => !!p.dexRouter && (p.pairIds?.length ?? 0) > 0);
  const [extendDays, setExtendDays] = useState("");
  const [busy, setBusy] = useState<"policy" | "freeze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const owner = account.owner ?? null;
  const isOwner = !!owner && wallet.address === owner;
  const delegated = !!p.controller;

  // Yönetim devredilmişse (kredi hattı) sahip imzası yetmez: kontrat controller'ı arar.
  if (delegated)
    return (
      <Panel title={t("editTitle")} hint={t("editHint")}>
        <p className="px-5 py-4 text-sm leading-relaxed text-fg-muted">{t("delegated", { controller: shortAddr(p.controller!, 6, 6) })}</p>
      </Panel>
    );

  if (!isOwner)
    return (
      <Panel title={t("editTitle")} hint={t("editHint")}>
        <div className="grid gap-3 px-5 py-4">
          <p className="text-sm leading-relaxed text-fg-muted">
            {isExample ? t("exampleOwner") : owner ? t("ownerOnly", { owner: shortAddr(owner, 6, 6) }) : t("ownerUnknown")}
          </p>
          {isExample ? null : wallet.address ? (
            <p className="text-xs text-warning">{t("wrongWallet", { address: shortAddr(wallet.address, 6, 6) })}</p>
          ) : (
            <button type="button" disabled={wallet.connecting} onClick={() => void wallet.connect()} className={cn(primary, "justify-self-start")}>
              {wallet.connecting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <WalletIcon className="size-4" aria-hidden="true" />}
              {t("connectOwner")}
            </button>
          )}
          {!isExample && wallet.error && (
            <p className="text-xs text-danger" role="alert">
              {wallet.error}
            </p>
          )}
        </div>
      </Panel>
    );

  const perTxV = parseUsdc(perTx);
  const dailyV = parseUsdc(daily);
  const addrs = parseAddresses(payees);
  const days = extendDays.trim() === "" ? 0 : Number(extendDays);
  const daysBad = !Number.isInteger(days) || days < 0 || days > 3650;
  const capOrder = perTxV !== null && dailyV !== null && perTxV > dailyV;
  const dexAvailable = !!(info?.dexRouter && info.dexFactory && info.usdc && info.xlm);
  const invalid = !perTxV || !dailyV || capOrder || !!addrs.bad || addrs.list.length === 0 || daysBad;

  const run = async (kind: "policy" | "freeze", work: (env: ChainEnv, owner: string) => Promise<Done>) => {
    if (!env || !wallet.address) return;
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      setDone(await work(env, wallet.address));
      onDone();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("policy", async (env, owner) => {
      let expiresLedger = p.expiresLedger;
      if (days > 0) {
        const latest = await latestLedger();
        if (!latest) throw new Error(t("noLedger"));
        expiresLedger = Math.max(latest, p.expiresLedger) + days * LEDGERS_PER_DAY;
      }
      const next: PolicyInput = {
        agentKey: p.agentKey,
        asset: p.asset ?? info!.usdc,
        perTxCap: perTxV!,
        dailyCap: dailyV!,
        payees: addrs.list,
        channel: p.channel,
        expiresLedger,
        dexRouter: dex ? (p.dexRouter ?? info?.dexRouter ?? null) : null,
        dexFactory: dex ? (p.dexFactory ?? info?.dexFactory ?? null) : null,
        pairs: dex
          ? p.pairIds?.length
            ? p.pairIds
            : [
                [info!.usdc, info!.xlm],
                [info!.xlm, info!.usdc],
              ]
          : [],
      };
      return invokeAsOwner({
        env,
        accountId: account.address,
        method: "set_policy",
        args: [await policyScVal(next)],
        owner,
        sign: wallet.sign,
        signAuth: wallet.signAuth,
      });
    });

  const toggleFreeze = () =>
    run("freeze", (env, owner) =>
      invokeAsOwner({
        env,
        accountId: account.address,
        method: account.frozen ? "unfreeze" : "freeze",
        args: [],
        owner,
        sign: wallet.sign,
        signAuth: wallet.signAuth,
      }),
    );

  return (
    <Panel
      title={t("editTitle")}
      hint={t("editHint")}
      action={
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] text-success">
          <ShieldCheck className="size-3" aria-hidden="true" />
          {t("youOwn")}
        </span>
      }
    >
      <div className="grid gap-4 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("perTx")}</span>
            <input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("daily")}</span>
            <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" className={field} />
          </label>
        </div>
        {capOrder && <p className="text-xs text-danger">{t("capOrder")}</p>}

        <label className="grid gap-1.5">
          <span className="text-[11px] text-fg-subtle">{t("payees")}</span>
          <textarea
            value={payees}
            onChange={(e) => setPayees(e.target.value)}
            rows={Math.min(6, Math.max(2, addrs.list.length + 1))}
            spellCheck={false}
            className={cn(field, "h-auto py-2 text-[11.5px] leading-relaxed")}
          />
          <span className="text-[11px] text-fg-subtle">{t("payeesHint")}</span>
        </label>
        {addrs.bad && <p className="text-xs text-danger">{t("badAddress", { address: shortAddr(addrs.bad, 8, 4) })}</p>}
        {!addrs.bad && addrs.list.length === 0 && <p className="text-xs text-danger">{t("needPayee")}</p>}
        {daysBad && <p className="text-xs text-danger">{t("badDays")}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("extend")}</span>
            <input value={extendDays} onChange={(e) => setExtendDays(e.target.value)} inputMode="numeric" placeholder="0" className={field} />
            <span className="text-[11px] text-fg-subtle">{t("extendHint", { ledger: int(p.expiresLedger) })}</span>
          </label>
          <label className={cn("flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5", !dexAvailable && !dex && "opacity-50")}>
            <input type="checkbox" checked={dex} disabled={!dexAvailable && !dex} onChange={(e) => setDex(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span className="grid gap-0.5">
              <span className="text-xs text-fg">{t("dex")}</span>
              <span className="text-[11px] leading-relaxed text-fg-subtle">{t("dexHint")}</span>
            </span>
          </label>
        </div>

        <Result error={error} done={done} doneLabel={t("written")} />

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || invalid || !env} onClick={() => void save()} className={primary}>
            {busy === "policy" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {busy === "policy" ? t("signing") : t("save")}
          </button>
          <button type="button" disabled={!!busy || !env} onClick={() => void toggleFreeze()} className={cn(secondary, !account.frozen && "text-danger")}>
            {busy === "freeze" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : account.frozen ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Snowflake className="size-4" aria-hidden="true" />
            )}
            {account.frozen ? t("unfreeze") : t("freeze")}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-fg-subtle">{t("note")}</p>
      </div>
    </Panel>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const t = useTranslations("admin");
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <div className="flex items-center gap-2">
        <code className={cn("min-w-0 flex-1 truncate rounded-md border border-line bg-bg px-3 py-2 font-mono text-[11.5px]", secret ? "text-warning" : "text-fg-muted")}>
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={t("copy")}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-fg-muted hover:text-fg"
        >
          {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function CreateAccount({
  info,
  wallet,
  onCreated,
}: {
  info: DemoInfo | null;
  wallet: AdminWallet;
  /** Kurulan hesabı konsolda aç. */
  onCreated: (contractId: string) => void;
}) {
  const t = useTranslations("admin");
  const env = useChainEnv(info);
  const [open, setOpen] = useState(false);
  const [perTx, setPerTx] = useState("1");
  const [daily, setDaily] = useState("5");
  // Boş başlar: örnek satıcıyı sessizce kullanıcının zincirdeki politikasına yazdırmayalım.
  const [payees, setPayees] = useState("");
  const [days, setDays] = useState("30");
  const [dex, setDex] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ contractId: string; hash: string; confirmed: boolean; agentSecret: string; agentPublic: string } | null>(null);

  const ready = !!(env && info?.accountWasm && info.usdc && info.channelContract);
  const dexAvailable = !!(info?.dexRouter && info.dexFactory && info.xlm);

  if (created)
    return (
      <Panel title={t("createdTitle")} hint={t("createdHint")}>
        <div className="grid gap-4 px-5 py-4">
          <CopyRow label={t("accountId")} value={created.contractId} />
          <CopyRow label={t("agentSecret")} value={created.agentSecret} secret />
          {!created.confirmed && <p className="rounded-md bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning">{t("unconfirmed")}</p>}
          <p className="rounded-md bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning">{t("secretOnce")}</p>
          <ol className="grid list-decimal gap-1.5 ps-4 text-xs leading-relaxed text-fg-muted">
            <li>{t("next1")}</li>
            <li>{t("next2")}</li>
            <li>{t("next3")}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onCreated(created.contractId)} className={primary}>
              {t("openAccount")}
            </button>
            {txUrl(created.hash) && (
              <a href={txUrl(created.hash)!} target="_blank" rel="noreferrer" className={secondary}>
                tx <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </Panel>
    );

  if (!open)
    return (
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg px-5 py-4">
        <KeyRound className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("createTitle")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t("createLead")}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} disabled={!ready} className={primary}>
          <Plus className="size-4" aria-hidden="true" />
          {t("createCta")}
        </button>
      </div>
    );

  const perTxV = parseUsdc(perTx);
  const dailyV = parseUsdc(daily);
  const addrs = parseAddresses(payees);
  const daysN = Number(days);
  const daysBad = !Number.isInteger(daysN) || daysN < 1 || daysN > 3650;
  const capOrder = perTxV !== null && dailyV !== null && perTxV > dailyV;
  const invalid = !perTxV || !dailyV || capOrder || !!addrs.bad || addrs.list.length === 0 || daysBad;

  const submit = async () => {
    if (!env || !info?.accountWasm) return;
    setBusy(true);
    setError(null);
    try {
      const owner = wallet.address ?? (await wallet.connect());
      // Bağlanamadıysa sebep aşağıda (wallet.error) görünür; kullanıcı pencereyi kapattıysa sessizce durulur.
      if (!owner) return;
      const latest = await latestLedger();
      if (!latest) throw new Error(t("noLedger"));
      const agent = await newAgentKey();
      const policy: PolicyInput = {
        agentKey: agent.publicKey,
        asset: info.usdc,
        perTxCap: perTxV!,
        dailyCap: dailyV!,
        payees: addrs.list,
        channel: info.channelContract,
        expiresLedger: latest + daysN * LEDGERS_PER_DAY,
        dexRouter: dex ? (info.dexRouter ?? null) : null,
        dexFactory: dex ? (info.dexFactory ?? null) : null,
        pairs: dex
          ? [
              [info.usdc, info.xlm],
              [info.xlm, info.usdc],
            ]
          : [],
      };
      const { hash, contractId, confirmed } = await createAccount({ env, wasmHash: info.accountWasm, owner, policy, sign: wallet.sign });
      if (!contractId) throw new Error(t("noContractId"));
      setCreated({ contractId, hash, confirmed, agentSecret: agent.secret, agentPublic: agent.publicKey });
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("createTitle")} hint={t("createHint")}>
      <div className="grid gap-4 px-5 py-4">
        <p className="text-xs leading-relaxed text-fg-muted">
          {wallet.address ? t("ownerWillBe", { owner: shortAddr(wallet.address, 6, 6) }) : t("ownerWillBeWallet")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("perTx")}</span>
            <input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("daily")}</span>
            <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] text-fg-subtle">{t("validDays")}</span>
            <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className={field} />
          </label>
        </div>
        {capOrder && <p className="text-xs text-danger">{t("capOrder")}</p>}

        <label className="grid gap-1.5">
          <span className="text-[11px] text-fg-subtle">{t("payees")}</span>
          <textarea
            value={payees}
            onChange={(e) => setPayees(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder={t("payeesPlaceholder")}
            className={cn(field, "h-auto py-2 text-[11.5px] leading-relaxed placeholder:font-sans")}
          />
          <span className="text-[11px] text-fg-subtle">{t("payeesHint")}</span>
        </label>
        {info?.seller && !addrs.list.includes(info.seller) && (
          <button
            type="button"
            onClick={() => setPayees((v) => (v.trim() ? `${v.trim()}\n${info.seller}` : info.seller))}
            className="justify-self-start text-xs text-accent hover:underline"
          >
            {t("useExampleSeller")}
          </button>
        )}
        {addrs.bad && <p className="text-xs text-danger">{t("badAddress", { address: shortAddr(addrs.bad, 8, 4) })}</p>}
        {!addrs.bad && addrs.list.length === 0 && payees.trim() === "" && <p className="text-xs text-fg-subtle">{t("needPayee")}</p>}
        {daysBad && <p className="text-xs text-danger">{t("badDays")}</p>}

        <label className={cn("flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5", !dexAvailable && "opacity-50")}>
          <input type="checkbox" checked={dex} disabled={!dexAvailable} onChange={(e) => setDex(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span className="grid gap-0.5">
            <span className="text-xs text-fg">{t("dex")}</span>
            <span className="text-[11px] leading-relaxed text-fg-subtle">{t("dexHint")}</span>
          </span>
        </label>

        <Result error={error ?? (wallet.address ? null : (wallet.error ?? null))} done={null} doneLabel="" />

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || invalid || !ready} onClick={() => void submit()} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
            {busy ? t("signing") : wallet.address ? t("createSubmit") : t("connectAndCreate")}
          </button>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className={secondary}>
            {t("cancel")}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-fg-subtle">{t("createNote")}</p>
      </div>
    </Panel>
  );
}
