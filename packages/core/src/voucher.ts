/**
 * Kupon kodlama, imzalama ve doğrulama.
 *
 * Bayt düzeni (docs/BACKEND.md §3.1, contracts/channel/src/lib.rs):
 *   "reinkey:voucher:v1" ‖ sha256(passphrase) ‖ contractId(32) ‖ id(u64 BE) ‖ cumulative(i128 BE)
 *   hash = sha256(mesaj); İMZALANAN ŞEY hash'in kendisidir.
 *
 * Tarayıcıda da çalışsın diye Node'un `crypto` modülü değil, @noble kullanılır.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";

export const VOUCHER_DOMAIN = "reinkey:voucher:v1";

const enc = new TextEncoder();

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex uzunluğu tek");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** u64 big-endian. */
export function u64be(v: bigint): Uint8Array {
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) throw new Error("u64 aralığı dışında");
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** i128 big-endian, iki tümleyen. */
export function i128be(v: bigint): Uint8Array {
  const MOD = 1n << 128n;
  const MIN = -(1n << 127n);
  const MAX = (1n << 127n) - 1n;
  if (v < MIN || v > MAX) throw new Error("i128 aralığı dışında");
  let x = v < 0n ? v + MOD : v;
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Stellar C-adresini (strkey) ham 32 bayta çevirir. */
export function contractIdToBytes(contractId: string): Uint8Array {
  if (contractId.length !== 56 || !contractId.startsWith("C")) {
    throw new Error(`C-adresi değil: ${contractId}`);
  }
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let acc = 0;
  const bytes: number[] = [];
  for (const ch of contractId) {
    const v = A.indexOf(ch);
    if (v < 0) throw new Error(`geçersiz base32 karakteri: ${ch}`);
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const buf = Uint8Array.from(bytes);
  if (buf[0] !== 2 << 3) throw new Error("strkey sürüm baytı kontrat değil");
  return buf.slice(1, 33);
}

export function networkId(networkPassphrase: string): Uint8Array {
  return sha256(enc.encode(networkPassphrase));
}

export type VoucherInput = {
  networkPassphrase: string;
  /** Kanal kontratının C-adresi ya da ham 32 bayt (test vektörü için). */
  channelContract: string | Uint8Array;
  channelId: bigint;
  cumulative: bigint;
};

export function encodeVoucherMessage(v: VoucherInput): Uint8Array {
  const contract =
    typeof v.channelContract === "string" ? contractIdToBytes(v.channelContract) : v.channelContract;
  if (contract.length !== 32) throw new Error("kontrat kimliği 32 bayt olmalı");
  const domain = enc.encode(VOUCHER_DOMAIN);
  const net = networkId(v.networkPassphrase);
  const out = new Uint8Array(domain.length + 32 + 32 + 8 + 16);
  let off = 0;
  for (const part of [domain, net, contract, u64be(v.channelId), i128be(v.cumulative)]) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

export function hashVoucher(v: VoucherInput): Uint8Array {
  return sha256(encodeVoucherMessage(v));
}

/** Kuponu imzalar. `secret`: 32 baytlık ed25519 tohumu. */
export function signVoucher(v: VoucherInput, secret: Uint8Array): Uint8Array {
  return ed25519.sign(hashVoucher(v), secret);
}

export function voucherPublicKey(secret: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(secret);
}

export function verifyVoucher(v: VoucherInput, signature: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, hashVoucher(v), publicKey);
  } catch {
    return false;
  }
}
