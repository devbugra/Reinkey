"use client";

/**
 * Reinkey Reins · hesap görünümü: zincirde yazılı politika, bugünkü harcama,
 * hesabın açtığı kanallar, engellenen işlemler ve kalıcı denetim defteri.
 */
import { Snowflake } from "lucide-react";
import { env } from "@/lib/env";
import { big, int, shortAddr, usdc } from "@/lib/format";
import type { ChannelView, RejectionView, Row } from "@/lib/store";
import type { AccountSnapshot } from "@/lib/types";
import { Blocked } from "../Blocked";
import { Meter, Stat } from "../Flow";
import { Identity } from "../Identity";
import { Timeline } from "../Timeline";
import { Empty, Panel, cn } from "../ui";

/**
 * Adreste bir Reinkey hesabı yoksa: boş politika kartı göstermek yerine nasıl
 * kurulacağı anlatılır. Hesap bir kontrattır; bugün deploy betiğiyle kurulur.
 */
function NoAccount({ address }: { address: string }) {
  return (
    <Panel title="Bu adreste Reinkey hesabı yok" hint="Adres zincirde okunamadı ya da bir hesap kontratı değil">
      <div className="grid gap-4 px-5 py-4">
        <p className="text-sm leading-relaxed text-fg-muted">
          Reinkey hesabı, ajanın harcama yetkisini tutan bir Soroban kontratıdır: tavanlar, izinli alıcılar ve izinli
          işlem çiftleri onun içinde yazılıdır. Girdiğiniz adres (<span className="font-mono text-xs">{shortAddr(address, 6, 6)}</span>)
          böyle bir hesaba ait değil.
        </p>
        <div>
          <p className="text-xs font-medium text-fg">Hesap nasıl kurulur</p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-bg px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg-muted">
            <code>{"git clone …/Reinkey && cd Reinkey\n./scripts/deploy-testnet.sh"}</code>
          </pre>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
            Betik kontratları deploy eder, hesabı testnet USDC ile fonlar ve kimlikleri{" "}
            <span className="font-mono">deployments/testnet.json</span> dosyasına yazar. Konsoldan tek tıkla kurulum yol
            haritasında.
          </p>
        </div>
        <p className="text-xs text-fg-subtle">
          Ayrıntı:{" "}
          <a href={`${env.siteUrl}/docs/reins/quickstart`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Reins hızlı başlangıç
          </a>{" "}
          ·{" "}
          <a href={`${env.siteUrl}/docs/reins/policy`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Politika ve redler
          </a>
        </p>
      </div>
    </Panel>
  );
}

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

  // Adres verilmiş ama hesap okunamadıysa (kayıtlı değil, yanlış tür): kurulumu anlat.
  if (address && !account && !isDemo)
    return (
      <>
        <Identity label="Reinkey hesabı" value={address} isDemo={isDemo} placeholder="Başka bir hesap: C…" onChange={onAccount} />
        <NoAccount address={address} />
      </>
    );

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
                <Stat label="XLM bakiyesi" value={account.balanceXlm ? usdc(account.balanceXlm, 2) : "—"} />
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
            <Empty>Hesap zincirden okunuyor…</Empty>
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
