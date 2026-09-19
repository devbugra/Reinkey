/**
 * Reinkey Account için özel hesap auth'u (JS, @stellar/stellar-sdk 17).
 *
 * Kontrat (`contracts/reinkey-account/src/lib.rs`) imzayı şu tipte bekler:
 *
 *   enum Sig { Owner(BytesN<64>), Agent(BytesN<64>) }
 *
 * Soroban'da tuple varyantlı contracttype enum ScVal olarak
 * `Vec[Symbol("<Varyant>"), Bytes(<64 bayt>)]` biçiminde kodlanır.
 *
 * İmzalanan payload'ı SDK'nın `authorizeEntry` fonksiyonu hesaplar: hem eski
 * `sorobanCredentialsAddress` hem de adrese bağlı `sorobanCredentialsAddressV2`
 * (CAP-71) biçimini doğru önimajla kurar. Biz yalnızca imzayı üretip
 * `{ signatureScVal }` olarak geri veririz; SDK onu kimlik bilgisine yerleştirir.
 * (SDK'nın varsayılan imza biçimi klasik hesap içindir ve kontratımıza uymaz.)
 */
import {
  Account,
  authorizeEntry,
  Contract,
  Keypair,
  Operation,
  rpc,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

const FEE = "1000000"; // 0,1 XLM üst sınır; gerçek ücret simülasyondan eklenir

/** 32 baytlık hex seed → Keypair. */
export function keypairFromSeedHex(seedHex) {
  return Keypair.fromRawEd25519Seed(Buffer.from(seedHex, "hex"));
}

/** `Sig::Agent(sig)` / `Sig::Owner(sig)` ScVal'ı. */
export function sigScVal(kind, signature) {
  if (kind !== "Agent" && kind !== "Owner") throw new Error(`bilinmeyen imza türü: ${kind}`);
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind), xdr.ScVal.scvBytes(Buffer.from(signature))]);
}

/**
 * Auth girdilerinden `accountId` adresine ait olanları `kind` imzasıyla imzalar;
 * diğerlerini olduğu gibi bırakır.
 */
export async function signAccountEntries(entries, { accountId, keypair, kind, networkPassphrase, validUntilLedger }) {
  const out = [];
  for (const entry of entries) {
    const t = entry.credentials?.type;
    if (t !== "sorobanCredentialsAddress" && t !== "sorobanCredentialsAddressV2") {
      out.push(entry);
      continue;
    }
    try {
      out.push(
        await authorizeEntry(
          entry,
          async (_preimage, payload) => ({ signatureScVal: sigScVal(kind, keypair.sign(Buffer.from(payload))) }),
          validUntilLedger,
          networkPassphrase,
          accountId,
        ),
      );
    } catch (e) {
      // Bu girdi başka bir adrese ait: dokunma.
      if (/no credential node for address/.test(String(e))) out.push(entry);
      else throw e;
    }
  }
  return out;
}

