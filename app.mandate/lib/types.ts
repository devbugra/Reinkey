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
    /** Aynı çiftlerin kontrat adresleri: politika yeniden yazılırken gerekir. */
    pairIds?: [string, string][];
    asset?: string;
    dexFactory?: string | null;
    controller?: string | null;
  };
  /** Hesabın sahibi (G…). Sınırları yalnızca bu anahtar değiştirebilir. */
  owner?: string | null;
  spentToday: string;
  day: number;
  frozen: boolean;
  balance: string;
  balanceXlm?: string;
};

/** GET /demo/info */
export type DemoInfo = {
  network: string;
  /** Cüzdanla imzalı işlemler için: zincire doğrudan bağlanma bilgisi. */
  networkPassphrase?: string;
  rpcUrl?: string;
  explorerTxBase: string;
  account: string;
  seller: string;
  channelContract: string;
  usdc: string;
  xlm: string;
  dexPair: string;
  dexRouter?: string | null;
  dexFactory?: string | null;
  /** Dağıtılmış hesap kodunun hash'i: konsol bununla yeni hesap kurar. */
  accountWasm?: string | null;
  /** Backend'de DEMO_CONTROLS açık mı (ajan başlatma, dondurma). */
  demoControls?: boolean;
  prices: { bookPerRequest: string; tickerPerSecond: string; chatPerToken: string };
};

/** GET /demo/agent */
export type AgentStatus = { running: boolean; runId?: string; scenario?: Scenario };
export type Scenario = "trader" | "compromised" | "injected";

/** GET /accounts/:addr/ledger: denetim defteri, yeniden eskiye, sayfalı. */
export type LedgerPage = { events: FeedEvent[]; nextCursor: string | null };

/** POST /channels/:id/claim */
export type ClaimResult = { claimed?: boolean; reason?: string; tx?: string };

/** GET /float: Reinkey Float (kredi havuzu). Tutarlar 7 ondalıklı taban birim, string. */
export type FloatPool = {
  pool: string;
  config: { admin: string; liqThresholdBps: number; profitShareBps: number; maxPriceAgeSeconds: number; oracle: string | null; pair: string | null };
  totalShares: string;
  totalAssets: string;
  totalDebt: string;
  idle: string;
  sharePrice: string;
  price: string;
  utilizationBps: number;
  ledger: number;
  asOf: string;
};
export type FloatLine = {
  account: string;
  open: boolean;
  debt: string;
  beneficiary: string;
  value: string;
  usdc: string;
  xlm: string;
  price: string;
  liquidatable: boolean;
  healthBps: number | null;
  liqThresholdBps: number;
};
export type FloatPosition = { address: string; shares: string; value: string; shareOfPoolBps: number; sharePrice: string };
export type FloatSample = { ts: string; sharePrice: string; totalAssets: string; totalDebt: string; price: string };
export type FloatOverview =
  | { enabled: false }
  | { enabled: true; pool: FloatPool; lines: FloatLine[]; positions: FloatPosition[]; history: FloatSample[] };

/** GET /sellers/:payTo/revenue: Meter satıcı finansı. Tutarlar taban birim, string. */
export type RevenueReport = {
  payTo: string;
  window: { since: string; days: number; bucket: "hour" | "day" };
  totals: {
    earned: string;
    settled: string;
    receivable: string;
    payments: number;
    settlements: number;
    paymentsPerSettlement: number | null;
    buyers: number;
  };
  byResource: { resource: string; unit: string; payments: number; buyers: number; amount: string }[];
  series: { t: string; earned: string; settled: string; payments: number }[];
  receivables: {
    channelId: string;
    payer: string;
    amount: string;
    vouchers: number;
    open: boolean;
    lastVoucherAt: string | null;
    ageSeconds: number | null;
    expiresInSeconds: number | null;
  }[];
  settlements: { tx: string; at: string; channelId: string; payer: string; amount: string; paymentsCovered: number }[];
};

/** GET /receipts: imzalı makbuz (bkz. backend/src/audit/receipt.ts). */
export type Receipt = {
  v: 1;
  network: string;
  signer: string;
  id: string;
  channelId: string;
  payer: string;
  payee: string;
  resource: string;
  method: string;
  unit: string;
  amount: string;
  cumulative: string;
  requestHash: string | null;
  responseHash?: string | null;
  attestedAt?: string | null;
  ts: string;
  signature: string;
};

/** GET /dex/quote: rota, fiyat etkisi ve politika ön kararı. */
export type DexSide = "USDC_XLM" | "XLM_USDC";
export type DexQuote = {
  pair: string;
  side: DexSide;
  sell: { asset: string; contract: string };
  buy: { asset: string; contract: string };
  amountIn: string;
  amountOut: string;
  minOut: string;
  slippageBps: number;
  price: { execution: string; pool: string; conservative: string | null; impactBps: number };
  liquidity: { source: string; pair: string; reserveUsdc: string; reserveXlm: string; ledger: number };
  call: { contract: string | null; method: string; args: Record<string, string | string[]> };
  policy: {
    allowed: boolean;
    code: string | null;
    message: string | null;
    caps: { perTxCap: string; dailyCap: string; spentToday: string; remainingToday: string; counted: string } | null;
  };
};
