/**
 * SPIKE: Reinkey Account testnet'te AJAN imzasıyla channel.open çağırabiliyor mu?
 * Ayrıca: tavanı aşan açılış zincirde reddediliyor mu?
 */
import { Address, Contract, Keypair, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { invokeWithAuth, SorobanCallError } from "../../packages/sdk/src/soroban.ts";
import { loadDeployment, loadSecrets } from "../../packages/sdk/src/config.ts";
import { loadRelayer } from "../relayer.ts";

const d = loadDeployment();
const s = loadSecrets();
const server = new rpc.Server(d.rpcUrl);
const facilitator = await loadRelayer();
console.log("relayer:", facilitator.publicKey());
const agent = Keypair.fromSecret(s.AGENT_SECRET);
const account = d.demoAccountId;

async function view(contractId: string, fn: string, ...args: xdr.ScVal[]) {
  const { Account, TransactionBuilder, BASE_FEE } = await import("@stellar/stellar-sdk");
  const acc = new Account(facilitator.publicKey(), "0");
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: d.networkPassphrase })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result!.retval);
}

const policy = await view(account, "get_policy");
console.log("policy:", {
  agentKey: Buffer.from(policy.agent_key).toString("hex"),
  agentKeyMatches: Buffer.from(policy.agent_key).equals(agent.rawPublicKey()),
  perTxCap: policy.per_tx_cap.toString(),
  dailyCap: policy.daily_cap.toString(),
  payees: policy.payees,
  channel: policy.channel,
  expires: policy.expires_ledger,
});
console.log("spent:", (await view(account, "get_spent")).map(String));
console.log("usdc balance:", String(await view(d.usdcContractId, "balance", new Address(account).toScVal())));

const latest = (await server.getLatestLedger()).sequence;
const voucherKp = Keypair.random();

function openOp(deposit: bigint, payee = d.sellerPublicKey) {
  return new Contract(d.channelContractId).call(
    "open",
    new Address(account).toScVal(),
    new Address(payee).toScVal(),
    new Address(d.usdcContractId).toScVal(),
    nativeToScVal(deposit, { type: "i128" }),
    xdr.ScVal.scvBytes(voucherKp.rawPublicKey()),
    nativeToScVal(latest + 720, { type: "u32" }),
  );
}

const opts = {
  server,
  networkPassphrase: d.networkPassphrase,
  source: facilitator,
  signers: { [account]: { keypair: agent, variant: "Agent" as const } },
};

// 1) Mutlu yol: 0.1 USDC depozito
try {
  const r = await invokeWithAuth(openOp(1_000_000n), opts);
  console.log("OPEN OK", { hash: r.hash, channelId: r.returnValue ? String(scValToNative(r.returnValue)) : null, ledger: r.ledger });
} catch (e) {
  const err = e as SorobanCallError;
  console.log("OPEN FAILED", err.stage, err.contractError, err.txHash, err.message.slice(0, 600));
}

// 2) Tek işlem tavanını aşan açılış (per_tx_cap üstü) → #6 beklenir (simülasyonda)
try {
  await invokeWithAuth(openOp(BigInt(policy.per_tx_cap) + 1n), { ...opts, submitOnFailure: { probe: openOp(1_000_000n) } });
  console.log("OVER-CAP UNEXPECTEDLY OK");
} catch (e) {
  const err = e as SorobanCallError;
  console.log("OVER-CAP REJECTED", err.stage, err.contractError, err.txHash ?? "", err.message.slice(-500));
}

// 3) İzinsiz payee (ajanın kendi G adresi) → #5 beklenir
try {
  await invokeWithAuth(openOp(1_000_000n, agent.publicKey()), { ...opts, submitOnFailure: { probe: openOp(1_000_000n) } });
  console.log("BAD-PAYEE UNEXPECTEDLY OK");
} catch (e) {
  const err = e as SorobanCallError;
  console.log("BAD-PAYEE REJECTED", err.stage, err.contractError, err.txHash ?? "", err.message.slice(-500));
}
console.log("spent after:", (await view(account, "get_spent")).map(String));
