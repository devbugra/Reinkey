// Kupon kodlama ve doğrulama (BACKEND.md §3.1). Saf fonksiyonlar; Nest'e bağımlı değil.
// Hat 1 bu dosyayı `packages/core`a taşıyacak.
//
// message = "reinkey:voucher:v1" ‖ sha256(passphrase) ‖ contract_id (32) ‖ id (u64 BE) ‖ cumulative (i128 BE)
// hash    = sha256(message); imza hash'in kendisi üzerindedir.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';

export const VOUCHER_DOMAIN = Buffer.from('reinkey:voucher:v1', 'ascii');

const U64_MAX = (1n << 64n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

// Ham ed25519 anahtarlarını Node KeyObject'e sarmak için DER önekleri.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

export function networkId(passphrase: string): Buffer {
  return sha256(Buffer.from(passphrase, 'utf8'));
}

/** C-strkey ya da 32 baytlık ham kimlik (Buffer/hex) → 32 bayt. */
export function contractIdRaw(id: string | Buffer): Buffer {
  if (Buffer.isBuffer(id)) {
    if (id.length !== 32) throw new Error('kontrat kimliği 32 bayt olmalı');
    return id;
  }
  if (/^[0-9a-f]{64}$/i.test(id)) return Buffer.from(id, 'hex');
  return Buffer.from(StrKey.decodeContract(id));
}

export interface VoucherFields {
  networkPassphrase: string;
  contractId: string | Buffer;
  channelId: bigint;
  cumulative: bigint;
}

export function encodeVoucherMessage(v: VoucherFields): Buffer {
  if (v.channelId < 0n || v.channelId > U64_MAX)
    throw new Error('channelId u64 aralığında değil');
  if (v.cumulative < I128_MIN || v.cumulative > I128_MAX)
    throw new Error('cumulative i128 aralığında değil');

  const id = Buffer.alloc(8);
  id.writeBigUInt64BE(v.channelId);

  const u = BigInt.asUintN(128, v.cumulative); // iki tümleyen
  const cum = Buffer.alloc(16);
  cum.writeBigUInt64BE(u >> 64n, 0);
  cum.writeBigUInt64BE(u & U64_MAX, 8);

  return Buffer.concat([
    VOUCHER_DOMAIN,
    networkId(v.networkPassphrase),
    contractIdRaw(v.contractId),
    id,
    cum,
  ]);
}

export function hashVoucher(v: VoucherFields): Buffer {
  return sha256(encodeVoucherMessage(v));
}

/** Doğrulama. `voucherKeyHex`: 32 bayt, `signatureHex`: 64 bayt, ikisi de küçük harfli hex. */
export function verifyVoucher(
  v: VoucherFields,
  voucherKeyHex: string,
  signatureHex: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(voucherKeyHex)) return false;
  if (!/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(voucherKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, hashVoucher(v), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/** Ham 32 baytlık tohumdan ed25519 açık anahtarı (hex). */
export function publicKeyFromSeed(seed: Buffer): string {
  const priv = privateKeyFromSeed(seed);
  const der = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return Buffer.from(der).subarray(SPKI_PREFIX.length).toString('hex');
}

/** Kupon imzalar (testler, mock ajan). Dönüş: 128 karakter hex. */
export function signVoucher(v: VoucherFields, seed: Buffer): string {
  return sign(null, hashVoucher(v), privateKeyFromSeed(seed)).toString('hex');
}

function privateKeyFromSeed(seed: Buffer) {
  if (seed.length !== 32) throw new Error('tohum 32 bayt olmalı');
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}
