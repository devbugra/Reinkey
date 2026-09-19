// x402 başlıkları. Adlar @x402/core 2.26.0'dan doğrulandı:
// v2: PAYMENT-SIGNATURE (istek), PAYMENT-REQUIRED (402), PAYMENT-RESPONSE (makbuz)
// v1: X-PAYMENT (istek), X-PAYMENT-RESPONSE (makbuz)

export const HEADER_PAYMENT_V2 = 'payment-signature';
export const HEADER_PAYMENT_V1 = 'x-payment';
export const HEADER_REQUIRED = 'PAYMENT-REQUIRED';
export const HEADER_RESPONSE = 'PAYMENT-RESPONSE';
export const HEADER_RESPONSE_V1 = 'X-PAYMENT-RESPONSE';

/** CORS'ta tarayıcıya açılması gereken başlıklar. */
export const EXPOSED_HEADERS = [
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_RESPONSE_V1,
];

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function decodeHeader(value: string): unknown {
  return JSON.parse(Buffer.from(value.trim(), 'base64').toString('utf8'));
}

type HeaderBag = Record<string, string | string[] | undefined>;

/** İstekten ödeme yükünü çıkarır. Başlık yoksa `undefined`, çözülemezse `null`. */
export function readPaymentHeader(
  headers: HeaderBag,
): { version: 1 | 2; payload: unknown } | null | undefined {
  const v2 = headers[HEADER_PAYMENT_V2];
  const v1 = headers[HEADER_PAYMENT_V1];
  const raw =
    (Array.isArray(v2) ? v2[0] : v2) ?? (Array.isArray(v1) ? v1[0] : v1);
  if (!raw) return undefined;
  try {
    return { version: v2 ? 2 : 1, payload: decodeHeader(raw) };
  } catch {
    return null;
  }
}

/** Yükten şema adını okur (v1: `scheme`, v2: `accepted.scheme`). */
export function payloadScheme(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as { scheme?: unknown; accepted?: { scheme?: unknown } };
  const s = p.scheme ?? p.accepted?.scheme;
  return typeof s === 'string' ? s : undefined;
}
