/**
 * Panel durumu: olay akışından türetilir.
 *
 * Olaylar tek tek değil, 100 ms'lik paketler hâlinde işlenir (bkz. useFeed):
 * kupon trafiği saniyede yüzlerce olay üretebilir ve her olay için ayrı
 * render ekranı kilitlerdi.
 *
 * Kupon olayları akışta TEK TEK gösterilmez: aynı kanal ve birimden art arda
 * gelenler bir satırda toplanır ("+37 kupon"). Demo anlatısı zaten budur:
 * çok sayıda ödeme, az sayıda zincir işlemi.
 */
import { big } from "./format";
import type {
  AccountSnapshot,
  AgentStatus,
  ChannelSnapshot,
  DemoInfo,
  FeedEvent,
  Source,
  StreamUnit,
} from "./types";

/**
 * Saniye başı fiyat akışının birim fiyatı. Gerçek değer GET /demo/info ile
 * gelir; o gelene kadar BACKEND.md §14.1'deki varsayılan kullanılır.
 */
const DEFAULT_TICKER_PRICE = 1_000n;

export type LogLine = { key: string; line: string; stream: "stdout" | "stderr" };

export type ChannelView = {
  id: string;
  payer: string;
  payee: string;
  deposit: bigint;
  accepted: bigint;
  claimed: bigint;
  open: boolean;
  vouchers: number;
  vouchersSinceClaim: number;
  refunded: bigint | null;
  openedTx: string | null;
  updatedAt: string;
};

export type StreamView = {
  streamId: string;
  channelId: string;
  unit: StreamUnit;
  seconds: number | null;
  slices: number;
  charged: bigint;
  tokens: number | null;
  ended: "done" | "CHANNEL_EXHAUSTED" | "TIMEOUT" | null;
  startedAt: string;
};

export type RejectionView = {
  key: string;
  ts: string;
  code: string;
  source: Source;
  subject: string;
  tx: string | null;
};

export type ClaimView = {
  key: string;
  ts: string;
  channelId: string;
  amount: bigint;
  vouchersCovered: number;
  tx: string;
};

export type SwapView = {
  key: string;
  ts: string;
  account: string;
  sold: bigint;
  soldAsset: string;
  bought: bigint;
  boughtAsset: string;
  tx: string;
};

export type Row = {
  key: string;
  ts: string;
  type: FeedEvent["type"];
  source: Source;
  channelId: string | null;
  count: number;
  amount: bigint;
  unit: string | null;
  code: string | null;
  tx: string | null;
  text: string;
  /** Olaya özgü ek alanlar (ör. takasta alınan tutar). */
  meta: Record<string, string>;
};

/** Ajanın satın aldığı fiyat tik'i. Fiyat yalnızca çizim içindir; para hesabına girmez. */
export type Tick = {
  key: string;
  t: number;
  streamId: string;
  index: number;
  price: number;
  bid: number;
  ask: number;
  ledger: number;
};

export type Local = {
  vouchersAccepted: number;
  vouchersRejected: number;
  chainTxCount: number;
  volume: bigint;
  latencies: number[];
  /** Saniye başı akıştan satın alınan veri süresi. */
  dataSeconds: number;
};

export type State = {
  rows: Row[];
  channels: Record<string, ChannelView>;
  streams: Record<string, StreamView>;
  rejections: RejectionView[];
  claims: ClaimView[];
  swaps: SwapView[];
  ticks: Tick[];
  account: AccountSnapshot | null;
  info: DemoInfo | null;
  agent: AgentStatus & { exitCode: number | null };
  logs: LogLine[];
  local: Local;
  lastEventAt: string | null;
};

export const initialState: State = {
  rows: [],
  channels: {},
  streams: {},
  rejections: [],
  claims: [],
  swaps: [],
  ticks: [],
  account: null,
  info: null,
  agent: { running: false, exitCode: null },
  logs: [],
  local: {
    vouchersAccepted: 0,
    vouchersRejected: 0,
    chainTxCount: 0,
    volume: 0n,
    latencies: [],
    dataSeconds: 0,
  },
  lastEventAt: null,
};

