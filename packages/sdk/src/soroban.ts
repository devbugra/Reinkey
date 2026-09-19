/**
 * Soroban yardımcıları: özel hesap (Reinkey Account) auth imzası ve
 * "simüle et → imzala → yeniden simüle et → gönder" akışı.
 *
 * NEDEN İKİ SİMÜLASYON: İlk simülasyon "kayıt" modunda çalışır; host,
 * `__check_auth`'u ÇAĞIRMAZ, yalnızca hangi adresin neyi yetkilendirmesi
 * gerektiğini kaydeder. Reinkey Account'un `__check_auth`'u kendi depolamasını
 * okur ve yazar (politika, günlük harcama); bu erişimler ilk simülasyonun ayak
 * izinde yoktur. İmzalı auth ile yapılan ikinci simülasyon "uygulama" modunda
 * çalışır, `__check_auth`'u gerçekten koşturur ve doğru kaynak tahminini verir.
 * Politika ihlali de bu aşamada, zincire gitmeden görünür.
 *
 * Protokol 28 / stellar-sdk 17: auth girişleri CAP-71 V2 kimlik biçiminde
 * gelebilir; imza payload'ı SDK'nın `authorizeEntry`'si ile kurulur, biz
 * yalnızca payload'ı imzalayıp kontratın beklediği `Sig` ScVal'ini veririz.
 */
import {
  Account,
  BASE_FEE,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  authorizeEntry,
  inspectAuthEntry,
  rpc,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";

/** Kontratın `Sig` enum'u (contracts/reinkey-account/src/lib.rs). */
export type SigVariant = "Owner" | "Agent";

/** `Sig::<variant>(BytesN<64>)` → ScVal Vec[Symbol(variant), Bytes(sig)]. */
export function sigScVal(variant: SigVariant, signature: Uint8Array): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), xdr.ScVal.scvBytes(signature)]);
}

/** Auth girişini Reinkey Account biçiminde imzalar. */
export async function signAccountAuthEntry(
  entry: xdr.SorobanAuthorizationEntry,
  signer: Keypair,
  validUntilLedger: number,
  networkPassphrase: string,
  variant: SigVariant = "Agent",
): Promise<xdr.SorobanAuthorizationEntry> {
  return authorizeEntry(
    entry,
    async (_preimage, payload) => ({ signatureScVal: sigScVal(variant, signer.sign(Buffer.from(payload))) }),
    validUntilLedger,
    networkPassphrase,
  );
}

/** Auth girişinin hangi adres için olduğunu döndürür (kaynak hesap auth'unda null). */
export function authEntryAddress(entry: xdr.SorobanAuthorizationEntry): string | null {
  return inspectAuthEntry(entry).address;
}

export type ContractError = { kind: "contract"; code: number } | { kind: "host"; message: string };

/**
 * Simülasyon ya da işlem hata metninden kontrat hata kodunu çıkarır.
 * Örnekler: "Error(Contract, #7)", "HostError: Error(Contract, #6)".
 */
export function parseContractError(text: string): ContractError | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  if (m) return { kind: "contract", code: Number(m[1]) };
  const h = /Error\((Auth|Crypto|Value|Budget|Storage|Object|WasmVm|Context), ([A-Za-z]+)\)/.exec(text);
  if (h) return { kind: "host", message: `${h[1]}:${h[2]}` };
  return null;
}

export class SorobanCallError extends Error {
  constructor(
    message: string,
    readonly stage: "simulate" | "send" | "result",
    readonly contractError: ContractError | null,
    readonly txHash?: string,
  ) {
    super(message);
    this.name = "SorobanCallError";
  }
}

export type Signers = Record<string, { keypair: Keypair; variant: SigVariant }>;

export type InvokeOptions = {
  server: rpc.Server;
  networkPassphrase: string;
  /** İşlemin kaynağı ve ücret ödeyeni (G-hesabı). Ajan XLM tutmaz. */
  source: Keypair;
  /** Auth imzalayıcıları: adres → (keypair, varyant). */
  signers: Signers;
  /** İmzaların geçerli olacağı ledger sayısı. */
  authValidLedgers?: number;
  /**
   * Politika ihlalinde işlemi yine de zincire gönder ki başarısız işlemin hash'i
   * olsun (demoda "red zincirden geldi" kanıtı). Reddedilen çağrının simülasyonu
   * kaynak tahmini vermediği için, AYNI kontratlara dokunan ama politikaya uyan
   * bir "sonda" çağrısı verilir; onun ayak izi ve kaynakları ödünç alınır.
   */
  submitOnFailure?: { probe: xdr.Operation };
};

export type InvokeResult = {
  hash: string;
  returnValue: xdr.ScVal | undefined;
  ledger: number;
};

async function sourceAccount(server: rpc.Server, kp: Keypair): Promise<Account> {
  const acc = await server.getAccount(kp.publicKey());
  return new Account(acc.accountId(), acc.sequenceNumber());
}

