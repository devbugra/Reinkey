/** Hatlar arası ortak tipler (docs/BACKEND.md §3, §5, §9). */

export type Unit = "request" | "token" | "second";
export type Source = "gateway" | "facilitator" | "chain";

/** x402 402 yanıtındaki `accepts` girdisi (channel şeması). */
export type ChannelRequirement = {
  scheme: "channel";
  network: string;
  asset: string;
  payTo: string;
  /** Taban birimde tamsayı, string. */
  amount: string;
  unit: Unit;
  resource?: string;
  description?: string;
  extra: {
    channelContract: string;
    minDeposit?: string;
    facilitator?: string;
    areFeesSponsored?: boolean;
    [k: string]: unknown;
  };
};

export type ExactRequirement = {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  resource?: string;
  [k: string]: unknown;
};

export type PaymentRequirement = ChannelRequirement | ExactRequirement;

export type PaymentRequired = {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirement[];
};

/** x402 ödeme yükü (channel şeması). */
export type ChannelPayload = {
  x402Version: number;
  scheme: "channel";
  network: string;
  payload: { channelId: string; cumulative: string; signature: string };
};

/** Başarılı yanıttaki makbuz. */
export type ChannelReceipt = {
  scheme: "channel";
  channelId: string;
  accepted: string;
  delta: string;
  remaining: string;
  latencyMs?: number;
};

export type ErrorBody = {
  error: string;
  source: Source;
  message?: string;
  tx?: string;
};

export type ChannelSnapshot = {
  id: string;
  payer: string;
  payee: string;
  asset?: string;
  deposit: string;
  claimed: string;
  lastAccepted: string;
  expiryLedger: number;
  open: boolean;
};

export function isChannelRequirement(r: PaymentRequirement): r is ChannelRequirement {
  return r.scheme === "channel";
}
