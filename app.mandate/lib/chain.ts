"use client";

/**
 * TARAYICIDAN ZİNCİRE YAZMA (yalnızca kullanıcının kendi adına).
 *
 * Havuza yatırma ve çekme kullanıcının imzasını gerektirir; bunu bizim sunucumuz
 * yapamaz, yapmamalı da. İşlem burada kurulur, RPC'de simüle edilir, CÜZDANDA
 * imzalanır ve zincire gönderilir. Anahtar hiçbir aşamada bize gelmez.
 *
 * `from` işlemin kaynağıyla aynı olduğu için iç yetkilendirmeler (USDC transferi)
 * kaynak hesabın imzasıyla karşılanır; ayrıca auth girişi imzalamak gerekmez.
 *
 * stellar-sdk ağırdır: yalnızca bu akış kullanıldığında dinamik yüklenir.
 */
import { t } from "./t";

export type ChainEnv = { rpcUrl: string; networkPassphrase: string };

/** `confirmed: false` = gönderildi ama 60 sn içinde kesinleştiği görülmedi. */
export type SubmitResult = { hash: string; confirmed: boolean };

async function sdk() {
  return import("@stellar/stellar-sdk");
}

/** i128 ScVal (7 ondalıklı taban birim). */
async function amountVal(amount: bigint) {
  const { nativeToScVal } = await sdk();
  return nativeToScVal(amount, { type: "i128" });
}

/**
 * Kontrat çağrısını kurar, simüle eder, cüzdana imzalatır ve gönderir.
 * Sonuç kesinleşene kadar bekler; başarısızlıkta zincirin sebebini fırlatır.
 */
export async function invoke(opts: {
  env: ChainEnv;
  contractId: string;
  method: string;
  args: unknown[];
  source: string;
  sign: (xdr: string, networkPassphrase: string, address: string) => Promise<string>;
}): Promise<SubmitResult> {
  const { Address, Contract, TransactionBuilder, rpc, nativeToScVal } = await sdk();
  const server = new rpc.Server(opts.env.rpcUrl, { allowHttp: opts.env.rpcUrl.startsWith("http://") });
  const account = await server.getAccount(opts.source);

  const scArgs = await Promise.all(
    opts.args.map(async (a) =>
      typeof a === "bigint" ? await amountVal(a) : typeof a === "string" ? new Address(a).toScVal() : nativeToScVal(a),
    ),
  );
  const tx = new TransactionBuilder(account, { fee: "1000000", networkPassphrase: opts.env.networkPassphrase })
    .addOperation(new Contract(opts.contractId).call(opts.method, ...scArgs))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(reason(sim.error));
  const prepared = rpc.assembleTransaction(tx, sim).build();

  const signedXdr = await opts.sign(prepared.toXDR(), opts.env.networkPassphrase, opts.source);
  const signed = TransactionBuilder.fromXDR(signedXdr, opts.env.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(reason(sent.errorResult?.toXDR("base64") ?? sent.status));

  // Kesinleşmeyi bekle: ledger ~5 sn, 60 sn üst sınır.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await server.getTransaction(sent.hash);
    if (got.status === "SUCCESS") return { hash: sent.hash, confirmed: true };
    if (got.status === "FAILED") throw new Error(reason(got.resultXdr?.toXDR("base64") ?? "FAILED"));
  }
  // Zaman aşımı: işlem yine de geçebilir; başarı denmez, kullanıcı explorer'dan bakar.
  return { hash: sent.hash, confirmed: false };
}

/** Kontrat hata kodunu okunur hâle getirir (ör. `Error(Contract, #4)` → CONTRACT_4). */
function reason(text: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  if (m) return t()("errors.contractRejected", { code: m[1] });
  if (/InsufficientLiquidity|#5\b/.test(text)) return t()("errors.liquidity");
  if (/trustline|TrustLine/i.test(text)) return t()("errors.trustline");
  if (/insufficient|balance/i.test(text)) return t()("errors.balance");
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** SEP-41 token bakiyesi (salt okunur simülasyon). */
export async function tokenBalance(env: ChainEnv, token: string, owner: string): Promise<bigint> {
  const { Account, Address, Contract, TransactionBuilder, rpc, scValToNative } = await sdk();
  const server = new rpc.Server(env.rpcUrl, { allowHttp: env.rpcUrl.startsWith("http://") });
  const tx = new TransactionBuilder(new Account(owner, "0"), { fee: "100", networkPassphrase: env.networkPassphrase })
    .addOperation(new Contract(token).call("balance", new Address(owner).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return 0n;
  return BigInt(scValToNative(sim.result.retval) as string | bigint);
}
