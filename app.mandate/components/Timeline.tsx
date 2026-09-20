"use client";

/**
 * "Ne oldu?": olaylar teknik adlarıyla değil, düz cümlelerle anlatılır.
 * Art arda gelen kuponlar tek satırda toplanır (bkz. lib/store.ts).
 *
 * Cümleler sözlükte kurulur, parçalardan birleştirilmez: "Ajan" + "ödedi"
 * gibi bir birleştirme Türkçede çekim ekleri, İngilizcede sözcük sırası
 * yüzünden ikisinde birden doğru çıkmaz.
 *
 * İki görünüm: "Canlı" SSE akışıdır (son 160 satır); "Defter" hesabın kalıcı
 * denetim kaydıdır (GET /accounts/:addr/ledger, sayfalı) ve ekran temizlense de
 * eksiksiz durur.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import { clock, usdc } from "@/lib/format";
import { rowsFromEvents, type Row } from "@/lib/store";
import type { LedgerPage } from "@/lib/types";
import { Empty, Panel, SourceTag, TxLink, cn } from "./ui";

type Tone = "ok" | "bad" | "info" | "chain";
type Line = { icon: React.ReactNode; tone: Tone; text: React.ReactNode };
type T = ReturnType<typeof useTranslations<"timeline">>;

const B = ({ children }: { children: React.ReactNode }) => <span className="font-semibold text-fg">{children}</span>;
const C = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-[11px]">{children}</span>;
/** Sözlükteki <b> ve <code> etiketlerinin karşılığı. */
const TAGS = { b: (c: React.ReactNode) => <B>{c}</B>, code: (c: React.ReactNode) => <C>{c}</C> };

function explain(r: Row, perSecond: bigint, t: T): Line {
  switch (r.type) {
    case "channel.opened":
      return { icon: <DoorOpen className="size-4" />, tone: "chain", text: t.rich("opened", { ...TAGS, amount: usdc(r.amount) }) };
    case "channel.topped_up":
      return { icon: <Coins className="size-4" />, tone: "chain", text: t.rich("toppedUp", { ...TAGS, amount: usdc(r.amount) }) };
    case "voucher.accepted": {
      if (r.unit === "second") {
        const seconds = perSecond > 0n ? Number(r.amount / perSecond) : 0;
        return {
          icon: <Radio className="size-4" />,
          tone: "ok",
          text: t.rich("paidSeconds", { ...TAGS, seconds, amount: usdc(r.amount), count: r.count }),
        };
      }
      return {
        icon: <Coins className="size-4" />,
        tone: "ok",
        text: t.rich("paidResource", { ...TAGS, resource: r.text, amount: usdc(r.amount), count: r.count }),
      };
    }
    case "voucher.rejected":
      return {
        icon: <Ban className="size-4" />,
        tone: "bad",
        text:
          r.code === "CHANNEL_EXHAUSTED"
            ? t.rich("exhausted", TAGS)
            : t.rich("rejected", { ...TAGS, reason: describeCode(r.code ?? "") }),
      };
    case "channel.claimed":
      return {
        icon: <Receipt className="size-4" />,
        tone: "chain",
        text: t.rich("settled", { ...TAGS, count: r.count, amount: usdc(r.amount) }),
      };
    case "channel.closed":
      return { icon: <DoorClosed className="size-4" />, tone: "chain", text: t.rich("closedRow", { ...TAGS, amount: usdc(r.amount) }) };
    case "payment.exact":
      return { icon: <Coins className="size-4" />, tone: "chain", text: t.rich("exact", { ...TAGS, amount: usdc(r.amount) }) };
    case "dex.swapped":
      return {
        icon: <ArrowLeftRight className="size-4" />,
        tone: "chain",
        text: t.rich("swapped", {
          ...TAGS,
          sold: usdc(r.amount),
          soldAsset: r.meta.soldAsset,
          bought: usdc(r.meta.bought ?? "0", 2),
          boughtAsset: r.meta.boughtAsset,
        }),
      };
    case "chain.rejected":
      return { icon: <Ban className="size-4" />, tone: "bad", text: t.rich("chainRejected", { ...TAGS, reason: describeCode(r.code ?? "") }) };
    case "stream.started":
      return {
        icon: <Radio className="size-4" />,
        tone: "info",
        text: r.unit === "second" ? t("streamPrice") : t("streamResponse"),
      };
    case "stream.ended": {
      const volume = r.unit === "second" ? t("volumeSeconds", { count: r.count }) : t("volumeTokens", { count: r.count });
      return {
        icon: <Radio className="size-4" />,
        tone: r.code ? "bad" : "info",
        text: r.code
          ? t("streamCut", { reason: describeCode(r.code), amount: usdc(r.amount), volume })
          : t("streamDone", { amount: usdc(r.amount), volume }),
      };
    }
    case "account.frozen":
      return {
        icon: <Snowflake className="size-4" />,
        tone: r.text === "frozen" ? "bad" : "info",
        text: r.text === "frozen" ? t.rich("frozenRow", TAGS) : t("unfrozenRow"),
      };
    case "agent.exited":
      return { icon: <SquareTerminal className="size-4" />, tone: "info", text: t("agentExited", { status: r.text }) };
    default:
      return { icon: <Coins className="size-4" />, tone: "info", text: r.text };
  }
}

