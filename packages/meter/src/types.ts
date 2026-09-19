// Express'e çalışma zamanı bağımlılığı yok: middleware yalnızca aşağıdaki
// yapısal alanlara dokunur. Express, Nest (platform-express) ve Connect uyar.

import type { HeaderBag } from "./headers.ts";

export interface MeterRequest {
  headers: HeaderBag;
  /** Express: mount yolunu da içeren özgün URL. Yoksa `url` kullanılır. */
  originalUrl?: string;
  url?: string;
  /** Express: `trust proxy` ayarına saygı duyar. */
  protocol?: string;
  /** node:http soketi; TLS ise `encrypted` alanı vardır. Yapısal uyum için `object`. */
  socket?: object | null;
  payment?: PaymentReceipt;
}

export interface MeterResponse {
  setHeader(name: string, value: string): unknown;
  /** Express tarzı. Yoksa `statusCode` + `end` kullanılır (Connect / node:http). */
  status?(code: number): { json(body: unknown): unknown };
  statusCode?: number;
  end?(chunk?: string): unknown;
}

export type MeterNext = (err?: unknown) => void;

export type MeterMiddleware = (
  req: MeterRequest,
  res: MeterResponse,
  next: MeterNext,
) => Promise<void>;

/** `channel` şeması makbuzu (facilitator `/verify` → `receipt`). */
export interface ChannelReceipt {
  scheme: "channel";
  channelId: string;
  /** Kabul edilen kümülatif tutar. */
  accepted: string;
  /** Bu çağrıda tahsil edilen artış. */
  delta: string;
  /** Depozitodan kalan. */
  remaining: string;
  latencyMs: number;
}

export type PaymentReceipt = ChannelReceipt | (Record<string, unknown> & { scheme?: string });

/** Ödemesi doğrulanmış istek: `req.payment` makbuzu taşır. */
export type PaidRequest<R = MeterRequest> = R & { payment?: PaymentReceipt };
