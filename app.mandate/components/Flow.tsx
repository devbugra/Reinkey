/**
 * Paranın yolu: ajan hesabı → ödeme kanalı → borsa.
 * Panelin "bu sistem ne yapıyor?" sorusunu tek bakışta cevaplayan bölümü.
 */
import { ArrowRight, Building2, Loader2, Lock, Receipt, ShieldX, Snowflake, Wallet } from "lucide-react";
import { describeCode } from "@/lib/codes";
import { big, clock, int, ratio, shortAddr, usdc } from "@/lib/format";
import type { ChannelView, ClaimView, RejectionView, StreamView } from "@/lib/store";
import type { AccountSnapshot } from "@/lib/types";
import { Code, DepositBar, TxLink, cn } from "./ui";

function Card({
  step,
  icon,
  title,
  subtitle,
  badge,
  tone,
  flashKey,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  /** danger: zincir bir işlemi engelledi · frozen: sahip hesabı dondurdu. */
  tone?: "danger" | "frozen";
  /** Değiştiğinde kartın çevresinde kırmızı halka bir kez parlar. */
  flashKey?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "card relative flex min-w-0 flex-col rounded-lg transition-colors duration-500",
        tone === "danger" && "border-danger/50",
        tone === "frozen" && "border-brand-sky/50 bg-brand-sky/[0.06]",
      )}
    >
      {flashKey && <span key={flashKey} className="flash-danger pointer-events-none absolute inset-0 rounded-lg" aria-hidden="true" />}
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            <span className="text-fg-subtle">{step} · </span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-fg-subtle">{subtitle}</p>
        </div>
        {badge}
      </header>
      <div className="grid flex-1 content-start gap-4 px-5 py-4">{children}</div>
    </article>
  );
}

/**
 * İki kart arasındaki ok. `chainKey` değişince (zincir işlemi) mor, `offKey`
 * değişince (zincire gitmeyen kupon) mavi bir nokta karttan karta geçer.
 */
function Connector({ label, sub, chainKey, offKey }: { label: string; sub: string; chainKey?: string; offKey?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-center xl:w-28 xl:flex-col xl:py-0">
      <div className="relative hidden h-2 w-full xl:block" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {offKey && <span key={`o-${offKey}`} className="flow-dot absolute top-0 size-2 rounded-full bg-brand-sky" />}
        {chainKey && <span key={`c-${chainKey}`} className="flow-dot absolute top-0 size-2 rounded-full bg-brand-lavender" />}
      </div>
      <span
        key={`${chainKey}-${offKey}`}
        className={cn("grid size-7 shrink-0 place-items-center rounded-full text-accent", (chainKey || offKey) && "flow-ping")}
        aria-hidden="true"
      >
        <ArrowRight className="size-5 rotate-90 xl:rotate-0" />
      </span>
      <p className="text-[11px] leading-snug text-fg-muted">
        <span className="font-medium text-fg">{label}</span>
        <br />
        {sub}
      </p>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="tabular mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function Meter({ value, max, label }: { value: bigint; max: bigint; label: string }) {
  const r = ratio(value, max);
  return (
    <div>
      <div className="tabular flex items-baseline justify-between text-xs">
        <span className="text-fg-subtle">{label}</span>
        <span>
          {usdc(value)} / {usdc(max)} USDC
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            r >= 0.999 ? "bg-danger" : r > 0.7 ? "bg-warning" : "bg-brand-sky",
          )}
          style={{ width: `${r * 100}%` }}
        />
      </div>
    </div>
  );
}

