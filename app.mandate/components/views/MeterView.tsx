"use client";

/**
 * Reinkey Meter · satıcı görünümü: bu adrese ödeme yapan kanallar, tahsil edilen
 * ve bekleyen gelir, elle tahsilat ve adresle doldurulmuş entegrasyon örneği.
 */
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Receipt } from "lucide-react";
import { env } from "@/lib/env";
import { clock, int, ratio, usdc } from "@/lib/format";
import type { ChannelView, ClaimView } from "@/lib/store";
import { Identity } from "../Identity";
import { Receipts } from "../Receipts";
import { Revenue } from "../Revenue";
import { DepositBar, Empty, Panel, TxLink, cn } from "../ui";

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card min-w-0 rounded-lg px-4 py-4 sm:px-5">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={cn("tabular mt-1.5 truncate text-lg font-semibold tracking-tight sm:text-2xl", accent && "text-gradient")}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

/**
 * İLK KOŞU. Yeni bir satıcı adresini bağladığında bu sayfa boştur: sıfır dolu
 * kartlar göstermek yerine ne yapılacağı anlatılır. Kod örneği kullanıcının
 * KENDİ adresiyle doldurulur; kopyalayıp yapıştırması yeter. İlk ödeme gelince
 * sayfa kendiliğinden dolar (10 sn'de bir okunuyor).
 */
