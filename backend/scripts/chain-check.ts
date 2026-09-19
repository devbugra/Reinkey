// StellarChain'i gerçek testnet'e karşı dener. Kullanım: npx tsx scripts/chain-check.ts [kanalId] [txHash]
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
import { loadConfig } from '../src/config/config';
import { StellarChain } from '../src/chain/stellar.chain';

const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 1);
async function main() {
const cfg = loadConfig();
const chain = new StellarChain(cfg.networkPassphrase, cfg.channelContractId, cfg.usdcContractId, cfg.rpcUrl, cfg.facilitatorSecret!);
const id = BigInt(process.argv[2] ?? 5);
const latest = await chain.latestLedger();
console.log('ledger', latest);
console.log('channel', j(await chain.getChannel(id)));
console.log('missing', j(await chain.getChannel(999999n)));
console.log('account', j(await chain.getAccount(process.env.DEMO_ACCOUNT_ID!)));
const ev = await chain.pollEvents(latest - 9000);
console.log('events', ev.events.length, j(ev.events.slice(-3)));
if (process.argv[3]) console.log('tx', j(await chain.getTransactionStatus(process.argv[3])));

}
void main();
