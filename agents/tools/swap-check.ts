/**
 * Katman 2 doğrulaması (SDK üzerinden): ajan imzasıyla DEX işlemi ve
 * tavanı aşan işlemin zincirden reddi.
 */
import { makeAccount, usdc } from "../common.ts";
import { chainReason } from "../../packages/sdk/src/account.ts";
import { SorobanCallError } from "../../packages/sdk/src/soroban.ts";

const { account, deployment } = await makeAccount();
if (!deployment.dexRouterId) throw new Error("dexRouterId yok");

const policy = await account.getPolicy();
console.log("politika:", {
  perTxCap: usdc(policy.perTxCap),
  dailyCap: usdc(policy.dailyCap),
  dexRouter: policy.dexRouter ?? "(politikada yok)",
  pairs: policy.pairs?.length ?? 0,
});
console.log("harcanan:", usdc((await account.getSpent()).amount), "USDC");

const before = await account.usdcBalance();
const r = await account.swap({ amountIn: 1_000_000n, minOut: 1n });
console.log(`✓ swap: ${usdc(1_000_000n)} USDC → ${usdc(r.amounts.at(-1) ?? 0n)} XLM  tx ${r.tx.slice(0, 10)}…`);
console.log(`  bakiye: ${usdc(before)} → ${usdc(await account.usdcBalance())} USDC`);

try {
  await account.swap({ amountIn: 20_000_000n, minOut: 1n, probeAmountIn: 1_000_000n });
  console.log("✗ tavanı aşan işlem kabul edildi (beklenmiyor)");
} catch (e) {
  const hash = e instanceof SorobanCallError ? e.txHash : undefined;
  console.log(`✓ tavan aşımı reddedildi: ${chainReason(e)}  başarısız tx ${hash?.slice(0, 10) ?? "-"}…`);
}

try {
  await account.swap({ amountIn: 1_000_000n, minOut: 0n });
  console.log("! minOut=0 kabul edildi (kontratta SLIPPAGE kuralı yok ya da farklı)");
} catch (e) {
  console.log(`✓ kayma koruması olmayan işlem reddedildi: ${chainReason(e)}`);
}
