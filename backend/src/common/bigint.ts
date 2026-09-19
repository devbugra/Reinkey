// BigInt yardımcıları. Para hesabında `number` kullanılmaz.

/** `JSON.stringify` BigInt'i serileştiremez; hepsi string olarak yazılır. */
export function installBigIntJson(): void {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
  ) {
    return this.toString();
  };
}

/** Nesnedeki tüm bigint değerlerini string'e çevirir (Prisma Json alanı için). */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
}

export function parseBig(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return BigInt(value);
  return undefined;
}

export const max = (a: bigint, b: bigint) => (a > b ? a : b);
