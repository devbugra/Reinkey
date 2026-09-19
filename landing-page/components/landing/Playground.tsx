"use client";

import { useEffect, useReducer } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ kurallar
 *
 * Hesabın politikası, fiyatlar ve sebep kodları gerçek ürünle (Reinkey
 * Account, channel kontratı, facilitator) AYNI olmalıdır: tanıtım sayfasının
 * uydurma bir mantık göstermesi, ürünü denemiş gibi hissedip başka bir şeyle
 * karşılaşan ziyaretçi üretirdi.
 *
 * BİRİM: 1 = 0.0001 USDC. Tutarlar tamsayıdır; kayan nokta toplamı
 * 0.30000000000000004 gibi değerlerle sınırı yanlış tarafa düşürürdü. Token
 * başına fiyat kesirli olduğu (0.00002 USDC) için akış DİLİM bazında
 * ücretlenir: 50 token = 10 birim.
 */
const POLICY = {
  dailyCap: 50_000, // 5.0000 USDC
  perTxCap: 10_000, // 1.0000 USDC (tek transfer / tek kanal depozitosu)
} as const;
const PAYEES: readonly string[] = ["demo-seller"];

const PRICE = { request: 5, slice: 10 } as const; // slice = 50 token
const SLICE_TOKENS = 50;
const DEPOSIT = 10_000;
const BIG_DEPOSIT = 20_000;

/** Aynı işi x402 `exact` ile yapmanın maliyeti: her kupon bir işlem, ~5 sn. */
const LEDGER_SECONDS = 5;
/** Zincir işlemi gerçekten beklenmez; kısa bir animasyon ve "≈5 sn" etiketi yeter. */
const CHAIN_ANIMATION_MS = 600;
const TOKEN_MS = 40;

/** Ele geçirilmiş ajanın parayı göndermeye çalıştığı kendi adresi. */
const SELF = "agent-01";
const MAX_LINES = 8;

/**
 * Sebep kodları backend ve kontratlarla aynıdır, değiştirilmez.
 * VOUCHER_NOT_INCREASING bu simülasyonda tetiklenmez (kuponları site kendi
 * üretir, eski kupon gönderemez) ama ürünün kod listesinin parçasıdır.
 */
type Code =
  | "DAILY_CAP_EXCEEDED"
  | "PER_TX_CAP_EXCEEDED"
  | "PAYEE_NOT_ALLOWED"
  | "CHANNEL_EXHAUSTED"
  | "CHANNEL_NOT_FOUND"
  | "VOUCHER_NOT_INCREASING";

/**
 * Reinkey Account'ın `__check_auth` kararı. Sıra kontrattaki hata
 * numaralarıyla aynı: alıcı (5), tek işlem (6), günlük tavan (7).
 */
function authorize(payee: string, amount: number, spentToday: number): Code | null {
  if (!PAYEES.includes(payee)) return "PAYEE_NOT_ALLOWED";
  if (amount > POLICY.perTxCap) return "PER_TX_CAP_EXCEEDED";
  if (spentToday + amount > POLICY.dailyCap) return "DAILY_CAP_EXCEEDED";
  return null;
}

/** Tamsayı birimden 4 ondalıklı USDC metni; kayan nokta kullanılmaz. */
const usdc = (units: number) =>
  `${Math.floor(units / 10_000)}.${String(units % 10_000).padStart(4, "0")}`;

/* --------------------------------------------------------------------- durum */

type ChainOp = "open" | "big" | "drain" | "claim";
type Source = "chain" | "facilitator";

type Detail =
  | { kind: "deposit"; amount: number }
  | { kind: "transfer"; amount: number; to: string }
  | { kind: "claim"; count: number; amount: number }
  | { kind: "vouchers"; from: number; to: number; cumulative: number; tokens?: number }
  | { kind: "nothingToClaim" }
  | { kind: "none" };

type Line = {
  id: number;
  /** Protokol metni (yöntem + yol ya da kontrat çağrısı); çevrilmez. */
  label: string;
  source: Source;
  status: "pending" | "ok" | "deny" | "info";
  detail: Detail;
  code?: Code;
  /** Tek satırda birden çok kupon varsa süre "kupon başına" yazılır. */
  batch?: boolean;
};

