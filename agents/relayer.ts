/**
 * Ajan işlemlerinin kaynağı ve ücret ödeyeni ("relayer").
 *
 * Ajanın kendisi XLM tutmaz; işlem ücretini bu G-hesabı öder. Facilitator
 * hesabından AYRI tutulur: facilitator claim işlemlerini gönderirken aynı
 * hesabı paylaşmak sıra numarası çakışmasına ve işlemlerin düşmesine yol açıyor
 * (testnet'te gözlendi).
 *
 * İlk çalıştırmada rastgele bir hesap üretilir, friendbot ile fonlanır ve
 * `agents/.relayer.env` dosyasına yazılır (gitignore'da).
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";

const FILE = join(dirname(fileURLToPath(import.meta.url)), ".relayer.env");

export async function loadRelayer(): Promise<Keypair> {
  if (existsSync(FILE)) {
    const m = /RELAYER_SECRET=(S[A-Z0-9]+)/.exec(readFileSync(FILE, "utf8"));
    if (m) return Keypair.fromSecret(m[1]);
  }
  const kp = Keypair.random();
  const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!res.ok) throw new Error(`friendbot fonlaması başarısız: ${res.status}`);
  writeFileSync(FILE, `# GİZLİ — ajan işlemlerinin ücret ödeyeni (testnet)\nRELAYER_SECRET=${kp.secret()}\n`);
  chmodSync(FILE, 0o600);
  return kp;
}