function build(acc: Account, passphrase: string, op: xdr.Operation, fee = BASE_FEE): Transaction {
  return new TransactionBuilder(acc, { fee, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(60)
    .build();
}

/** Kayıt simülasyonu + gereken auth'ların imzalanması → imzalı işlem. */
async function prepareSigned(op: xdr.Operation, o: InvokeOptions) {
  const { server, networkPassphrase: pass } = o;
  const acc = await sourceAccount(server, o.source);
  const draft = build(acc, pass, op);
  const sim1 = await server.simulateTransaction(draft);
  if (rpc.Api.isSimulationError(sim1)) {
    throw new SorobanCallError(sim1.error, "simulate", parseContractError(sim1.error));
  }
  const latest = (await server.getLatestLedger()).sequence;
  const validUntil = latest + (o.authValidLedgers ?? 60);
  const entries: xdr.SorobanAuthorizationEntry[] = [];
  for (const e of sim1.result?.auth ?? []) {
    const addr = authEntryAddress(e);
    if (!addr) {
      entries.push(e);
      continue;
    }
    const s = o.signers[addr];
    if (!s) throw new Error(`Auth imzalayıcısı yok: ${addr}`);
    entries.push(await signAccountAuthEntry(e, s.keypair, validUntil, pass, s.variant));
  }
  const hostFn = draft.operations[0] as unknown as { func: xdr.HostFunction };
  const signedOp = Operation.invokeHostFunction({ func: hostFn.func, auth: entries });
  const acc2 = await sourceAccount(server, o.source);
  return { signedOp, tx: build(acc2, pass, signedOp) };
}

/**
 * Bir kontrat çağrısını, gereken özel hesap auth'larını imzalayarak gönderir.
 * Politika reddinde `SorobanCallError` fırlatır; `submitOnFailure` verilmişse
 * işlem zincire yine gönderilir ve hata başarısız işlemin hash'ini taşır.
 */
export async function invokeWithAuth(op: xdr.Operation, o: InvokeOptions): Promise<InvokeResult> {
  const { server, networkPassphrase: pass } = o;
  const { signedOp, tx: withAuth } = await prepareSigned(op, o);
  const sim2 = await server.simulateTransaction(withAuth);

  let tx: Transaction;
  if (rpc.Api.isSimulationError(sim2)) {
    const ce = parseContractError(sim2.error);
    if (!o.submitOnFailure) throw new SorobanCallError(sim2.error, "simulate", ce);

    // Sonda: politikaya uyan kardeş çağrının imzalı simülasyonu → ayak izi + kaynaklar.
    const probe = await prepareSigned(o.submitOnFailure.probe, o);
    const psim = await server.simulateTransaction(probe.tx);
    if (rpc.Api.isSimulationError(psim)) {
      throw new SorobanCallError(`sonda simülasyonu başarısız: ${psim.error}`, "simulate", ce);
    }
    const data = new SorobanDataBuilder(psim.transactionData.build())
      .setResources(20_000_000, 60_000, 20_000)
      .setResourceFee(3_000_000n)
      .build();
    // Hesap tazeden okunur: önceki taslaklar yerel sıra numarasını artırdı.
    const fresh = await sourceAccount(server, o.source);
    tx = new TransactionBuilder(fresh, { fee: "3100000", networkPassphrase: pass })
      .addOperation(signedOp)
      .setSorobanData(data)
      .setTimeout(60)
      .build();
    tx.sign(o.source);
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      // Ağ işlemi hiç kabul etmedi: zincirde hash yok, kanıt da yok.
      const why = sent.errorResult ? JSON.stringify(sent.errorResult, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 400) : "";
      throw new SorobanCallError(`${sim2.error}\n[başarısız işlem gönderilemedi: ${why}]`, "send", ce);
    }
    const final = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      // Simülasyonla zincir ayrıştı; bunu sessizce yutma.
      throw new SorobanCallError("simülasyon reddetti ama zincir kabul etti", "result", ce, sent.hash);
    }
    throw new SorobanCallError(sim2.error, "result", ce, sent.hash);
  }

  // Sıra numarası çakışmasında (aynı kaynak hesabı kullanan başka bir süreç)
  // işlem düşebilir; imzalı auth hâlâ geçerli olduğundan tazelenmiş sıra
  // numarasıyla bir kez daha denenir.
  let lastErr: SorobanCallError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = await sourceAccount(server, o.source);
    const rebuilt = build(fresh, pass, signedOp);
    tx = rpc.assembleTransaction(rebuilt, sim2).build();
    tx.sign(o.source);
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      const why = sent.errorResult
        ? JSON.stringify(sent.errorResult, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 300)
        : "";
      lastErr = new SorobanCallError(`sendTransaction reddedildi ${why}`, "send", null);
      if (why.includes("tx_bad_seq")) continue;
      throw lastErr;
    }
    const final = await server.pollTransaction(sent.hash, { attempts: 60 });
    if (final.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      lastErr = new SorobanCallError("İşlem ağdan düştü (NOT_FOUND)", "result", null, sent.hash);
      continue;
    }
    if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new SorobanCallError(`İşlem başarısız (${final.status})`, "result", null, sent.hash);
    }
    return { hash: sent.hash, returnValue: final.returnValue, ledger: final.ledger };
  }
  throw lastErr ?? new SorobanCallError("gönderilemedi", "send", null);
}

/** Salt okunur kontrat çağrısı (simülasyon). */
export async function simulateView(
  server: rpc.Server,
  networkPassphrase: string,
  sourcePublicKey: string,
  op: xdr.Operation,
): Promise<xdr.ScVal> {
  const tx = build(new Account(sourcePublicKey, "0"), networkPassphrase, op);
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new SorobanCallError(sim.error, "simulate", parseContractError(sim.error));
  }
  if (!sim.result) throw new Error("simülasyon sonuç döndürmedi");
  return sim.result.retval;
}