function FirstRun({ payTo }: { payTo: string }) {
  const t = useTranslations("meter");
  const steps = [
    { title: t("step1"), body: t("step1Body"), code: "npm i @reinkey/meter" },
    {
      title: t("step2"),
      body: t("step2Body"),
      code: `import { reinkey } from "@reinkey/meter";

const rk = await reinkey({
  facilitator: "${env.apiUrl}",
  payTo: "${payTo}",
});

app.get("/book", rk.meter({ price: 5000n, unit: "request" }), handler);`,
    },
    { title: t("step3"), body: t("step3Body"), code: "curl -i localhost:8080/book" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel title={t("firstTitle")} hint={t("firstHint")}>
        <ol className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.title} className="grid gap-2.5 px-5 py-4">
              <p className="flex items-baseline gap-2.5">
                <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-fg-muted">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
              </p>
              <p className="ps-7 text-xs leading-relaxed text-fg-muted">{s.body}</p>
              <pre className="ms-7 overflow-x-auto rounded-md border border-line bg-bg px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg-muted">
                <code>{s.code}</code>
              </pre>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid content-start gap-4">
        <Panel title={t("whenTitle")} hint={t("whenHint")}>
          <div className="grid gap-3 px-5 py-4">
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <span className="pulse-dot size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
              {t("waiting")}
            </p>
            <p className="text-xs leading-relaxed text-fg-subtle">{t("whenBody")}</p>
            <ul className="grid gap-2 border-t border-line pt-3 text-xs text-fg-muted">
              {[t("bullet1"), t("bullet2"), t("bullet3")].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title={t("helpTitle")} hint={t("helpHint")}>
          <ul className="divide-y divide-line text-sm">
            {[
              [t("helpQuickstart"), `${env.marketingUrl}/docs/meter/quickstart`],
              [t("helpReference"), `${env.marketingUrl}/docs/meter/reference`],
              [t("helpCodes"), `${env.marketingUrl}/docs/reason-codes`],
            ].map(([label, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer" className="block px-5 py-2.5 text-fg-muted hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function MeterView({
  seller,
  isExample,
  channels,
  claims,
  canClaim,
  claiming,
  claimingId,
  loaded,
  onClaim,
  onSeller,
}: {
  seller: string | null;
  isExample: boolean;
  channels: Record<string, ChannelView>;
  claims: ClaimView[];
  canClaim: boolean;
  claiming: boolean;
  /** Tahsilatı süren kanal: gösterge yalnızca o satırda döner. */
  claimingId: string | null;
  /** Kanal listesi backend'den geldi mi: gelmeden "hiç kanal yok" denmez. */
  loaded: boolean;
  onClaim: (channelId: string) => void;
  onSeller: (address: string | null) => void;
}) {
  const t = useTranslations("meter");
  const mine = Object.values(channels)
    .filter((c) => c.payee === seller)
    .sort((a, b) => Number(b.id) - Number(a.id));
  const ids = new Set(mine.map((c) => c.id));
  const myClaims = claims.filter((c) => ids.has(c.channelId));

  // Liste gelmeden "kanal yok" sonucuna varılmaz: yerleşik bir satıcıya kurulum anlatmak yanıltıcı olur.
  if (seller && mine.length === 0 && !loaded)
    return (
      <>
        <Identity label={t("identity")} value={seller} isExample={isExample} placeholder={t("placeholder")} onChange={onSeller} />
        <Panel title={t("channelsTitle")}>
          <Empty>{t("loadingChannels")}</Empty>
        </Panel>
      </>
    );

  // Henüz hiç kanal yoksa bu adres için ödeme de yoktur: sıfırlar yerine kurulum anlatılır.
  if (seller && mine.length === 0)
    return (
      <>
        <Identity label={t("identity")} value={seller} isExample={isExample} placeholder={t("placeholder")} onChange={onSeller} />
        <FirstRun payTo={seller} />
      </>
    );

  const claimed = mine.reduce((s, c) => s + c.claimed, 0n);
  const pending = mine.reduce((s, c) => s + (c.accepted > c.claimed ? c.accepted - c.claimed : 0n), 0n);
  const open = mine.filter((c) => c.open).length;
  const buyers = new Set(mine.map((c) => c.payer)).size;

  const snippet = `import { reinkey } from "@reinkey/meter";

const rk = await reinkey({
  facilitator: "${env.apiUrl}",
  payTo: "${seller ?? "G…"}",
});

app.get("/book", rk.meter({ price: 5000n, unit: "request" }), handler);`;

  return (
    <>
      <Identity label={t("identity")} value={seller} isExample={isExample} placeholder={t("placeholder")} onChange={onSeller} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={t("claimed")} value={`${usdc(claimed)} USDC`} sub={t("claimedSub")} accent />
        <Kpi label={t("pending")} value={`${usdc(pending)} USDC`} sub={t("pendingSub")} />
        <Kpi label={t("openChannels")} value={int(open)} sub={t("channelsSub", { channels: int(mine.length), buyers: int(buyers) })} />
        <Kpi label={t("claimTxs")} value={int(myClaims.length)} sub={t("claimTxsSub")} />
      </div>

      <Revenue seller={seller} active />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title={t("channelsTitle")} hint={t("channelsHint")}>
          {mine.length === 0 ? (
            <Empty>{seller ? t("channelsEmpty") : t("reading")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-fg-subtle">
                    <th scope="col" className="px-5 py-2 font-normal">{t("colChannel")}</th>
                    <th scope="col" className="px-5 py-2 font-normal">{t("colBuyer")}</th>
                    <th scope="col" className="w-40 px-5 py-2 font-normal">{t("colUsage")}</th>
                    <th scope="col" className="px-5 py-2 text-right font-normal">{t("colClaimed")}</th>
                    <th scope="col" className="px-5 py-2 text-right font-normal">{t("colPending")}</th>
                    <th scope="col" className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mine.map((c) => {
                    const p = c.accepted > c.claimed ? c.accepted - c.claimed : 0n;
                    return (
                      <tr key={c.id}>
                        <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-normal">
                          <span className="font-mono text-xs">#{c.id}</span>{" "}
                          <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px]", c.open ? "bg-success-bg text-success" : "bg-surface-3 text-fg-subtle")}>
                            {c.open ? t("open") : t("closed")}
                          </span>
                        </th>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-fg-muted">
                          {c.payer ? `${c.payer.slice(0, 5)}…${c.payer.slice(-5)}` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <DepositBar claimed={ratio(c.claimed, c.deposit)} pending={ratio(p, c.deposit)} />
                          <span className="mt-1 block text-[11px] text-fg-subtle">{usdc(c.deposit)} USDC</span>
                        </td>
                        <td className="px-5 py-3 text-right">{usdc(c.claimed)}</td>
                        <td className="px-5 py-3 text-right">{usdc(p)}</td>
                        <td className="px-5 py-3 text-right">
                          {p > 0n && (
                            <button
                              type="button"
                              onClick={() => onClaim(c.id)}
                              disabled={!canClaim || claiming}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {claiming && claimingId === c.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Receipt className="size-3.5" aria-hidden="true" />}
                              {t("claim")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid content-start gap-4">
          <Receipts payee={seller} active />
          <Panel
            title={t("integration")}
            hint={t("integrationHint")}
            action={
              <a href={`${env.marketingUrl}/docs/meter/quickstart`} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-accent hover:underline">
                {t("quickstart")}
              </a>
            }
          >
            <pre className="overflow-x-auto bg-bg px-5 py-4 font-mono text-[11.5px] leading-relaxed text-fg-muted">
              <code>{snippet}</code>
            </pre>
          </Panel>

          <Panel title={t("recent")} hint={t("recentHint")}>
            {myClaims.length === 0 ? (
              <Empty>{t("recentEmpty")}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {myClaims.slice(0, 6).map((c) => (
                  <li key={c.key} className="tabular flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="font-semibold">{usdc(c.amount)} USDC</span>
                    <span className="text-xs text-fg-muted">
                      {c.vouchersCovered > 0
                        ? t("claimRow", { count: int(c.vouchersCovered), id: c.channelId })
                        : t("claimRowNoCount", { id: c.channelId })}
                    </span>
                    <span className="ml-auto flex flex-col items-end gap-0.5">
                      <TxLink hash={c.tx} />
                      <span className="text-[11px] text-fg-subtle">{clock(c.ts)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
