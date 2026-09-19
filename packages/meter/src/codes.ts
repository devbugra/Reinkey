// Zincir dışı sebep kodları ve HTTP durumları. Backend'deki tabloyla
// (backend/src/common/reason-codes.ts) aynı olmalıdır: isimleri değiştirme.

export type ErrorSource = "gateway" | "facilitator" | "chain";

export const REASON_STATUS: Record<string, number> = {
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
  CHAIN_UNAVAILABLE: 503,
  // Yalnızca bu pakette: facilitator'a HTTP ile ulaşılamadı.
  FACILITATOR_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Bilinmeyen bir ret kodu ödeme reddi sayılır (402). */
export function statusForCode(code: string): number {
  return REASON_STATUS[code] ?? 402;
}