const TONE: Record<Tone, string> = {
  ok: "bg-success-bg text-success",
  bad: "bg-danger-bg text-danger",
  info: "bg-surface-3 text-fg-muted",
  chain: "bg-brand-lavender/15 text-brand-lavender",
};

type Tab = "live" | "ledger";
type Filter = "all" | Tone;

const FILTERS: { id: Filter; key: "all" | "offChain" | "onChain" | "blockedF" }[] = [
  { id: "all", key: "all" },
  { id: "ok", key: "offChain" },
  { id: "chain", key: "onChain" },
  { id: "bad", key: "blockedF" },
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
    const timer = setTimeout(() => void load(null), 0);
    return () => clearTimeout(timer);
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
  const t = useTranslations("timeline");
  const tc = useTranslations("common");
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [filter, setFilter] = useState<Filter>("all");
  const ledger = useLedger(account, tab === "ledger");

  const source = tab === "live" ? rows : ledger.rows;
  const lines = source
    .map((r) => ({ r, l: explain(r, perSecond, t) }))
    .filter(({ l }) => filter === "all" || l.tone === filter);

  const emptyText =
    tab === "ledger"
      ? ledger.status === "loading"
        ? t("ledgerLoading")
        : account
          ? t("ledgerEmpty")
          : t("ledgerNoAccount")
      : source.length > 0
        ? t("noMatch")
        : t("empty");

  return (
    <Panel
      title={t("title")}
      hint={t("hint")}
      action={
        <div className="flex shrink-0 rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label={t("viewAria")}>
          {(["live", "ledger"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("rounded-[5px] px-2.5 py-1 transition-colors", tab === id ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
            >
              {t(id)}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {t(f.key)}
          </Chip>
        ))}
        {tab === "ledger" && (
          <button
            type="button"
            onClick={ledger.refresh}
            disabled={ledger.status === "loading"}
            className="ml-auto text-[11px] text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:opacity-50"
          >
            {ledger.status === "loading" ? tc("loading") : tc("refresh")}
          </button>
        )}
      </div>

      {tab === "ledger" && ledger.status === "error" ? (
        <Empty>{t("ledgerError")}</Empty>
      ) : lines.length === 0 ? (
        <Empty>{emptyText}</Empty>
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
                  {r.channelId && <span className="font-mono text-[11px] text-fg-subtle">{t("channelNo", { id: r.channelId })}</span>}
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
                {ledger.status === "loading" ? tc("loading") : tc("older")}
              </button>
            </li>
          )}
        </ol>
      )}
    </Panel>
  );
}