export function Flow({
  account,
  channels,
  streams,
  claims,
  dataSeconds,
  rejection,
  canClaim,
  claiming,
  onClaim,
}: {
  account: AccountSnapshot | null;
  channels: Record<string, ChannelView>;
  streams: Record<string, StreamView>;
  claims: ClaimView[];
  dataSeconds: number;
  /** Zincirin engellediği son işlem; hesabın kartında gösterilir. */
  rejection: RejectionView | undefined;
  canClaim: boolean;
  claiming: boolean;
  onClaim: (channelId: string) => void;
}) {
  const list = Object.values(channels);
  const current =
    list
      .filter((c) => c.open)
      .sort((a, b) => Number(b.id) - Number(a.id))[0] ??
    list.sort((a, b) => Number(b.id) - Number(a.id))[0];
  const stream = current
    ? Object.values(streams)
        .filter((s) => s.channelId === current.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined;

  const pending = current && current.accepted > current.claimed ? current.accepted - current.claimed : 0n;
  const remaining = current && current.deposit > current.accepted ? current.deposit - current.accepted : 0n;
  const exhausted = Boolean(current?.open && current.deposit > 0n && remaining === 0n);

  const totalClaimed = list.reduce((s, c) => s + c.claimed, 0n);
  const totalPending = list.reduce((s, c) => s + (c.accepted > c.claimed ? c.accepted - c.claimed : 0n), 0n);
  const lastClaim = claims[0];

  return (
    <section aria-label="Paranın yolu" className="grid gap-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr] xl:items-stretch">
      <Card
        step={1}
        icon={<Wallet className="size-5" aria-hidden="true" />}
        title="Ajanın hesabı"
        subtitle="Sınırı sahibi koyar, Stellar ağı uygular"
        tone={account?.frozen ? "frozen" : account && rejection ? "danger" : undefined}
        flashKey={account ? rejection?.key : undefined}
        badge={
          account ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                account.frozen ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
              )}
            >
              {account.frozen && <Snowflake className="size-3" aria-hidden="true" />}
              {account.frozen ? "donduruldu" : "aktif"}
            </span>
          ) : null
        }
      >
        {account ? (
          <>
            {rejection && (
              <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5" role="alert">
                <ShieldX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">Zincir engelledi: {describeCode(rejection.code)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <Code code={rejection.code} />
                    <span className="tabular font-mono text-[11px] text-fg-subtle">{clock(rejection.ts)}</span>
                    <TxLink hash={rejection.tx} className="ml-auto" />
                  </p>
                </div>
              </div>
            )}
            {account.frozen && (
              <p className="flex items-center gap-2 rounded-md border border-brand-sky/30 bg-brand-sky/10 px-3 py-2 text-xs text-fg">
                <Snowflake className="size-4 shrink-0 text-brand-sky" aria-hidden="true" />
                Sahip hesabı dondurdu: ajanın anahtarı artık hiçbir işlemi imzalayamaz.
              </p>
            )}
            <Meter label="Bugünkü harcama / günlük tavan" value={big(account.spentToday)} max={big(account.policy.dailyCap)} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="Tek işlem tavanı" value={`${usdc(account.policy.perTxCap)} USDC`} />
              <Stat label="Hesap" value={<span className="font-mono text-xs">{shortAddr(account.address, 5, 5)}</span>} />
              <Stat label="USDC bakiyesi" value={usdc(account.balance)} />
              <Stat label="XLM bakiyesi" value={account.balanceXlm ? usdc(account.balanceXlm, 2) : "—"} />
            </dl>
            <div>
              <p className="text-[11px] text-fg-subtle">Yalnızca bunlara izin var</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                {(account.policy.pairs ?? []).map((p) => (
                  <li key={p} className="rounded-sm border border-line bg-bg-alt px-2 py-0.5 font-mono text-fg-muted">
                    {p}
                  </li>
                ))}
                <li className="rounded-sm border border-line bg-bg-alt px-2 py-0.5 text-fg-muted">
                  {account.policy.payees.length} izinli alıcı
                </li>
              </ul>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-fg-subtle">Hesap zincirden okunuyor…</p>
        )}
      </Card>

      <Connector label="Depozitoyu kilitler" sub="tek zincir işlemi" chainKey={current ? `${current.id}-${current.deposit}` : undefined} />

      <Card
        step={2}
        icon={<Lock className="size-5" aria-hidden="true" />}
        title="Ödeme kanalı"
        subtitle="Ödemeler zincire gitmeden, kupon kupon akar"
        badge={
          current ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                !current.open ? "bg-surface-3 text-fg-subtle" : exhausted ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
              )}
            >
              #{current.id} · {!current.open ? "kapalı" : exhausted ? "depozito bitti" : "açık"}
            </span>
          ) : null
        }
      >
        {current ? (
          <>
            <div>
              <DepositBar claimed={ratio(current.claimed, current.deposit)} pending={ratio(pending, current.deposit)} />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-lavender" aria-hidden="true" /> tahsil edildi
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-sky" aria-hidden="true" /> ödendi, tahsilat bekliyor
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-surface-3" aria-hidden="true" /> kalan
                </li>
              </ul>
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Stat label="Depozito" value={usdc(current.deposit)} />
              <Stat label="Ödenen" value={usdc(current.accepted)} />
              <Stat label={current.refunded !== null ? "İade edildi" : "Kalan"} value={usdc(current.refunded ?? remaining)} />
            </dl>
            <p className="tabular flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="font-semibold text-fg">{int(current.vouchers)} kupon</span>
              {stream && !stream.ended && (
                <span className="inline-flex items-center gap-1.5 text-accent">
                  <span className="pulse-dot size-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {stream.unit === "second" ? "fiyat verisi akıyor" : "yanıt akıyor"}
                </span>
              )}
              {stream?.ended && stream.ended !== "done" && <Code code={stream.ended} />}
              <TxLink hash={current.openedTx} className="ml-auto" />
            </p>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-fg-subtle">
            Henüz kanal yok. &quot;Ajanı başlat&quot; ile ilk kanal açılır.
          </p>
        )}
      </Card>

      <Connector
        label="Tek işlemle tahsil eder"
        sub="yüzlerce ödeme birden"
        offKey={current && current.vouchers > 0 ? `${current.id}-${current.vouchers}` : undefined}
        chainKey={lastClaim?.key}
      />

      <Card
        step={3}
        icon={<Building2 className="size-5" aria-hidden="true" />}
        title="Borsa (veri satıcısı)"
        subtitle="Fiyat verisini saniye başı satar, parası anında gelir"
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Tahsil edilen" value={<span className="text-base font-semibold">{usdc(totalClaimed)} USDC</span>} />
          <Stat label="Tahsilat bekleyen" value={`${usdc(totalPending)} USDC`} />
          <Stat label="Satılan veri" value={`${int(dataSeconds)} sn`} />
          <Stat label="Tahsilat sayısı" value={int(claims.length)} />
        </dl>
        {lastClaim ? (
          <div className="rounded-md border border-line bg-bg-alt px-3 py-2.5">
            <p className="text-[11px] text-fg-subtle">Son tahsilat</p>
            <p className="tabular mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-accent">{int(lastClaim.vouchersCovered)} ödeme</span>
              <span className="text-fg-subtle">→</span>
              <span className="font-semibold">1 zincir işlemi</span>
              <span className="text-xs text-fg-muted">· {usdc(lastClaim.amount)} USDC</span>
              <TxLink hash={lastClaim.tx} className="ml-auto" />
            </p>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">Biriken kuponlar eşiği geçince otomatik tahsil edilir.</p>
        )}
        {current && pending > 0n && (
          <button
            type="button"
            onClick={() => onClaim(current.id)}
            disabled={!canClaim || claiming}
            title="Borsa, biriken kuponları beklemeden tek zincir işlemiyle tahsil eder"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-2 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {claiming ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Receipt className="size-4" aria-hidden="true" />}
            Şimdi tahsil et · {usdc(pending)} USDC
          </button>
        )}
      </Card>
    </section>
  );
}