type Channel = {
  deposit: number;
  /** Son kabul edilen kümülatif kupon tutarı. */
  cumulative: number;
  claimed: number;
  /** Son tahsilattan beri kabul edilen kupon sayısı ("N kupon → 1 işlem"). */
  sinceClaim: number;
};

type Stream = {
  tokens: string[];
  shown: number;
  /** Ödenmiş dilimlerin kapsadığı token sayısı. */
  paidThrough: number;
  slices: number;
  firstVoucher: number;
  lineId: number;
  status: "streaming" | "done" | "cut";
};

type State = {
  channel: Channel | null;
  spentToday: number;
  vouchers: number;
  txs: number;
  paid: number;
  lines: Line[];
  nextId: number;
  pending: { lineId: number; op: ChainOp } | null;
  stream: Stream | null;
};

type Action =
  | { type: "chain"; op: ChainOp }
  | { type: "settle" }
  | { type: "book"; count: number }
  | { type: "chat"; tokens: string[]; instant: boolean }
  | { type: "tick" }
  | { type: "reset" };

const INITIAL: State = {
  channel: null,
  spentToday: 0,
  vouchers: 0,
  txs: 0,
  paid: 0,
  lines: [],
  nextId: 1,
  pending: null,
  stream: null,
};

const isBusy = (s: State) =>
  s.pending !== null || s.stream?.status === "streaming";

function addLine(s: State, line: Omit<Line, "id">): State {
  return {
    ...s,
    lines: [{ ...line, id: s.nextId }, ...s.lines].slice(0, MAX_LINES),
    nextId: s.nextId + 1,
  };
}

function patchLine(s: State, id: number, patch: Partial<Line>): State {
  return {
    ...s,
    lines: s.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  };
}

function streamDetail(st: Stream, cumulative: number): Detail {
  return {
    kind: "vouchers",
    from: st.firstVoucher,
    to: st.firstVoucher + st.slices - 1,
    cumulative,
    tokens: st.shown,
  };
}

/**
 * Akışın bir adımı. Ödenmiş token biterse önce yeni dilim için kupon
 * imzalanır; depozito yetmezse akış olduğu yerde, cümlenin ortasında
 * olsa bile kesilir (CHANNEL_EXHAUSTED).
 */
function tick(s: State): State {
  const st = s.stream;
  const ch = s.channel;
  if (!st || st.status !== "streaming" || !ch) return s;

  let next = s;
  if (st.shown === st.paidThrough) {
    if (ch.cumulative + PRICE.slice > ch.deposit) {
      const stream: Stream = { ...st, status: "cut" };
      return patchLine({ ...s, stream }, st.lineId, {
        status: "deny",
        code: "CHANNEL_EXHAUSTED",
        detail: streamDetail(stream, ch.cumulative),
      });
    }
    next = {
      ...s,
      channel: {
        ...ch,
        cumulative: ch.cumulative + PRICE.slice,
        sinceClaim: ch.sinceClaim + 1,
      },
      vouchers: s.vouchers + 1,
      paid: s.paid + PRICE.slice,
      stream: {
        ...st,
        paidThrough: Math.min(st.tokens.length, st.paidThrough + SLICE_TOKENS),
        slices: st.slices + 1,
      },
    };
  }

  const cur = next.stream as Stream;
  const shown = cur.shown + 1;
  const done = shown >= cur.tokens.length;
  const stream: Stream = { ...cur, shown, status: done ? "done" : "streaming" };
  return patchLine({ ...next, stream }, cur.lineId, {
    status: done ? "ok" : "pending",
    detail: streamDetail(stream, next.channel?.cumulative ?? 0),
  });
}

