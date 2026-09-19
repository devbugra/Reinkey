// Sebep kodları (BACKEND.md §3.3). Hatlar arası sözleşme: isimleri değiştirme.

export type ErrorSource = 'gateway' | 'facilitator' | 'chain';

/** Zincir dışı kodlar ve HTTP durumları. */
export const OFFCHAIN_CODES = {
  PAYMENT_REQUIRED: 402,
  PAYMENT_MALFORMED: 400,
  CHANNEL_NOT_FOUND: 402,
  CHANNEL_CLOSED: 402,
  CHANNEL_EXPIRING: 402,
  WRONG_PAYEE: 402,
  WRONG_ASSET: 402,
  VOUCHER_BAD_SIGNATURE: 402,
  VOUCHER_NOT_INCREASING: 402,
  VOUCHER_UNDERPAID: 402,
  CHANNEL_EXHAUSTED: 402,
  ACCOUNT_FROZEN: 402,
  RATE_LIMITED: 429,
  STREAM_NOT_FOUND: 404,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CHAIN_UNAVAILABLE: 503,
  PRICE_SOURCE_UNAVAILABLE: 503,
  AGENT_BUSY: 409,
  NOT_SUPPORTED: 400,
  REPORT_NOT_VERIFIED: 422,
  INTERNAL: 500,
} as const;

export type OffchainCode = keyof typeof OFFCHAIN_CODES;

/** Kontrat hata numaraları → kod. `source: chain` ile raporlanır. */
export const REINKEY_ACCOUNT_ERRORS: Record<number, string> = {
  1: 'BAD_SIGNATURE',
  2: 'POLICY_EXPIRED',
  3: 'ACCOUNT_FROZEN',
  4: 'CONTEXT_NOT_ALLOWED',
  5: 'PAYEE_NOT_ALLOWED',
  6: 'PER_TX_CAP_EXCEEDED',
  7: 'DAILY_CAP_EXCEEDED',
  8: 'PAIR_NOT_ALLOWED',
  9: 'SLIPPAGE_UNBOUNDED',
  10: 'CONTROLLER_LOCKED',
  11: 'CONTROLLER_MISMATCH',
};

export const CHANNEL_ERRORS: Record<number, string> = {
  20: 'CHANNEL_NOT_FOUND',
  21: 'CHANNEL_CLOSED',
  22: 'VOUCHER_BAD_SIGNATURE',
  23: 'VOUCHER_NOT_INCREASING',
  24: 'EXCEEDS_DEPOSIT',
  25: 'NOT_EXPIRED',
  26: 'NOT_AUTHORIZED',
  // Kontratta var, BACKEND.md tablosunda yok.
  27: 'INVALID_ARGUMENT',
};

export const CREDIT_POOL_ERRORS: Record<number, string> = {
  40: 'INVALID_AMOUNT',
  41: 'INSUFFICIENT_SHARES',
  42: 'INSUFFICIENT_LIQUIDITY',
  43: 'LINE_EXISTS',
  44: 'LINE_NOT_FOUND',
  45: 'NOT_CONTROLLER',
  46: 'NOT_LIQUIDATABLE',
  47: 'PRICE_UNAVAILABLE',
  48: 'INSUFFICIENT_USDC',
  49: 'POOL_NOT_AUTHORIZED',
};

/** Numaralar çakışmadığı için tek tabloda birleşir. */
export const CHAIN_ERRORS: Record<number, string> = {
  ...REINKEY_ACCOUNT_ERRORS,
  ...CHANNEL_ERRORS,
  ...CREDIT_POOL_ERRORS,
};

export function chainCodeFromNumber(n: number): string {
  return CHAIN_ERRORS[n] ?? `CONTRACT_ERROR_${n}`;
}

/** Simülasyon/işlem hata metninden `Error(Contract, #N)` değerini çıkarır. */
export function parseContractError(text: string): number | undefined {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  return m ? Number(m[1]) : undefined;
}
