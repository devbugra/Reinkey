/**
 * Görüntüleme yardımcıları. Para her zaman BigInt; number'a yalnızca oran için
 * çevrilir.
 *
 * Sayı, süre ve saat biçimi seçili dile uyar (`lib/locale.ts`). Para biçimi
 * uymaz: USDC tutarı protokol metnidir ve her dilde `1,234.5678` yazılır —
 * aynı tutarın iki farklı yazımı, kopyalanıp zincire bakılan bir sayıda
 * kazançtan çok hata üretir.
 */
import { currentLocale } from "./locale";

export const USDC_DECIMALS = 7n;
const SCALE = 10n ** USDC_DECIMALS;

export function big(v: string | number | bigint | undefined | null): bigint {
  if (v === undefined || v === null || v === "") return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/** Taban birimden USDC metnine: 135000n → "0.0135". `digits` kadar ondalık gösterir. */
export function usdc(v: string | bigint, digits = 4): string {
  const n = typeof v === "bigint" ? v : big(v);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(Number(USDC_DECIMALS), "0").slice(0, digits);
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${digits > 0 ? `.${frac}` : ""}`;
}

/** 0..1 arası oran; bölen sıfırsa 0. */
export function ratio(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const r = Number((part * 10_000n) / whole) / 10_000;
  return Math.min(1, Math.max(0, r));
}

export function shortAddr(a: string | undefined, head = 4, tail = 4): string {
  if (!a) return "—";
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function shortHash(h: string | undefined): string {
  return h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—";
}

/**
 * Saniyeyi okunur süreye: 2060 → "34 dk 20 sn" / "34 min 20 s".
 * Kısaltmalar sözlükte değil burada: üç harflik birimlerin ICU karşılığı yok
 * ve `Intl.DurationFormat` her tarayıcıda bulunmuyor.
 */
const UNITS: Record<"tr" | "en", { h: string; m: string; s: string }> = {
  tr: { h: "sa", m: "dk", s: "sn" },
  en: { h: "h", m: "min", s: "s" },
};

export function duration(seconds: number): string {
  const u = UNITS[currentLocale()];
  if (seconds < 60) return `${int(seconds)} ${u.s}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${int(h)} ${u.h} ${int(m)} ${u.m}`;
  return s ? `${int(m)} ${u.m} ${int(s)} ${u.s}` : `${int(m)} ${u.m}`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(currentLocale(), { hour12: false });
}

/** Milisaniye: 1'in altı iki, 10'un altı tek ondalıkla; kupon doğrulaması çoğu zaman 1 ms'den kısadır. */
export function ms(n: number): string {
  const digits = n < 1 ? 2 : n < 10 ? 1 : 0;
  return n.toLocaleString(currentLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function int(n: number): string {
  return n.toLocaleString(currentLocale());
}

/** Yüzde: 1234 baz puan → "%12,34" / "12.34%". */
export function percent(bps: number, digits = 2): string {
  return (bps / 10_000).toLocaleString(currentLocale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Yalnızca gerçek işlem hash'i (64 hex) explorer'a bağlanır. */
export function txUrl(hash: string | undefined | null): string | null {
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
