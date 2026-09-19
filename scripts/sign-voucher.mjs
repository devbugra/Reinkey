// Kullanım: node scripts/sign-voucher.mjs <channelContractC...> <channelId> <cumulative> <seedHex> [passphrase]
// Kuponu docs/BACKEND.md §3.1 düzeninde imzalar; imzayı hex olarak yazar.
import crypto from "node:crypto";

const [contract, idStr, cumStr, seedHex, passphrase = "Test SDF Network ; September 2015"] = process.argv.slice(2);
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function strkeyRaw(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of s) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const buf = Buffer.from(out);
  if (buf[0] !== 2 << 3) throw new Error("C adresi değil");
  return buf.subarray(1, 33);
}
const id = Buffer.alloc(8); id.writeBigUInt64BE(BigInt(idStr));
const c = BigInt(cumStr); const cum = Buffer.alloc(16);
cum.writeBigUInt64BE(c >> 64n, 0); cum.writeBigUInt64BE(c & 0xffffffffffffffffn, 8);
const msg = Buffer.concat([Buffer.from("reinkey:voucher:v1"), crypto.createHash("sha256").update(passphrase).digest(), strkeyRaw(contract), id, cum]);
const hash = crypto.createHash("sha256").update(msg).digest();
const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
const pub = crypto.createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12);
console.log(JSON.stringify({ signature: crypto.sign(null, hash, key).toString("hex"), voucherKey: pub.toString("hex"), hash: hash.toString("hex") }));
