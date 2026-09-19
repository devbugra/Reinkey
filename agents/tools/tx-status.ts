/**
 * Zincirdeki işlemlerin durumunu ve (başarısızsa) kontrat hata kodunu yazar.
 * Kullanım: tsx tools/tx-status.ts <hash> [hash...]
 */
import { rpc } from "@stellar/stellar-sdk";
import { loadDeployment } from "../../packages/sdk/src/config.ts";

const server = new rpc.Server(loadDeployment().rpcUrl);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

for (const h of process.argv.slice(2)) {
  const t = await server.getTransaction(h);
  const raw = json(t);
  const code = /Error\(Contract, #(\d+)\)/.exec(raw)?.[1];
  const ledger = "ledger" in t ? t.ledger : "-";
  console.log(`${h}  ${t.status}  ledger=${ledger}${code ? `  Error(Contract, #${code})` : ""}`);
  if (t.status === "FAILED" && !code) {
    // Hata kodu tanılama olaylarının içinde; kısa bir iz bırak.
    const hits = raw.match(/"(?:contract|type)":"?[A-Za-z]*"?[^{}]{0,80}(?:code|Contract)[^{}]{0,80}/g) ?? [];
    for (const x of hits.slice(0, 4)) console.log("   ", x);
  }
}
