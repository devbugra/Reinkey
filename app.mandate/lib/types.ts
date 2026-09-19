/**
 * Backend olay ve yanıt tipleri.
 * v4: saniye başı fiyat akışı (unit: second) ve DEX işlemleri (dex.swapped), BACKEND.md §14.
 *
 * TEK KAYNAK: docs/BACKEND.md §8.2 (olaylar), §8.4 (/stats), §9 (/channels/:id).
 * Tutarlar USDC taban birimiyle (7 ondalık) STRING olarak gelir; hesap her
 * zaman BigInt ile yapılır, number'a çevrilmez.
 */

export type Source = "gateway" | "facilitator" | "chain";

type Base<T extends string, D> = {
  id: string;
  type: T;
  source: Source;
  ts: string;
} & D;

export type ChannelOpened = Base<
  "channel.opened",
  { channelId: string; payer: string; payee: string; deposit: string; expiryLedger: number; tx: string }
>;
export type ChannelToppedUp = Base<
  "channel.topped_up",
  { channelId: string; amount: string; deposit: string; tx: string }
>;
export type VoucherAccepted = Base<
  "voucher.accepted",
  { channelId: string; cumulative: string; delta: string; unit: "request" | "token" | "second"; latencyMs: number; resource: string }
>;
export type VoucherRejected = Base<
  "voucher.rejected",
  { channelId?: string; code: string; resource: string }
>;
export type ChannelClaimed = Base<
  "channel.claimed",
  { channelId: string; amount: string; vouchersCovered: number; tx: string }
>;
export type ChannelClosed = Base<
  "channel.closed",
  { channelId: string; refunded: string; tx: string }
>;
export type PaymentExact = Base<
  "payment.exact",
  { payer: string; payee: string; amount: string; tx: string }
>;
export type ChainRejected = Base<
  "chain.rejected",
  { account: string; code: string; tx: string }
>;
export type StreamUnit = "token" | "second";
export type StreamStarted = Base<
  "stream.started",
  { streamId: string; channelId: string; unit?: StreamUnit }
>;
export type StreamEnded = Base<
  "stream.ended",
  {
    streamId: string;
    reason: "done" | "CHANNEL_EXHAUSTED" | "TIMEOUT";
    tokens: number;
    /** Saniye akışında geçen saniye (BACKEND.md §14.1). */
    seconds?: number;
    unit?: StreamUnit;
    charged: string;
  }
>;
export type DexSwapped = Base<
  "dex.swapped",
  { account: string; sold: string; soldAsset: string; bought: string; boughtAsset: string; tx: string }
>;

export type AgentLog = Base<"agent.log", { runId: string; line: string; stream: "stdout" | "stderr" }>;
export type AgentExited = Base<"agent.exited", { runId: string; code: number | null }>;
export type AccountFrozen = Base<"account.frozen", { account: string; frozen: boolean; tx: string }>;

/**
 * Ajana satılan fiyat tik'inin kopyası. Geçici olaydır: yalnızca canlı akışta
 * gelir, yeniden bağlanınca tekrar gönderilmez (BACKEND.md §8.2 EK).
 */
export type TickerTick = Base<
  "ticker.tick",
  { streamId: string; channelId: string; pair: string; price: string; bid: string; ask: string; ledger: number; index: number; paidThrough: number }
>;

export type FeedEvent =
  | ChannelOpened
  | ChannelToppedUp
  | VoucherAccepted
  | VoucherRejected
  | ChannelClaimed
  | ChannelClosed
  | PaymentExact
  | ChainRejected
  | StreamStarted
  | StreamEnded
  | DexSwapped
  | AgentLog
  | AgentExited
  | AccountFrozen
  | TickerTick;

export type EventType = FeedEvent["type"];

export const EVENT_TYPES: EventType[] = [
  "channel.opened",
  "channel.topped_up",
  "voucher.accepted",
  "voucher.rejected",
  "channel.claimed",
  "channel.closed",
  "payment.exact",
  "chain.rejected",
  "stream.started",
  "stream.ended",
  "dex.swapped",
  "agent.log",
  "agent.exited",
  "account.frozen",
  "ticker.tick",
];

export type Stats = {
  vouchersAccepted: number;
  vouchersRejected: number;
  chainTxCount: number;
  volume: string;
  channelsOpen: number;
  exactEquivalent: { txCount: number; seconds: number };
  medianVoucherLatencyMs: number;
};

/** GET /channels/:id yanıtı. */
export type ChannelSnapshot = {
  id: string;
  payer: string;
  payee: string;
  deposit: string;
  claimed: string;
  lastAccepted: string;
  expiryLedger: number;
  open: boolean;
};

/** GET /accounts/:addr yanıtı (BACKEND.md §4 AccountState). */
export type AccountSnapshot = {
  address: string;
  policy: {
    agentKey: string;
    perTxCap: string;
    dailyCap: string;
    payees: string[];
    channel: string;
    expiresLedger: number;
    /** v4 DEX kuralı (proje-tanimi.md §3.7). Backend bu alanı henüz dönmeyebilir. */
    dexRouter?: string | null;
    /** İzinli (satılan, alınan) çiftler, ör. "USDC→XLM". */
    pairs?: string[];
  };
  spentToday: string;
  day: number;
  frozen: boolean;
  balance: string;
  balanceXlm?: string;
};

/** GET /demo/info */
export type DemoInfo = {
  network: string;
  explorerTxBase: string;
  account: string;
  seller: string;
  channelContract: string;
  usdc: string;
  xlm: string;
  dexPair: string;
  /** Backend'de DEMO_CONTROLS açık mı (ajan başlatma, dondurma). */
  demoControls?: boolean;
  prices: { bookPerRequest: string; tickerPerSecond: string; chatPerToken: string };
};

/** GET /demo/agent */
export type AgentStatus = { running: boolean; runId?: string; scenario?: "trader" | "compromised" };

/** GET /accounts/:addr/ledger: denetim defteri, yeniden eskiye, sayfalı. */
export type LedgerPage = { events: FeedEvent[]; nextCursor: string | null };

/** POST /channels/:id/claim */
export type ClaimResult = { claimed?: boolean; reason?: string; tx?: string };