function reducer(s: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return INITIAL;

    case "chain": {
      if (isBusy(s)) return s;
      const { op } = action;
      const ch = s.channel;
      if (op === "claim" && (!ch || ch.cumulative === ch.claimed)) {
        return addLine(s, {
          label: "channel.claim",
          source: "chain",
          status: "info",
          detail: { kind: "nothingToClaim" },
        });
      }
      const line: Omit<Line, "id"> =
        op === "open"
          ? {
              label: ch ? "channel.top_up" : "channel.open",
              source: "chain",
              status: "pending",
              detail: { kind: "deposit", amount: DEPOSIT },
            }
          : op === "big"
            ? {
                label: "channel.open",
                source: "chain",
                status: "pending",
                detail: { kind: "deposit", amount: BIG_DEPOSIT },
              }
            : op === "drain"
              ? {
                  label: "account.transfer",
                  source: "chain",
                  status: "pending",
                  detail: { kind: "transfer", amount: DEPOSIT, to: SELF },
                }
              : {
                  label: "channel.claim",
                  source: "chain",
                  status: "pending",
                  detail: { kind: "none" },
                };
      const lineId = s.nextId;
      return { ...addLine(s, line), pending: { lineId, op } };
    }

    case "settle": {
      if (!s.pending) return s;
      const { lineId, op } = s.pending;
      const base: State = { ...s, pending: null };

      if (op === "claim") {
        const ch = base.channel as Channel;
        const amount = ch.cumulative - ch.claimed;
        return patchLine(
          {
            ...base,
            txs: base.txs + 1,
            channel: { ...ch, claimed: ch.cumulative, sinceClaim: 0 },
          },
          lineId,
          { status: "ok", detail: { kind: "claim", count: ch.sinceClaim, amount } },
        );
      }

      const payee = op === "drain" ? SELF : "demo-seller";
      const amount = op === "big" ? BIG_DEPOSIT : DEPOSIT;
      const code = authorize(payee, amount, base.spentToday);
      // Reddedilen işlem simülasyonda düşer, zincire yazılmaz: işlem sayısı artmaz.
      if (code) return patchLine(base, lineId, { status: "deny", code });

      const ch = base.channel;
      return patchLine(
        {
          ...base,
          txs: base.txs + 1,
          spentToday: base.spentToday + amount,
          channel: ch
            ? { ...ch, deposit: ch.deposit + amount }
            : { deposit: amount, cumulative: 0, claimed: 0, sinceClaim: 0 },
        },
        lineId,
        { status: "ok" },
      );
    }

    case "book": {
      if (isBusy(s)) return s;
      const { count } = action;
      const label = count === 1 ? "GET /demo/book" : `GET /demo/book ×${count}`;
      const ch = s.channel;
      if (!ch) {
        return addLine(s, {
          label,
          source: "facilitator",
          status: "deny",
          code: "CHANNEL_NOT_FOUND",
          detail: { kind: "none" },
        });
      }
      const room = Math.floor((ch.deposit - ch.cumulative) / PRICE.request);
      const accepted = Math.min(count, room);
      let next = s;
      if (accepted > 0) {
        const cumulative = ch.cumulative + accepted * PRICE.request;
        next = addLine(
          {
            ...s,
            vouchers: s.vouchers + accepted,
            paid: s.paid + accepted * PRICE.request,
            channel: { ...ch, cumulative, sinceClaim: ch.sinceClaim + accepted },
          },
          {
            label,
            source: "facilitator",
            status: "ok",
            batch: accepted > 1,
            detail: {
              kind: "vouchers",
              from: s.vouchers + 1,
              to: s.vouchers + accepted,
              cumulative,
            },
          },
        );
      }
      if (accepted < count) {
        next = addLine(next, {
          label,
          source: "facilitator",
          status: "deny",
          code: "CHANNEL_EXHAUSTED",
          detail: { kind: "none" },
        });
      }
      return next;
    }

    case "chat": {
      if (isBusy(s)) return s;
      const label = "POST /demo/chat";
      if (!s.channel) {
        return addLine(s, {
          label,
          source: "facilitator",
          status: "deny",
          code: "CHANNEL_NOT_FOUND",
          detail: { kind: "none" },
        });
      }
      const stream: Stream = {
        tokens: action.tokens,
        shown: 0,
        paidThrough: 0,
        slices: 0,
        firstVoucher: s.vouchers + 1,
        lineId: s.nextId,
        status: "streaming",
      };
      let next: State = {
        ...addLine(s, {
          label,
          source: "facilitator",
          status: "pending",
          batch: true,
          detail: streamDetail(stream, s.channel.cumulative),
        }),
        stream,
      };
      if (action.instant) {
        while (next.stream?.status === "streaming") next = tick(next);
      }
      return next;
    }

    case "tick":
      return tick(s);
  }
}

