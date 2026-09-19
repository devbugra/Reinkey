"use client";

/**
 * Reinkey Reins · hesap görünümü: zincirde yazılı politika, bugünkü harcama,
 * hesabın açtığı kanallar, engellenen işlemler ve kalıcı denetim defteri.
 */
import { Snowflake } from "lucide-react";
import { big, int, shortAddr, usdc } from "@/lib/format";
import type { ChannelView, RejectionView, Row } from "@/lib/store";
import type { AccountSnapshot } from "@/lib/types";
import { Blocked } from "../Blocked";
import { Meter, Stat } from "../Flow";
import { Identity } from "../Identity";
import { Timeline } from "../Timeline";
import { Empty, Panel, cn } from "../ui";

export function ReinsView({
  address,
  isDemo,
  account,
  channels,
  rejections,
  rows,
  perSecond,
  onAccount,
}: {
  address: string | null;
  isDemo: boolean;
  account: AccountSnapshot | null;
  channels: Record<string, ChannelView>;
  rejections: RejectionView[];
  rows: Row[];
  perSecond: bigint;
  onAccount: (address: string | null) => void;
}) {
  const mine = Object.values(channels)
    .filter((c) => c.payer === address)
    .sort((a, b) => Number(b.id) - Number(a.id));
  const locked = mine.filter((c) => c.open).reduce((s, c) => s + (c.deposit > c.accepted ? c.deposit - c.accepted : 0n), 0n);

  return (
    <>
      <Identity
        label="Reinkey hesabı"
        value={address}
        isDemo={isDemo}
        placeholder="Başka bir hesap: C…"
        onChange={onAccount}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel
          title="Politika"
          hint="Hesabın içinde yazılı · her imzada Stellar tarafından denetlenir"
          action={
            account ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
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
            <div className="grid gap-5 px-5 py-4">
              <Meter label="Bugünkü harcama / günlük tavan" value={big(account.spentToday)} max={big(account.policy.dailyCap)} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Stat label="Tek işlem tavanı" value={`${usdc(account.policy.perTxCap)} USDC`} />
                <Stat label="Günlük tavan" value={`${usdc(account.policy.dailyCap)} USDC`} />
                <Stat label="USDC bakiyesi" value={usdc(account.balance)} />
                <Stat label="Kanallarda kilitli" value={`${usdc(locked)} USDC`} />
                <Stat label="Politika bitişi (ledger)" value={int(account.policy.expiresLedger)} />
                <Stat label="Ajan anahtarı" value={<span className="font-mono text-xs">{shortAddr(account.policy.agentKey, 6, 6)}</span>} />
              </dl>
              <div>
                <p className="text-[11px] text-fg-subtle">İzinli alıcılar</p>
                <ul className="mt-1.5 grid gap-1">
                  {account.policy.payees.map((p) => (
                    <li key={p} className="truncate rounded-sm border border-line bg-bg-alt px-2 py-1 font-mono text-[11px] text-fg-muted">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              {(account.policy.pairs?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] text-fg-subtle">İzinli işlem çiftleri</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {account.policy.pairs!.map((p) => (
                      <li key={p} className="rounded-sm border border-line bg-bg-alt px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Empty>{address ? "Bu adreste bir Reinkey hesabı bulunamadı ya da zincirden okunuyor…" : "Hesap okunuyor…"}</Empty>
          )}
        </Panel>

        <Timeline rows={rows} perSecond={perSecond} account={address} defaultTab="ledger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Hesabın kanalları" hint="Her kanal, hesabın bir satıcıya ayırdığı en fazla tutardır">
          {mine.length === 0 ? (
            <Empty>Bu hesabın bilinen kanalı yok.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {mine.slice(0, 8).map((c) => (
                <li key={c.id} className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="font-mono text-xs">#{c.id}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", c.open ? "bg-success-bg text-success" : "bg-surface-3 text-fg-subtle")}>
                    {c.open ? "açık" : "kapalı"}
                  </span>
                  <span className="font-mono text-xs text-fg-muted">→ {shortAddr(c.payee, 5, 5)}</span>
                  <span className="ml-auto text-fg-muted">
                    <span className="font-semibold text-fg">{usdc(c.accepted)}</span> / {usdc(c.deposit)} USDC
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Blocked items={rejections} />
      </div>
    </>
  );
}