export type Action =
  | { type: "events"; events: FeedEvent[] }
  | { type: "channel.snapshot"; channel: ChannelSnapshot }
  | { type: "account"; account: AccountSnapshot | null }
  | { type: "info"; info: DemoInfo }
  | { type: "agent"; agent: AgentStatus }
  | { type: "reset" };

const MAX_ROWS = 160;
const MAX_REJECTIONS = 40;
const MAX_CLAIMS = 30;
const MAX_LATENCIES = 500;
const MAX_LOGS = 250;
const MAX_TICKS = 300;
const COALESCE_MS = 1500;

function emptyChannel(id: string, ts: string): ChannelView {
  return {
    id,
    payer: "",
    payee: "",
    deposit: 0n,
    accepted: 0n,
    claimed: 0n,
    open: true,
    vouchers: 0,
    vouchersSinceClaim: 0,
    refunded: null,
    openedTx: null,
    updatedAt: ts,
  };
}

function row(e: FeedEvent, over: Partial<Row>): Row {
  return {
    key: e.id,
    ts: e.ts,
    type: e.type,
    source: e.source,
    channelId: "channelId" in e && e.channelId ? e.channelId : null,
    count: 1,
    amount: 0n,
    unit: null,
    code: null,
    tx: "tx" in e ? e.tx : null,
    text: "",
    meta: {},
    ...over,
  };
}

/** Paket boyunca kopyalanmış (değiştirilmesi güvenli) kanal ve yayın kimlikleri. */
type Touched = { channels: Set<string>; streams: Set<string> };

/**
 * Tek bir olayı durum taslağına uygular. `s` bu paket için yüzeysel kopyalanmış
 * taslaktır; iç nesneler yalnızca değişecekleri an kopyalanır (`touched`).
 */
