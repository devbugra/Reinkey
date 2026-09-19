/**
 * Katman 2 testnet doğrulaması: Reinkey Account, AJAN imzasıyla Soroswap'ta işlem yapar.
 *
 *   node scripts/dex-smoke.mjs
 *
 * Denenenler:
 *   1. 0,5 USDC → XLM          (başarılı beklenir)
 *   2. 2 USDC → XLM            (PER_TX_CAP_EXCEEDED #6 beklenir; zincire gönderilir → başarısız tx hash)
 *   3. swap, to = başka adres  (Soroswap'ta `to` hem ödeyen hem alıcıdır: hesabın auth'u hiç istenmez,
 *                               işlem o adresin bakiyesi/auth'u olmadığı için başarısız olur; bizim kuralımız devreye girmez)
 *   4. USDC'yi ajanın kendi G adresine transfer (PAYEE_NOT_ALLOWED #5 beklenir)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, BASE_FEE, Contract, Keypair, nativeToScVal, rpc, scValToNative, TransactionBuilder } from "@stellar/stellar-sdk";
import { invokeAsAccount, keypairFromSeedHex } from "./lib/account-auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "deployments/testnet.json"), "utf8"));
const secrets = Object.fromEntries(
  readFileSync(join(root, "deployments/.secrets.env"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const server = new rpc.Server(cfg.rpcUrl);
const passphrase = cfg.networkPassphrase;
const source = Keypair.fromSecret(secrets.FACILITATOR_SECRET); // ücreti facilitator öder
const agent = keypairFromSeedHex(secrets.AGENT_SEED_HEX);
const account = cfg.demoAccountId;

const i128 = (v) => nativeToScVal(BigInt(v), { type: "i128" });
const u64 = (v) => nativeToScVal(BigInt(v), { type: "u64" });
const addr = (a) => new Address(a).toScVal();
const path = (a, b) => nativeToScVal([new Address(a), new Address(b)]);
const deadline = () => u64(Math.floor(Date.now() / 1000) + 600);

async function tokenBalance(token, who) {
  const acct = await server.getAccount(source.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(new Contract(token).call("balance", addr(who)))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  return rpc.Api.isSimulationError(sim) ? null : scValToNative(sim.result.retval);
}

const swapArgs = (amountIn, minOut, to = account) => [
  i128(amountIn), i128(minOut), path(cfg.usdcContractId, cfg.xlmContractId), addr(to), deadline(),
];

async function swap(label, amountIn, minOut, to = account, submitOnReject = false) {
  const r = await invokeAsAccount({
    server,
    networkPassphrase: passphrase,
    source,
    contractId: cfg.dexRouterId,
    method: "swap_exact_tokens_for_tokens",
    args: swapArgs(amountIn, minOut, to),
    accountId: account,
    keypair: agent,
    kind: "Agent",
    submitOnReject,
    probeArgs: submitOnReject ? swapArgs(1_000_000, 1) : null,
  });
  report(label, r);
  return r;
}

function report(label, r) {
  const out = { ok: r.ok, stage: r.stage, code: r.code ?? undefined, codeName: r.codeName, hash: r.hash, txStatus: r.status };
  if (r.ok && r.returnValue) out.returned = String(scValToNative(r.returnValue));
  if (!r.ok && r.error) out.error = String(r.error).split("\n").find((l) => /Error\(|HostError|auth/i.test(l))?.trim();
  console.log(`\n■ ${label}\n${JSON.stringify(out, null, 2)}`);
}

console.log(`hesap ${account}\nrouter ${cfg.dexRouterId}\npair ${cfg.dexPairUsdcXlmId}`);
const u0 = await tokenBalance(cfg.usdcContractId, account);
const x0 = await tokenBalance(cfg.xlmContractId, account);
console.log(`başlangıç: USDC ${u0}  XLM ${x0}`);

await swap("1) 0,5 USDC → XLM (ajan imzası)", 5_000_000, 1);
const u1 = await tokenBalance(cfg.usdcContractId, account);
const x1 = await tokenBalance(cfg.xlmContractId, account);
console.log(`sonra: USDC ${u1} (Δ ${u1 - u0})  XLM ${x1} (Δ ${x1 - x0})`);

await swap("2a) 2 USDC → XLM, simülasyon (PER_TX_CAP_EXCEEDED #6 beklenir)", 20_000_000, 1);
await swap("2b) 2 USDC → XLM, zincire gönderilir (başarısız tx beklenir)", 20_000_000, 1, account, true);

const other = Keypair.random().publicKey();
await swap("3) swap, to = başka adres", 1_000_000, 1, other);

// Ajanın G hesabında USDC trustline'ı olmalı (yoksa SAC #13 ile, kuralımızdan önce düşer).
const transferArgs = (to, amount) => [addr(account), addr(to), i128(amount)];
const t = await invokeAsAccount({
  server,
  networkPassphrase: passphrase,
  source,
  contractId: cfg.usdcContractId,
  method: "transfer",
  args: transferArgs(cfg.agentPublicKey, 1_000_000),
  accountId: account,
  keypair: agent,
  kind: "Agent",
  submitOnReject: true,
  probeArgs: transferArgs(cfg.sellerPublicKey, 1_000_000), // izinli: satıcıya
});
report("4) USDC'yi ajanın kendi G adresine gönder (PAYEE_NOT_ALLOWED #5 beklenir, zincire gönderilir)", t);

const u2 = await tokenBalance(cfg.usdcContractId, account);
console.log(`\nbitiş: USDC ${u2}  (1. adımdan sonra değişmemeli: ${u2 === u1})`);
