import { StrKey } from '@stellar/stellar-sdk';
import { ReinkeyError } from './errors';

/**
 * Sorgu parametresini sınırlı bir tamsayıya çevirir. Boşsa varsayılan; tamsayı
 * değilse 400 (NaN'ın Prisma'ya ya da BigInt()'e ulaşıp 500'e dönmesi yerine).
 */
export function intParam(
  value: string | undefined,
  def: number,
  min: number,
  max: number,
  name = 'parametre',
): number {
  if (value === undefined || value === '') return def;
  if (!/^\d{1,12}$/.test(value))
    throw new ReinkeyError('BAD_REQUEST', `${name}: negatif olmayan tamsayı olmalı`);
  return Math.min(Math.max(Number(value), min), max);
}

/** Taban birim tutar: yalnızca rakam, makul uzunlukta. */
export function amountParam(value: string | undefined, name = 'tutar'): bigint {
  if (!value || !/^\d{1,30}$/.test(value))
    throw new ReinkeyError('BAD_REQUEST', `${name}: taban birimde pozitif tamsayı olmalı`);
  return BigInt(value);
}

export const isContract = (v: string) => StrKey.isValidContract(v);
export const isAccount = (v: string) => StrKey.isValidEd25519PublicKey(v);

/** G… ya da C… adresi; geçersizse RPC'ye gitmeden 400. */
export function addressParam(
  value: string,
  kind: 'contract' | 'account' | 'any' = 'any',
  name = 'adres',
): string {
  const ok =
    kind === 'contract'
      ? isContract(value)
      : kind === 'account'
        ? isAccount(value)
        : isContract(value) || isAccount(value);
  if (!ok) throw new ReinkeyError('BAD_REQUEST', `${name}: geçerli bir Stellar adresi değil`);
  return value;
}