/** "Hareketi azalt" açıksa animasyonlar atlanır. Yalnızca olay anında okunur. */
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ----------------------------------------------------------------- bileşen */

export function Playground() {
  const t = useTranslations("playground");
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const busy = isBusy(state);
  const streaming = state.stream?.status === "streaming";
  const pending = state.pending !== null;

  // Zincir işlemi: kısa animasyondan sonra sonuçlanır.
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(
      () => dispatch({ type: "settle" }),
      reducedMotion() ? 0 : CHAIN_ANIMATION_MS,
    );
    return () => window.clearTimeout(id);
  }, [pending]);

  // Akış: her TOKEN_MS'de bir token.
  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), TOKEN_MS);
    return () => window.clearInterval(id);
  }, [streaming]);

  const chat = () =>
    dispatch({
      type: "chat",
      tokens: t("chatText").match(/\S+\s*/g) ?? [],
      instant: reducedMotion(),
    });

  const describe = (line: Line): string => {
    const d = line.detail;
    if (line.status === "deny") {
      return d.kind === "vouchers" && d.tokens
        ? `${line.code} · ${t("trace.tokens", { count: d.tokens })}`
        : (line.code ?? "");
    }
    if (line.status === "pending" && line.source === "chain") {
      return t("trace.pending");
    }
    switch (d.kind) {
      case "deposit":
        return `${t("trace.deposit", { amount: usdc(d.amount) })} → tx`;
      case "transfer":
        return `${usdc(d.amount)} USDC → ${d.to}`;
      case "claim":
        return t("trace.claim", { count: d.count, amount: usdc(d.amount) });
      case "nothingToClaim":
        return t("trace.nothingToClaim");
      case "vouchers": {
        const range =
          d.to > d.from ? `#${d.from}–#${d.to}` : d.to === d.from ? `#${d.from}` : "…";
        const tail = line.status === "pending" ? "…" : "200";
        const tokens =
          d.tokens !== undefined ? ` · ${t("trace.tokens", { count: d.tokens })}` : "";
        return `402 → ${t("trace.voucher")} ${range} (${usdc(d.cumulative)}) → ${tail}${tokens}`;
      }
      case "none":
        return "";
    }
  };

  const duration = (line: Line) =>
    line.status === "info"
      ? "—"
      : line.source === "chain"
        ? t("trace.chainTime")
        : line.batch
          ? t("trace.voucherTimeEach")
          : t("trace.voucherTime");

  // Ekran okuyucuya yalnızca sonuçlanmış son satır duyurulur; akış sırasında
  // her token'da güncellenen satır duyurulsaydı okuyucu susmazdı.
  const settled = state.lines.find((l) => l.status !== "pending");
  const announcement = settled ? `${settled.label}: ${describe(settled)}` : "";

  const exactSeconds = state.vouchers * LEDGER_SECONDS;
  const exactTime =
    exactSeconds < 60
      ? t("counters.seconds", { n: exactSeconds })
      : t("counters.minutes", { n: Math.round(exactSeconds / 60) });

  const ch = state.channel;
  const stream = state.stream;

  return (
    <div className="flex flex-col gap-6">
      {/* --------------------------------------------- sayaç şeridi: bölümün yıldızı */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        <Stat label={t("counters.vouchers")} value={String(state.vouchers)} accent />
        <Stat label={t("counters.txs")} value={String(state.txs)} accent />
        <Stat label={t("counters.paid")} value={`${usdc(state.paid)} USDC`} />
        <Stat
          label={t("counters.exact")}
          value={t("counters.exactValue", { count: state.vouchers, time: exactTime })}
          muted
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ------------------------------------------------ sol: ajan terminali */}
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-[var(--card-shadow)]">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
              <span className="size-2.5 rounded-full bg-fg-subtle/30" />
              <span className="size-2.5 rounded-full bg-fg-subtle/20" />
              <span className="size-2.5 rounded-full bg-fg-subtle/15" />
              <span
                dir="ltr"
                className="ms-3 truncate rounded-full bg-bg px-3 py-1 font-mono text-xs text-fg-subtle"
              >
                {t("agent")} · stellar:testnet
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <Group id="pg-chain" title={t("groups.chain")}>
                <ActionButton
                  code={ch ? "channel.top_up" : "channel.open"}
                  label={ch ? t("actions.topUp") : t("actions.open")}
                  onClick={() => dispatch({ type: "chain", op: "open" })}
                  disabled={busy}
                  active={pending && state.pending?.op === "open"}
                />
                <ActionButton
                  code="channel.claim"
                  label={t("actions.claim")}
                  onClick={() => dispatch({ type: "chain", op: "claim" })}
                  disabled={busy}
                  active={pending && state.pending?.op === "claim"}
                />
                <ActionButton
                  code={`channel.open · ${usdc(BIG_DEPOSIT)}`}
                  label={t("actions.big")}
                  onClick={() => dispatch({ type: "chain", op: "big" })}
                  disabled={busy}
                  active={pending && state.pending?.op === "big"}
                />
                <ActionButton
                  code={`account.transfer → ${SELF}`}
                  label={t("actions.drain")}
                  onClick={() => dispatch({ type: "chain", op: "drain" })}
                  disabled={busy}
                  active={pending && state.pending?.op === "drain"}
                />
              </Group>

              <Group id="pg-seller" title={t("groups.seller")} className="mt-6">
                <ActionButton
                  code="GET /demo/book"
                  label={t("actions.book")}
                  onClick={() => dispatch({ type: "book", count: 1 })}
                  disabled={busy}
                />
                <ActionButton
                  code="GET /demo/book ×100"
                  label={t("actions.book100")}
                  onClick={() => dispatch({ type: "book", count: 100 })}
                  disabled={busy}
                />
                <ActionButton
                  code="POST /demo/chat"
                  label={t("actions.chat")}
                  onClick={chat}
                  disabled={busy}
                  active={streaming}
                  wide
                />
              </Group>

              {/* Akış kutusu: ödenen dilim kadar metin görünür. */}
              <div className="mt-6 rounded-lg border border-line bg-bg">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                  <p className="text-xs font-medium tracking-[0.12em] text-fg-subtle uppercase">
                    {t("stream.title")}
                  </p>
                  {stream && stream.status !== "streaming" ? (
                    <span
                      className={cn(
                        "text-xs",
                        stream.status === "cut" ? "text-danger" : "text-success",
                      )}
                    >
                      {stream.status === "cut" ? t("stream.cut") : t("stream.done")}
                    </span>
                  ) : null}
                </div>
                <p
                  aria-busy={streaming}
                  className="max-h-48 min-h-24 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-fg-muted"
                >
                  {stream ? (
                    <>
                      {stream.tokens.slice(0, stream.shown).join("")}
                      {stream.status === "streaming" ? (
                        <span
                          aria-hidden="true"
                          className="soft-pulse ms-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-accent"
                        />
                      ) : null}
                      {stream.status === "cut" ? (
                        <span dir="ltr" className="ms-1 font-mono text-xs text-danger">
                          ▌ CHANNEL_EXHAUSTED
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-fg-subtle">{t("stream.idle")}</span>
                  )}
                </p>
              </div>

              <p className="mt-5 text-xs text-fg-subtle">{t("disclaimer")}</p>
            </div>
          </div>
        </div>

        {/* ---------------------------------- sağ: politika, sayaçlar, iz, sıfırlama */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-lg border border-line bg-surface-1 p-4">
            <p className="text-xs font-medium tracking-[0.12em] text-fg-subtle uppercase">
              {t("policyTitle")}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <Rule label={t("policy.daily")} value={usdc(POLICY.dailyCap)} />
              <Rule label={t("policy.perTx")} value={usdc(POLICY.perTxCap)} />
              <Rule label={t("policy.payees")} value={PAYEES.join(", ")} />
            </dl>
            <Meter
              className="mt-4"
              label={t("meters.daily")}
              used={state.spentToday}
              max={POLICY.dailyCap}
            />
            {ch ? (
              <Meter
                className="mt-4"
                label={t("meters.channel")}
                used={ch.cumulative}
                max={ch.deposit}
              />
            ) : (
              <p className="mt-4 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-fg-muted">{t("meters.channel")}</span>
                <span className="text-fg-subtle">{t("noChannel")}</span>
              </p>
            )}
          </div>

          <div className="flex flex-1 flex-col rounded-lg border border-line bg-surface-1">
            <p className="px-4 py-3 text-xs font-medium tracking-[0.12em] text-fg-subtle uppercase">
              {t("trace.title")}
            </p>
            {state.lines.length === 0 ? (
              <p className="flex-1 border-t border-line px-4 py-3 text-sm text-fg-subtle">
                {t("trace.empty")}
              </p>
            ) : (
              <ol dir="ltr" className="flex-1 divide-y divide-line border-t border-line">
                {state.lines.map((line) => (
                  <TraceLine
                    key={line.id}
                    line={line}
                    text={describe(line)}
                    duration={duration(line)}
                  />
                ))}
              </ol>
            )}
            <div className="flex justify-end border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={() => dispatch({ type: "reset" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                {t("reset")}
              </button>
            </div>
          </div>

          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- parçalar */

function Stat({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-surface-1 px-5 py-4">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd
        dir="ltr"
        className={cn(
          "mt-1 font-mono font-medium tabular-nums",
          // Karşılaştırma hücresi daha uzun bir metin taşır; tek satırda kalsın.
          muted ? "text-base text-fg-muted sm:text-lg" : "text-xl sm:text-2xl",
          accent && "text-accent-text",
          !accent && !muted && "text-fg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Group({
  id,
  title,
  className,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p
        id={id}
        className="text-xs font-medium tracking-[0.12em] text-fg-subtle uppercase"
      >
        {title}
      </p>
      <ul aria-labelledby={id} className="mt-3 grid gap-2 sm:grid-cols-2">
        {children}
      </ul>
    </div>
  );
}

function ActionButton({
  code,
  label,
  onClick,
  disabled,
  active = false,
  wide = false,
}: {
  code: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <li className={cn(wide && "sm:col-span-2")}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-start transition-colors duration-150 disabled:cursor-not-allowed",
          active
            ? "border-accent/60 bg-surface-2"
            : "border-line hover:border-line-strong disabled:opacity-50",
        )}
      >
        <span dir="ltr" className="font-mono text-xs text-accent-text">
          {code}
        </span>
        <span className={cn("text-sm", active ? "text-fg" : "text-fg-muted")}>
          {label}
        </span>
      </button>
    </li>
  );
}

function TraceLine({
  line,
  text,
  duration,
}: {
  line: Line;
  text: string;
  duration: string;
}) {
  const badge = {
    pending: "…",
    ok: "OK",
    deny: "DENY",
    info: "INFO",
  }[line.status];
  return (
    <li className="px-4 py-3 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-medium",
            line.status === "ok" && "bg-accent/15 text-accent-text",
            line.status === "deny" && "bg-danger-bg text-danger",
            line.status === "pending" && "soft-pulse bg-surface-3 text-fg-muted",
            line.status === "info" && "bg-surface-3 text-fg-subtle",
          )}
        >
          {badge}
        </span>
        <span className="min-w-0 flex-1 truncate text-fg">{line.label}</span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
            line.source === "chain"
              ? "border-accent/40 text-accent-text"
              : "border-line text-fg-subtle",
          )}
        >
          {line.source}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "min-w-0 break-words",
            line.status === "deny" ? "text-danger" : "text-fg-muted",
          )}
        >
          {text}
        </span>
        <span className="shrink-0 text-fg-subtle">{duration}</span>
      </div>
    </li>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd dir="ltr" className="mt-0.5 truncate font-mono text-xs text-fg">
        {value}
      </dd>
    </div>
  );
}

/** Tüketilen bütçe. Dolunca aksan değil tehlike rengi alır: bu bir başarı değil, sınır. */
function Meter({
  label,
  used,
  max,
  className,
}: {
  label: string;
  used: number;
  max: number;
  className?: string;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span dir="ltr" className="font-mono text-fg tabular-nums">
          {usdc(used)} / {usdc(max)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            pct >= 80 ? "bg-danger" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
