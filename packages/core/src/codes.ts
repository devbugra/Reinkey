/**
 * Sebep kodları. Zincir tarafı kontratlardaki `#[contracterror]` enum'larıyla,
 * zincir dışı taraf docs/BACKEND.md §3.3 ile aynı olmalıdır.
 */

/** contracts/reinkey-account/src/lib.rs → Error */
export const ACCOUNT_ERRORS = {
  1: "BAD_SIGNATURE",
  2: "POLICY_EXPIRED",
  3: "ACCOUNT_FROZEN",
  4: "CONTEXT_NOT_ALLOWED",
  5: "PAYEE_NOT_ALLOWED",
  6: "PER_TX_CAP_EXCEEDED",
  7: "DAILY_CAP_EXCEEDED",
  8: "PAIR_NOT_ALLOWED",
  9: "SLIPPAGE_UNBOUNDED",
} as const;

/** contracts/channel/src/lib.rs → Error */
export const CHANNEL_ERRORS = {
  20: "CHANNEL_NOT_FOUND",
  21: "CHANNEL_CLOSED",
  22: "VOUCHER_BAD_SIGNATURE",
  23: "VOUCHER_NOT_INCREASING",
  24: "EXCEEDS_DEPOSIT",
  25: "NOT_EXPIRED",
  26: "NOT_AUTHORIZED",
  27: "INVALID_ARGUMENT",
} as const;

export const CHAIN_ERRORS: Record<number, string> = { ...ACCOUNT_ERRORS, ...CHANNEL_ERRORS };

/** Zincir dışı (facilitator / gateway) kodlar. */
export const OFFCHAIN_CODES = [
  "PAYMENT_REQUIRED",
  "PAYMENT_MALFORMED",
  "CHANNEL_NOT_FOUND",
  "CHANNEL_CLOSED",
  "CHANNEL_EXPIRING",
  "WRONG_PAYEE",
  "WRONG_ASSET",
  "VOUCHER_BAD_SIGNATURE",
  "VOUCHER_NOT_INCREASING",
  "VOUCHER_UNDERPAID",
  "CHANNEL_EXHAUSTED",
  "RATE_LIMITED",
] as const;

export type OffchainCode = (typeof OFFCHAIN_CODES)[number];
export type ChainCode = (typeof CHAIN_ERRORS)[number] | string;

/** `Error(Contract, #7)` gibi bir metinden kod adını çıkarır. */
export function codeFromChainError(text: string): string | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  if (m) return CHAIN_ERRORS[Number(m[1])] ?? `CONTRACT_${m[1]}`;
  // Geçersiz ed25519 imzasında host işlemi kendisi durdurur; kontrat kodu görünmez.
  if (/Error\(Crypto, InvalidInput\)/.test(text)) return "BAD_SIGNATURE";
  return null;
}

export function chainCodeName(code: number): string {
  return CHAIN_ERRORS[code] ?? `CONTRACT_${code}`;
}