function apply(s: State, e: FeedEvent, touched: Touched) {
  s.lastEventAt = e.ts;
  const ch = (id: string) => {
    if (!touched.channels.has(id)) {
      touched.channels.add(id);
      s.channels[id] = { ...(s.channels[id] ?? emptyChannel(id, e.ts)) };
    }
    return s.channels[id];
  };

  switch (e.type) {
    case "channel.opened": {
      const c = ch(e.channelId);
      c.payer = e.payer;
      c.payee = e.payee;
      c.deposit = big(e.deposit);
      c.open = true;
      c.openedTx = e.tx;
      c.updatedAt = e.ts;
      s.local.chainTxCount++;
      s.rows.unshift(row(e, { amount: c.deposit }));
      break;
    }
    case "channel.topped_up": {
      const c = ch(e.channelId);
      c.deposit = big(e.deposit);
      c.updatedAt = e.ts;
      s.local.chainTxCount++;
      s.rows.unshift(row(e, { amount: big(e.amount) }));
      break;
    }
    case "voucher.accepted": {
      const c = ch(e.channelId);
      const delta = big(e.delta);
      const cum = big(e.cumulative);
      if (cum > c.accepted) c.accepted = cum;
      c.vouchers++;
      c.vouchersSinceClaim++;
      c.updatedAt = e.ts;
      s.local.vouchersAccepted++;
      s.local.volume += delta;
      s.local.latencies.push(e.latencyMs);
      if (s.local.latencies.length > MAX_LATENCIES) s.local.latencies.shift();

      if (e.unit === "second") {
        const perSecond = s.info ? big(s.info.prices.tickerPerSecond) : DEFAULT_TICKER_PRICE;
        if (perSecond > 0n) s.local.dataSeconds += Number(delta / perSecond);
      }

      for (const [id, st] of Object.entries(s.streams)) {
        if (st.channelId === e.channelId && !st.ended && st.unit === e.unit) {
          touched.streams.add(id);
          s.streams[id] = { ...st, slices: st.slices + 1, charged: st.charged + delta };
        }
      }

      const top = s.rows[0];
      if (
        top &&
        top.type === "voucher.accepted" &&
        top.channelId === e.channelId &&
        top.unit === e.unit &&
        Date.parse(e.ts) - Date.parse(top.ts) < COALESCE_MS
      ) {
        s.rows[0] = { ...top, count: top.count + 1, amount: top.amount + delta, ts: e.ts, text: e.resource };
      } else {
        s.rows.unshift(
          row(e, { key: `v-${e.id}`, amount: delta, unit: e.unit, text: e.resource }),
        );
      }
      break;
    }
    case "voucher.rejected": {
      s.local.vouchersRejected++;
      s.rejections.unshift({
        key: e.id,
        ts: e.ts,
        code: e.code,
        source: e.source,
        subject: e.channelId ? `#${e.channelId}` : e.resource,
        tx: null,
      });
      s.rows.unshift(row(e, { code: e.code, text: e.resource }));
      break;
    }
    case "channel.claimed": {
      // Aynı tahsilat hem zincir izleyicisinden hem facilitator'dan gelebilir
      // (eski kayıtlarda böyle çiftler var); kupon sayısını taşıyan kalır.
      const dup = s.claims.findIndex((x) => x.tx === e.tx);
      if (dup !== -1) {
        if (e.vouchersCovered > s.claims[dup].vouchersCovered) {
          s.claims[dup] = { ...s.claims[dup], vouchersCovered: e.vouchersCovered };
          const i = s.rows.findIndex((r) => r.type === "channel.claimed" && r.tx === e.tx);
          if (i !== -1) s.rows[i] = { ...s.rows[i], count: e.vouchersCovered, source: e.source };
        }
        break;
      }
      const c = ch(e.channelId);
      // Tahsil edilen, ödenenden fazla olamaz: tekrar oynatılan olaylar güncel
      // durumun üstüne eklenirse burada kesilir; kesin değer anlık görüntüyle gelir.
      const claimed = c.claimed + big(e.amount);
      c.claimed = c.accepted > 0n && claimed > c.accepted ? c.accepted : claimed;
      c.vouchersSinceClaim = 0;
      c.updatedAt = e.ts;
      s.local.chainTxCount++;
      s.claims.unshift({
        key: e.id,
        ts: e.ts,
        channelId: e.channelId,
        amount: big(e.amount),
        vouchersCovered: e.vouchersCovered,
        tx: e.tx,
      });
      s.rows.unshift(
        row(e, { amount: big(e.amount), count: e.vouchersCovered }),
      );
      break;
    }
    case "channel.closed": {
      const c = ch(e.channelId);
      c.open = false;
      c.refunded = big(e.refunded);
      c.updatedAt = e.ts;
      s.local.chainTxCount++;
      s.rows.unshift(row(e, { amount: big(e.refunded) }));
      break;
    }
    case "payment.exact": {
      s.local.chainTxCount++;
      s.local.volume += big(e.amount);
      s.rows.unshift(row(e, { amount: big(e.amount) }));
      break;
    }
    case "chain.rejected": {
      s.rejections.unshift({
        key: e.id,
        ts: e.ts,
        code: e.code,
        source: "chain",
        subject: e.account,
        tx: e.tx,
      });
      s.rows.unshift(row(e, { code: e.code, text: e.account }));
      break;
    }
    case "stream.started": {
      s.streams[e.streamId] = {
        streamId: e.streamId,
        channelId: e.channelId,
        unit: e.unit ?? "token",
        seconds: null,
        slices: 0,
        charged: 0n,
        tokens: null,
        ended: null,
        startedAt: e.ts,
      };
      s.rows.unshift(
        row(e, { unit: e.unit ?? "token" }),
      );
      break;
    }
    case "stream.ended": {
      const st = s.streams[e.streamId];
      if (st) {
        s.streams[e.streamId] = {
          ...st,
          ended: e.reason,
          tokens: e.tokens,
          seconds: e.seconds ?? (st.unit === "second" ? e.tokens : null),
          charged: big(e.charged),
        };
      }
      const secs = e.seconds ?? (e.unit === "second" ? e.tokens : null);
      s.rows.unshift(
        row(e, {
          amount: big(e.charged),
          code: e.reason === "done" ? null : e.reason,
          unit: e.unit ?? null,
          count: secs ?? e.tokens,
        }),
      );
      break;
    }
    case "dex.swapped": {
      s.local.chainTxCount++;
      s.swaps.unshift({
        key: e.id,
        ts: e.ts,
        account: e.account,
        sold: big(e.sold),
        soldAsset: e.soldAsset,
        bought: big(e.bought),
        boughtAsset: e.boughtAsset,
        tx: e.tx,
      });
      s.rows.unshift(
        row(e, {
          amount: big(e.sold),
          text: `${e.soldAsset} → ${e.boughtAsset}`,
          meta: { bought: e.bought, soldAsset: e.soldAsset, boughtAsset: e.boughtAsset },
        }),
      );
      break;
    }
    case "agent.log": {
      s.logs.push({ key: e.id, line: e.line, stream: e.stream });
      if (s.logs.length > MAX_LOGS) s.logs.splice(0, s.logs.length - MAX_LOGS);
      if (!s.agent.running) s.agent = { ...s.agent, running: true, runId: e.runId, exitCode: null };
      break;
    }
    case "agent.exited": {
      s.agent = { ...s.agent, running: false, exitCode: e.code };
      s.rows.unshift(row(e, { text: e.code === 0 ? "ok" : `exit ${e.code}` }));
      break;
    }
    case "ticker.tick": {
      const price = Number(e.price);
      if (!Number.isFinite(price) || price <= 0) break;
      s.ticks.push({
        key: e.id,
        t: Date.parse(e.ts),
        streamId: e.streamId,
        index: e.index,
        price,
        bid: Number(e.bid),
        ask: Number(e.ask),
        ledger: e.ledger,
      });
      break;
    }
    case "account.frozen": {
      if (s.account && s.account.address === e.account) s.account = { ...s.account, frozen: e.frozen };
      s.rows.unshift(row(e, { text: e.frozen ? "frozen" : "unfrozen" }));
      break;
    }
  }
}

