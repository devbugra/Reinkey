/**
 * Kredi havuzu testnet doğrulaması (Hat 1C): "kaçamayan sermaye".
 *
 *   node scripts/credit-smoke.mjs
 *
 * Akış:
 *   0. Sahip imzasıyla hesabı havuza devret (set_controller; bir kez)
 *   1. Yatırımcı 100 USDC yatırır
 *   2. Yönetici 20 USDC'lik kredi hattı açar
 *   3. Ajan imzasıyla 3 × 5 USDC'lik XLM alımı (Soroswap)
 *   4. Ajan krediyi kendi G adresine kaçırmayı dener → PAYEE_NOT_ALLOWED #5 (zincirde FAILED)
 *   5. Sahip imzasıyla aynı kaçırma → CONTROLLER_LOCKED #10
 *   6. Sağlıklıyken tasfiye denemesi → NOT_LIQUIDATABLE #46
 *   7. Deployer büyük bir XLM satışıyla havuz fiyatını düşürür
 *   8. liquidate (yatırımcı çağırır; herkes çağırabilir) → hesap donar, fon havuza döner
 *   9. Havuz fiyatı ters işlemle geri getirilir (demo hesabı ve fiyat akışı aynı havuzu kullanıyor)
 *
 * Anahtarlar `stellar keys secret` ile okunur; ekrana yazılmaz.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, BASE_FEE, Contract, Keypair, nativeToScVal, rpc, scValToNative, TransactionBuilder } from "@stellar/stellar-sdk";
import { contractErrorCode, invokeAsAccount, keypairFromSeedHex } from "./lib/account-auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "deployments/testnet.json"), "utf8"));
const secrets = Object.fromEntries(
  readFileSync(join(root, "deployments/.secrets.env"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const key = (alias) => Keypair.fromSecret(execSync(`stellar keys secret ${alias}`, { encoding: "utf8" }).trim());

const server = new rpc.Server(cfg.rpcUrl);
const passphrase = cfg.networkPassphrase;
const deployer = key("rk-deployer"); // havuz yöneticisi, ücret ödeyen, fiyatı oynatan
const investor = key("rk-investor");
const agent = keypairFromSeedHex(secrets.AGENT_SEED_HEX);
const owner = keypairFromSeedHex(secrets.AGENT_OWNER_SEED_HEX);
const { creditPoolId: pool, creditAccountId: account, usdcContractId: usdc, xlmContractId: xlm, dexRouterId: router, dexPairUsdcXlmId: pair } = cfg;

const POOL_CODES = { 40: "INVALID_AMOUNT", 41: "INSUFFICIENT_SHARES", 42: "INSUFFICIENT_LIQUIDITY", 43: "LINE_EXISTS", 44: "LINE_NOT_FOUND", 45: "NOT_CONTROLLER", 46: "NOT_LIQUIDATABLE", 47: "PRICE_UNAVAILABLE", 48: "INSUFFICIENT_USDC", 49: "NOT_AUTHORIZED" };
const ACCOUNT_EXTRA = { 10: "CONTROLLER_LOCKED", 11: "CONTROLLER_MISMATCH" };

const i128 = (v) => nativeToScVal(BigInt(v), { type: "i128" });
const u64 = (v) => nativeToScVal(BigInt(v), { type: "u64" });
const addr = (a) => new Address(a).toScVal();
const path = (a, b) => nativeToScVal([new Address(a), new Address(b)]);
const deadline = () => u64(Math.floor(Date.now() / 1000) + 600);
const fmt = (v) => (Number(v) / 1e7).toFixed(4);
const hashes = [];

async function read(contractId, method, ...args) {
  const acct = await server.getAccount(deployer.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

/** Klasik hesap imzasıyla kontrat çağrısı. */
async function invoke(label, signer, contractId, method, args) {
  const acct = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(acct, { fee: "1000000", networkPassphrase: passphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const code = contractErrorCode(sim.error);
    console.log(`■ ${label}\n  REDDEDİLDİ (simülasyon): #${code} ${POOL_CODES[code] ?? ""}`);
    return { ok: false, code };
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  let r = await server.getTransaction(sent.hash);
  for (let i = 0; i < 40 && r.status === "NOT_FOUND"; i++) {
    await new Promise((s) => setTimeout(s, 1000));
    r = await server.getTransaction(sent.hash);
  }
  const ret = r.status === "SUCCESS" && r.returnValue ? scValToNative(r.returnValue) : undefined;
  hashes.push([label, sent.hash, r.status]);
  console.log(`■ ${label}\n  ${r.status} ${sent.hash}${ret !== undefined ? `\n  dönen: ${String(ret)}` : ""}`);
  if (r.status !== "SUCCESS") throw new Error(`${label}: ${r.status}`);
  return { ok: true, hash: sent.hash, ret };
}

async function asAccount(label, opts) {
  const r = await invokeAsAccount({ server, networkPassphrase: passphrase, source: deployer, accountId: account, ...opts });
  const name = r.codeName ?? ACCOUNT_EXTRA[r.code] ?? "";
  if (r.hash) hashes.push([label, r.hash, r.ok ? "SUCCESS" : (r.status ?? "FAILED")]);
  console.log(`■ ${label}\n  ${r.ok ? "SUCCESS" : `REDDEDİLDİ #${r.code ?? "?"} ${name} (${r.stage})`}${r.hash ? ` ${r.hash}` : ""}${r.status ? ` tx:${r.status}` : ""}`);
  return r;
}

async function snapshot(label) {
  const [h, sp, ta, td, pu, px, p] = await Promise.all([
    read(pool, "health", addr(account)).catch(() => null),
    read(pool, "share_price"),
    read(pool, "total_assets"),
    read(pool, "total_debt"),
    read(usdc, "balance", addr(pool)),
    read(xlm, "balance", addr(pool)),
    read(pool, "price"),
  ]);
  console.log(`  ─ ${label}`);
  console.log(`    fiyat (min(oracle, DEX)) ${fmt(p)} USDC/XLM · pay fiyatı ${fmt(sp)} · havuz varlığı ${fmt(ta)} (USDC ${fmt(pu)}, XLM ${fmt(px)}, açık borç ${fmt(td)})`);
  if (h) console.log(`    hesap: değer ${fmt(h.value)} / borç ${fmt(h.debt)} (USDC ${fmt(h.usdc)}, XLM ${fmt(h.xlm)}) · tasfiye edilebilir: ${h.liquidatable}`);
  return { h, sp, p };
}

console.log(`havuz ${pool}\nkredi hesabı ${account}\npair ${pair}\noracle ${cfg.oracleId ?? "-"}\n`);

// Dondurulmuş hesapta ajan, izinli satıcıya 0 tutarlı transfer dener: bakiye gerektirmez,
// yalnızca __check_auth çalışır.
async function frozenCheck() {
  await asAccount("8b) Dondurulmuş hesapta ajan izinli satıcıya ödeme dener (ACCOUNT_FROZEN #3 beklenir)", {
    contractId: usdc, method: "transfer", args: [addr(account), addr(cfg.sellerPublicKey), i128(0)], keypair: agent,
  });
}

// 0. Devir
const ctrl = await read(account, "get_controller");
if (!ctrl) {
  const r = await asAccount("0) Sahip hesabı havuza devreder (set_controller, sahip imzası)", {
    contractId: account, method: "set_controller", args: [addr(pool)], keypair: owner, kind: "Owner",
  });
  if (!r.ok) throw new Error("devir başarısız");
} else console.log(`■ 0) Hesap zaten devredilmiş: controller = ${ctrl}`);

// 1–2. Mevduat ve hat
const line = await read(pool, "get_line", addr(account));
if (!line) {
  await invoke("1) Yatırımcı 100 USDC yatırır", investor, pool, "deposit", [addr(investor.publicKey()), i128(1_000_000_000)]);
  await invoke("2) Yönetici 20 USDC'lik kredi hattı açar (teminat yok)", deployer, pool, "open_line", [addr(account), i128(200_000_000), addr(cfg.agentOwnerPublicKey)]);
} else console.log(`■ 1–2) Hat zaten var: borç ${fmt(line.debt)}, açık: ${line.open}`);
if (line && !line.open) {
  console.log("  Hat kapalı (tasfiye edilmiş). Yeni bir akış için deploy-credit-testnet.sh ile yeni hesap kur.");
  await snapshot("güncel durum");
  console.log(`  hesap donduruldu: ${await read(account, "is_frozen")}`);
  await frozenCheck();
  process.exit(0);
}
await snapshot("hat açıldıktan sonra");

// 3. Ajan krediyle alım yapar
const swapArgs = (amountIn) => [i128(amountIn), i128(1), path(usdc, xlm), addr(account), deadline()];
const heldXlm = await read(xlm, "balance", addr(account));
if (heldXlm > 0n) console.log(`■ 3) Alımlar zaten yapılmış: hesapta ${fmt(heldXlm)} XLM var`);
for (let n = 1; n <= 3 && heldXlm === 0n; n++) {
  const r = await asAccount(`3.${n}) Ajan krediyle 5 USDC → XLM alır (ajan imzası)`, {
    contractId: router, method: "swap_exact_tokens_for_tokens", args: swapArgs(50_000_000), keypair: agent,
  });
  if (!r.ok) throw new Error("alım başarısız");
}
await snapshot("alımlardan sonra");

// 4–5. Kaçırma denemeleri
const transferArgs = (to, amount) => [addr(account), addr(to), i128(amount)];
await asAccount("4) Ajan krediyi kendi G adresine kaçırmayı dener (PAYEE_NOT_ALLOWED #5 beklenir; zincire gönderilir)", {
  contractId: usdc, method: "transfer", args: transferArgs(cfg.agentPublicKey, 10_000_000), keypair: agent,
  submitOnReject: true, probeArgs: transferArgs(cfg.sellerPublicKey, 10_000_000),
});
await asAccount("5) Hesabı kuran SAHİP aynı kaçırmayı dener (CONTROLLER_LOCKED #10 beklenir)", {
  contractId: usdc, method: "transfer", args: transferArgs(cfg.agentOwnerPublicKey, 10_000_000), keypair: owner, kind: "Owner",
});

// 6. Sağlıklıyken tasfiye
await invoke("6) Sağlıklı hesapta tasfiye denemesi (NOT_LIQUIDATABLE #46 beklenir)", investor, pool, "liquidate", [addr(account)]);

// 7. Fiyatı düşür: hedef, tasfiye eşiğinin %15 altı.
const { h } = await snapshot("fiyat düşmeden önce");
const cfgPool = await read(pool, "get_config");
const [r0, r1] = await read(pair, "get_reserves");
const t0 = await read(pair, "token_0");
const [usdcR, xlmR] = t0 === usdc ? [Number(r0), Number(r1)] : [Number(r1), Number(r0)];
const thresholdValue = (Number(h.debt) * Number(cfgPool.liq_threshold_bps)) / 10_000;
const thresholdPrice = (thresholdValue - Number(h.usdc)) / Number(h.xlm);
const target = thresholdPrice * 0.85;
const xlmIn = Math.ceil((Math.sqrt((usdcR * xlmR) / target) - xlmR) * 1.004);
console.log(`  eşik fiyatı ${thresholdPrice.toFixed(4)}, hedef ${target.toFixed(4)} → ${fmt(xlmIn)} XLM satılacak`);
const usdcBefore = await read(usdc, "balance", addr(deployer.publicKey()));
await invoke("7) Deployer büyük XLM satışıyla havuz fiyatını düşürür", deployer, router, "swap_exact_tokens_for_tokens",
  [i128(xlmIn), i128(1), path(xlm, usdc), addr(deployer.publicKey()), deadline()]);
const usdcGot = (await read(usdc, "balance", addr(deployer.publicKey()))) - usdcBefore;
const before = await snapshot("fiyat düştükten sonra");
if (!before.h.liquidatable) throw new Error("hesap hâlâ sağlıklı görünüyor; tasfiye denenmedi");

// 8. Tasfiye: yatırımcı çağırır (herkes çağırabilir)
await invoke("8) Tasfiye (yatırımcı çağırdı; herkes çağırabilir)", investor, pool, "liquidate", [addr(account)]);
const frozen = await read(account, "is_frozen");
console.log(`  hesap donduruldu: ${frozen} · hesapta kalan USDC ${fmt(await read(usdc, "balance", addr(account)))}, XLM ${fmt(await read(xlm, "balance", addr(account)))}`);
await snapshot("tasfiyeden sonra (düşük fiyatla)");
await frozenCheck();

// 9. Fiyatı geri getir
await invoke("9) Deployer aldığı USDC ile XLM'i geri alır (fiyat normale döner)", deployer, router, "swap_exact_tokens_for_tokens",
  [i128(usdcGot), i128(1), path(usdc, xlm), addr(deployer.publicKey()), deadline()]);
await snapshot("fiyat geri geldikten sonra");

console.log("\nİŞLEMLER");
for (const [l, hsh, st] of hashes) console.log(`  ${st.padEnd(8)} ${hsh}  ${l.split(" (")[0]}`);
