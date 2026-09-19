"use client";

/**
 * "Ne oldu?": olaylar teknik adlarıyla değil, düz cümlelerle anlatılır.
 * Art arda gelen kuponlar tek satırda toplanır (bkz. lib/store.ts).
 *
 * İki görünüm: "Canlı" SSE akışıdır (son 160 satır); "Defter" hesabın kalıcı
 * denetim kaydıdır (GET /accounts/:addr/ledger, sayfalı) ve ekran temizlense de
 * eksiksiz durur.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  Coins,
  DoorClosed,
  DoorOpen,
  Radio,
  Receipt,
  Snowflake,
  SquareTerminal,
} from "lucide-react";
import { getJson } from "@/lib/api";
import { describeCode } from "@/lib/codes";
import { clock, int, usdc } from "@/lib/format";
import { rowsFromEvents, type Row } from "@/lib/store";
import type { LedgerPage } from "@/lib/types";
import { Empty, Panel, SourceTag, TxLink, cn } from "./ui";

type Line = { icon: React.ReactNode; tone: "ok" | "bad" | "info" | "chain"; text: React.ReactNode };

const B = ({ children }: { children: React.ReactNode }) => <span className="font-semibold text-fg">{children}</span>;

function explain(r: Row, perSecond: bigint): Line {
  switch (r.type) {
    case "channel.opened":
      return {
        icon: <DoorOpen className="size-4" />,
        tone: "chain",
        text: <>Ajan <B>{usdc(r.amount)} USDC</B> kilitleyerek ödeme kanalı açtı.</>,
      };
    case "channel.topped_up":
      return { icon: <Coins className="size-4" />, tone: "chain", text: <>Ajan kanala <B>{usdc(r.amount)} USDC</B> ekledi.</> };
    case "voucher.accepted": {
      const n = <B>{int(r.count)} ödeme</B>;
      if (r.unit === "second") {
        const secs = perSecond > 0n ? Number(r.amount / perSecond) : 0;
        return {
          icon: <Radio className="size-4" />,
          tone: "ok",
          text: <>Ajan <B>{int(secs)} saniyelik</B> fiyat verisi için <B>{usdc(r.amount)} USDC</B> ödedi · {n}, zincire gitmeden.</>,
        };
      }
      return {
        icon: <Coins className="size-4" />,
        tone: "ok",
        text: <>Ajan <span className="font-mono text-[11px]">{r.text}</span> için <B>{usdc(r.amount)} USDC</B> ödedi · {n}, zincire gitmeden.</>,
      };
    }
    case "voucher.rejected":
      return {
        icon: <Ban className="size-4" />,
        tone: "bad",
        text:
          r.code === "CHANNEL_EXHAUSTED" ? (
            <>Depozito bitti; <B>veri akışı anında kesildi.</B></>
          ) : (
            <>Ödeme reddedildi: <B>{describeCode(r.code ?? "")}</B>.</>
          ),
      };
    case "channel.claimed":
      return {
        icon: <Receipt className="size-4" />,
        tone: "chain",
        text: <>Borsa <B>{int(r.count)} ödemeyi tek zincir işlemiyle</B> tahsil etti: <B>{usdc(r.amount)} USDC</B>.</>,
      };
    case "channel.closed":
      return {
        icon: <DoorClosed className="size-4" />,
        tone: "chain",
        text: <>Kanal kapandı; kullanılmayan <B>{usdc(r.amount)} USDC</B> ajana iade edildi.</>,
      };
    case "payment.exact":
      return { icon: <Coins className="size-4" />, tone: "chain", text: <>Tek seferlik ödeme: <B>{usdc(r.amount)} USDC</B>.</> };
    case "dex.swapped":
      return {
        icon: <ArrowLeftRight className="size-4" />,
        tone: "chain",
        text: (
          <>
            Ajan DEX&apos;te <B>{usdc(r.amount)} {r.meta.soldAsset}</B> verip{" "}
            <B>{usdc(r.meta.bought ?? "0", 2)} {r.meta.boughtAsset}</B> aldı. Sınırlar içinde olduğu için zincir izin verdi.
          </>
        ),
      };
    case "chain.rejected":
      return {
        icon: <Ban className="size-4" />,
        tone: "bad",
        text: <><B>Zincir işlemi engelledi:</B> {describeCode(r.code ?? "")}.</>,
      };
    case "stream.started":
      return {
        icon: <Radio className="size-4" />,
        tone: "info",
        text: r.unit === "second" ? <>Ajan borsanın canlı fiyat akışına bağlandı.</> : <>Ajan yanıt akışına bağlandı.</>,
      };
    case "stream.ended":
      return {
        icon: <Radio className="size-4" />,
        tone: r.code ? "bad" : "info",
        text: r.code ? (
          <>Akış kesildi ({describeCode(r.code)}) · {r.text}, toplam <B>{usdc(r.amount)} USDC</B>.</>
        ) : (
          <>Akış tamamlandı · {r.text}, toplam <B>{usdc(r.amount)} USDC</B>.</>
        ),
      };
    case "account.frozen":
      return {
        icon: <Snowflake className="size-4" />,
        tone: r.text === "frozen" ? "bad" : "info",
        text: r.text === "frozen" ? <><B>Sahip ajanı dondurdu.</B> Sonraki işlemleri zincir reddedecek.</> : <>Sahip dondurmayı kaldırdı.</>,
      };
    case "agent.exited":
      return { icon: <SquareTerminal className="size-4" />, tone: "info", text: <>Ajan senaryosu bitti ({r.text}).</> };
    default:
      return { icon: <Coins className="size-4" />, tone: "info", text: r.text };
  }
}

const TONE: Record<Line["tone"], string> = {
  ok: "bg-success-bg text-success",
  bad: "bg-danger-bg text-danger",
  info: "bg-surface-3 text-fg-muted",
  chain: "bg-brand-lavender/15 text-brand-lavender",
};

type Tab = "live" | "ledger";
type Filter = "all" | Line["tone"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "ok", label: "Zincir dışı ödeme" },
  { id: "chain", label: "Zincir işlemi" },
  { id: "bad", label: "Engellenen" },
];

/** Defter sayfaları. Her sayfa kendi içinde satırlara çevrilir; sayfalar yeniden eskiye eklenir. */
function useLedger(account: string | null, active: boolean) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const load = useCallback(
    async (from: string | null) => {
      if (!account) return;
      setStatus("loading");
      const page = await getJson<LedgerPage>(`/accounts/${account}/ledger?limit=100${from ? `&cursor=${from}` : ""}`);
      if (!page) return setStatus("error");
      const next = rowsFromEvents([...page.events].reverse());
      setRows((prev) => (from ? [...prev, ...next] : next));
      setCursor(page.nextCursor);
      setStatus("idle");
    },
    [account],
  );

  useEffect(() => {
    if (!active) return;
    // Sekme her açıldığında ilk sayfa tazelenir.
    const t = setTimeout(() => void load(null), 0);
    return () => clearTimeout(t);
  }, [active, load]);

  return { rows, status, hasMore: cursor !== null, more: () => void load(cursor), refresh: () => void load(null) };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function Timeline({
  rows,
  perSecond,
  account,
  defaultTab = "live",
}: {
  rows: Row[];
  perSecond: bigint;
  account: string | null;
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [filter, setFilter] = useState<Filter>("all");
  const ledger = useLedger(account, tab === "ledger");

  const source = tab === "live" ? rows : ledger.rows;
  const lines = source
    .map((r) => ({ r, l: explain(r, perSecond) }))
    .filter(({ l }) => filter === "all" || l.tone === filter);

  return (
    <Panel
      title="Ne oldu?"
      hint="En yeni üstte · mor: zincir işlemi · yeşil: zincire gitmeyen ödeme · kırmızı: engellenen"
      action={
        <div className="flex shrink-0 rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label="Görünüm">
          {(
            [
              ["live", "Canlı"],
              ["ledger", "Defter"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("rounded-[5px] px-2.5 py-1 transition-colors", tab === id ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
        {tab === "ledger" && (
          <button
            type="button"
            onClick={ledger.refresh}
            disabled={ledger.status === "loading"}
            className="ml-auto text-[11px] text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:opacity-50"
          >
            {ledger.status === "loading" ? "Yükleniyor…" : "Yenile"}
          </button>
        )}
      </div>

      {tab === "ledger" && ledger.status === "error" ? (
        <Empty>Defter okunamadı. Backend çalışıyor mu?</Empty>
      ) : lines.length === 0 ? (
        <Empty>
          {tab === "ledger"
            ? ledger.status === "loading"
              ? "Defter okunuyor…"
              : account
                ? "Bu hesap için kayıt yok."
                : "Demo hesabı henüz okunmadı."
            : source.length > 0
              ? "Bu filtreye uyan olay yok."
              : 'Henüz olay yok. "Ajanı başlat" düğmesine basın.'}
        </Empty>
      ) : (
        <ol
          className="max-h-[520px] divide-y divide-line overflow-y-auto"
          aria-live={tab === "live" ? "polite" : "off"}
          aria-relevant="additions"
        >
          {lines.map(({ r, l }) => (
            <li key={r.key} className={cn("flex items-start gap-3 px-5 py-3", tab === "live" && "row-in", l.tone === "bad" && "bg-danger-bg/30")}>
              <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", TONE[l.tone])} aria-hidden="true">
                {l.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-fg-muted">{l.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="tabular font-mono text-[11px] text-fg-subtle">{clock(r.ts)}</span>
                  {r.channelId && <span className="font-mono text-[11px] text-fg-subtle">kanal #{r.channelId}</span>}
                  <TxLink hash={r.tx} />
                </p>
              </div>
              <SourceTag source={r.source} />
            </li>
          ))}
          {tab === "ledger" && ledger.hasMore && (
            <li className="px-5 py-3 text-center">
              <button
                type="button"
                onClick={ledger.more}
                disabled={ledger.status === "loading"}
                className="text-xs text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:opacity-50"
              >
                {ledger.status === "loading" ? "Yükleniyor…" : "Daha eski kayıtlar"}
              </button>
            </li>
          )}
        </ol>
      )}
    </Panel>
  );
}