/** Akışta en fazla 6 yayın tutulur; bitenler önce düşer. */
function pruneStreams(streams: Record<string, StreamView>) {
  const list = Object.values(streams).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (list.length <= 6) return streams;
  const keep = list.slice(0, 6);
  return Object.fromEntries(keep.map((s) => [s.streamId, s]));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      // Ekran temizlenir; zincirden okunan hesap, demo bilgisi ve ajan durumu kalır.
      return { ...initialState, account: state.account, info: state.info, agent: state.agent };
    case "account":
      return { ...state, account: action.account };
    case "info":
      return { ...state, info: action.info };
    case "agent":
      return {
        ...state,
        agent: { ...action.agent, exitCode: action.agent.running ? null : state.agent.exitCode },
        logs: action.agent.running && action.agent.runId !== state.agent.runId ? [] : state.logs,
      };
    case "channel.snapshot": {
      const c = action.channel;
      const prev = state.channels[c.id] ?? emptyChannel(c.id, new Date().toISOString());
      const accepted = big(c.lastAccepted);
      return {
        ...state,
        channels: {
          ...state.channels,
          [c.id]: {
            ...prev,
            payer: c.payer,
            payee: c.payee,
            deposit: big(c.deposit),
            claimed: big(c.claimed),
            accepted: accepted > prev.accepted ? accepted : prev.accepted,
            open: c.open,
          },
        },
      };
    }
    case "events": {
      if (action.events.length === 0) return state;
      // Paket başına yüzeysel kopya; kanal, yayın ve satırlar değiştikleri an kopyalanır.
      const s: State = {
        ...state,
        rows: [...state.rows],
        channels: { ...state.channels },
        streams: { ...state.streams },
        rejections: [...state.rejections],
        claims: [...state.claims],
        swaps: [...state.swaps],
        ticks: [...state.ticks],
        logs: [...state.logs],
        local: { ...state.local, latencies: [...state.local.latencies] },
      };
      const touched: Touched = { channels: new Set(), streams: new Set() };
      for (const e of action.events) apply(s, e, touched);
      s.rows = s.rows.slice(0, MAX_ROWS);
      if (s.ticks.length > MAX_TICKS) s.ticks = s.ticks.slice(-MAX_TICKS);
      s.rejections = s.rejections.slice(0, MAX_REJECTIONS);
      s.claims = s.claims.slice(0, MAX_CLAIMS);
      s.swaps = s.swaps.slice(0, MAX_CLAIMS);
      s.streams = pruneStreams(s.streams);
      return s;
    }
  }
}

/** Defter sayfası gibi hazır bir olay listesini (eskiden yeniye) akış satırlarına çevirir. */
export function rowsFromEvents(events: FeedEvent[]): Row[] {
  return reducer(initialState, { type: "events", events }).rows;
}

/** 0..1 arası yüzdelik; boş dizide 0. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