/** "Error(Contract, #6)" → 6. */
export function contractErrorCode(text) {
  const m = /Error\(Contract, #(\d+)\)/.exec(String(text));
  return m ? Number(m[1]) : null;
}

/** reinkey-account ve channel hata kodları (docs/BACKEND.md §3.3, §13; proje-tanimi.md §3.6). */
export const CHAIN_CODES = {
  1: "BAD_SIGNATURE",
  2: "POLICY_EXPIRED",
  3: "ACCOUNT_FROZEN",
  4: "CONTEXT_NOT_ALLOWED",
  5: "PAYEE_NOT_ALLOWED",
  6: "PER_TX_CAP_EXCEEDED",
  7: "DAILY_CAP_EXCEEDED",
  8: "PAIR_NOT_ALLOWED",
  9: "SLIPPAGE_UNBOUNDED",
  20: "CHANNEL_NOT_FOUND",
  21: "CHANNEL_CLOSED",
  22: "VOUCHER_BAD_SIGNATURE",
  23: "VOUCHER_NOT_INCREASING",
  24: "EXCEEDS_DEPOSIT",
  25: "NOT_EXPIRED",
  26: "NOT_AUTHORIZED",
  27: "INVALID_ARGUMENT",
};

async function prepareSigned({ server, networkPassphrase, source, contractId, method, args, accountId, keypair, kind, ledgersValid }) {
  const { sequence } = await server.getAccount(source.publicKey()).then((a) => ({ sequence: a.sequenceNumber() }));
  const build = (op) =>
    new TransactionBuilder(new Account(source.publicKey(), sequence), { fee: FEE, networkPassphrase })
      .addOperation(op)
      .setTimeout(120)
      .build();
  const call = new Contract(contractId).call(method, ...args);

  // 1. kaydetme modunda simülasyon: auth girdileri çıkar (__check_auth çalışmaz)
  const rec = await server.simulateTransaction(build(call));
  if (rpc.Api.isSimulationError(rec)) {
    return { error: rec.error, stage: "record" };
  }
  const latest = (await server.getLatestLedger()).sequence;
  const signed = await signAccountEntries(rec.result.auth, {
    accountId,
    keypair,
    kind,
    networkPassphrase,
    validUntilLedger: latest + ledgersValid,
  });
  const func = build(call).operations[0].func;
  const withAuth = () => build(Operation.invokeHostFunction({ func, auth: signed }));

  // 2. imzalı auth ile simülasyon: __check_auth burada gerçekten çalışır
  const sim = await server.simulateTransaction(withAuth());
  return { rec, sim, withAuth };
}

async function send(server, tx, source) {
  tx.sign(source);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") return { ok: false, stage: "send", hash: sent.hash, error: String(sent.errorResult?.result?.type ?? "ERROR") };
  let r = await server.getTransaction(sent.hash);
  for (let i = 0; i < 40 && r.status === "NOT_FOUND"; i++) {
    await new Promise((s) => setTimeout(s, 1000));
    r = await server.getTransaction(sent.hash);
  }
  if (r.status === "SUCCESS") return { ok: true, hash: sent.hash, returnValue: r.returnValue };
  return { ok: false, stage: "chain", hash: sent.hash, status: r.status, diagnostic: r };
}

/**
 * Reinkey Account adına bir kontrat çağrısı yapar. Ücreti `source` öder.
 *
 * Politika reddi normalde imzalı simülasyonda `Error(Contract, #N)` olarak
 * yakalanır ve işlem gönderilmez. `submitOnReject` verilirse reddedilecek
 * işlem yine de zincire gönderilir; böylece red zincirde, başarısız bir tx
 * hash'iyle kayda geçer. Reddedilen simülasyon footprint üretmediği için
 * footprint, `probeArgs` ile verilen izinli ve aynı yapıdaki bir çağrının
 * simülasyonundan ödünç alınır (aynı depolama anahtarlarını okur).
 *
 * Döner: { ok, hash?, code?, codeName?, stage?, error?, returnValue? }
 */
export async function invokeAsAccount(opts) {
  const {
    server,
    networkPassphrase,
    source,
    contractId,
    method,
    args,
    accountId,
    keypair,
    kind = "Agent",
    submitOnReject = false,
    probeArgs = null,
    ledgersValid = 60,
  } = opts;
  const p = await prepareSigned({ server, networkPassphrase, source, contractId, method, args, accountId, keypair, kind, ledgersValid });
  if (p.error) {
    const code = contractErrorCode(p.error);
    return { ok: false, stage: p.stage, code, codeName: CHAIN_CODES[code], error: p.error };
  }
  if (!rpc.Api.isSimulationError(p.sim)) {
    return send(server, rpc.assembleTransaction(p.withAuth(), p.sim).build(), source);
  }

  const code = contractErrorCode(p.sim.error);
  const rejected = { ok: false, stage: "simulate", code, codeName: CHAIN_CODES[code], error: p.sim.error };
  if (!submitOnReject) return rejected;
  if (!probeArgs) throw new Error("submitOnReject için probeArgs gerekli (izinli, aynı yapıda bir çağrı)");

  const probe = await prepareSigned({ ...opts, kind, args: probeArgs, ledgersValid });
  if (probe.error || rpc.Api.isSimulationError(probe.sim)) {
    return { ...rejected, error: `sonda simülasyonu da başarısız: ${probe.error ?? probe.sim.error}` };
  }
  const base = rpc.assembleTransaction(p.withAuth(), probe.sim).build();
  const probeData = probe.sim.transactionData.build();
  const r = probeData.resources;
  const data = new SorobanDataBuilder(probeData).setResources(
    Number(r.instructions) * 2,
    Number(r.diskReadBytes),
    Number(r.writeBytes),
  );
  const tx = TransactionBuilder.cloneFrom(base, {
    fee: String(Number(base.fee) * 2),
    sorobanData: data.build(),
    networkPassphrase,
  }).build();
  const res = await send(server, tx, source);
  return { ...res, code, codeName: CHAIN_CODES[code], simulated: rejected.error };
}
