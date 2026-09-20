"use client";

/**
 * KENDİ HESABINI KURMAK VE SINIRLARINI DEĞİŞTİRMEK (tarayıcıdan, emanetsiz).
 *
 * Reinkey hesabı bir Soroban özel hesabıdır: sahip bir ed25519 anahtarıdır ve
 * `set_policy` / `freeze` çağrılarını YALNIZCA o anahtar yetkilendirebilir.
 * Kontrat klasik hesap imzası beklemez, kendi tipini bekler:
 *
 *     enum Sig { Owner(BytesN<64>), Agent(BytesN<64>) }
 *
 * Bu yüzden burada işlem imzası değil, auth girdisinin ÖNİMAJI cüzdana
 * imzalatılır (`signAuthEntry`) ve çıkan 64 bayt `Sig::Owner(...)` olarak
 * kimlik bilgisine yerleştirilir. Kaynak: `scripts/lib/account-auth.mjs`,
 * `contracts/reinkey-account/src/lib.rs`.
 *
 * Sunucumuz bu akışın hiçbir adımında yoktur: sahip anahtarı cüzdanda kalır,
 * sınırlar doğrudan zincire yazılır. Sınırı biz değil, kullanıcı koyar.
 */
import type { ChainEnv } from "./chain";

export type PolicyInput = {
  /** Ajanın ed25519 açık anahtarı: G… ya da 64 haneli hex. */
  agentKey: string;
  /** Tavanların uygulandığı varlık (USDC SAC). */
  asset: string;
  perTxCap: bigint;
  dailyCap: bigint;
  payees: string[];
  channel: string;
  expiresLedger: number;
  dexRouter: string | null;
  dexFactory: string | null;
  /** İzinli (satılan, alınan) kontrat adresi çiftleri. */
  pairs: [string, string][];
};

/** Auth girdisinin önimajını imzalayıp 64 baytlık ham imzayı döner. */
export type AuthSigner = (preimageXdr: string, networkPassphrase: string, address: string) => Promise<Uint8Array>;

/** İşlemi imzalayıp imzalı XDR'ı döner (ücreti kaynak hesap öder). */
export type TxSigner = (xdr: string, networkPassphrase: string, address: string) => Promise<string>;

async function sdk() {
  return import("@stellar/stellar-sdk");
}

/**
 * Anahtarın ham 32 baytı: kontrat `BytesN<32>` bekler, StrKey değil. G… adresi
 * ya da 64 haneli hex kabul edilir (backend ajan anahtarını hex döner).
 */
export async function rawEd25519(key: string): Promise<Uint8Array> {
  if (/^[0-9a-f]{64}$/i.test(key)) return Uint8Array.from(Buffer.from(key, "hex"));
  const { StrKey } = await sdk();
  return StrKey.decodeEd25519PublicKey(key);
}

/** Tarayıcıda yeni bir ajan anahtarı üretir. Gizli kısım yalnızca kullanıcıya gösterilir. */
export async function newAgentKey(): Promise<{ publicKey: string; secret: string }> {
  const { Keypair } = await sdk();
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

/** Bir günde kapanan ledger sayısı (~5 sn); kontrattaki LEDGERS_PER_DAY ile aynı. */
export const LEDGERS_PER_DAY = 17_280;

/**
 * `Policy` struct'ının ScVal karşılığı. Soroban struct'ı alan adları sıralı bir
 * harita olarak kodlar; sıra bozulursa kontrat girdiyi okuyamaz.
 */
export async function policyScVal(p: PolicyInput) {
  const { Address, nativeToScVal, xdr } = await sdk();
  const sym = (s: string) => xdr.ScVal.scvSymbol(s);
  const addr = (a: string) => new Address(a).toScVal();
  const opt = (a: string | null) => (a ? addr(a) : xdr.ScVal.scvVoid());
  const entry = (key: string, val: import("@stellar/stellar-sdk").xdr.ScVal) =>
    new xdr.ScMapEntry({ key: sym(key), val });

  // Alfabetik sıra zorunludur (ScVal harita anahtarı sıralaması).
  return xdr.ScVal.scvMap([
    entry("agent_key", xdr.ScVal.scvBytes(Buffer.from(await rawEd25519(p.agentKey)))),
    entry("asset", addr(p.asset)),
    entry("channel", addr(p.channel)),
    entry("daily_cap", nativeToScVal(p.dailyCap, { type: "i128" })),
    entry("dex_factory", opt(p.dexFactory)),
    entry("dex_router", opt(p.dexRouter)),
    entry("expires_ledger", nativeToScVal(p.expiresLedger, { type: "u32" })),
    entry("pairs", xdr.ScVal.scvVec(p.pairs.map(([sell, buy]) => xdr.ScVal.scvVec([addr(sell), addr(buy)])))),
    entry("payees", xdr.ScVal.scvVec(p.payees.map(addr))),
    entry("per_tx_cap", nativeToScVal(p.perTxCap, { type: "i128" })),
  ]);
}

/** `Sig::Owner(sig)` ScVal'ı: tuple varyantlı enum = Vec[Symbol, Bytes]. */
async function ownerSig(signature: Uint8Array) {
  const { xdr } = await sdk();
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Owner"), xdr.ScVal.scvBytes(Buffer.from(signature))]);
}

/**
 * Hesabın kendi adresine ait auth girdilerini sahip imzasıyla imzalar; başka
 * adrese ait girdilere dokunmaz.
 */
async function signOwnerEntries(
  entries: unknown[],
  opts: { accountId: string; owner: string; env: ChainEnv; validUntilLedger: number; signAuth: AuthSigner },
) {
  const { authorizeEntry } = await sdk();
  const out: unknown[] = [];
  for (const entry of entries) {
    try {
      out.push(
        await authorizeEntry(
          entry as Parameters<typeof authorizeEntry>[0],
          async (preimage) => ({
            signatureScVal: await ownerSig(
              await opts.signAuth(preimage.toXDR("base64"), opts.env.networkPassphrase, opts.owner),
            ),
          }),
          opts.validUntilLedger,
          opts.env.networkPassphrase as Parameters<typeof authorizeEntry>[3],
          opts.accountId,
        ),
      );
    } catch (e) {
      if (/no credential node for address/.test(String(e))) out.push(entry);
      else throw e;
    }
  }
  return out as Parameters<typeof authorizeEntry>[0][];
}

/**
 * Hesabın yönetim çağrısını (`set_policy`, `freeze`, `unfreeze`) sahip
 * imzasıyla yapar. İşlem ücretini bağlanan cüzdan öder; yetkiyi sahip verir.
 */
export async function invokeAsOwner(opts: {
  env: ChainEnv;
  accountId: string;
  method: string;
  args: import("@stellar/stellar-sdk").xdr.ScVal[];
  /** Ücreti ödeyen ve sahip anahtarını taşıyan cüzdan adresi. */
  owner: string;
  sign: TxSigner;
  signAuth: AuthSigner;
}): Promise<{ hash: string }> {
  const { Account, Contract, Operation, TransactionBuilder, rpc } = await sdk();
  const server = new rpc.Server(opts.env.rpcUrl, { allowHttp: opts.env.rpcUrl.startsWith("http://") });
  const source = await server.getAccount(opts.owner);

  const call = new Contract(opts.accountId).call(opts.method, ...opts.args);
  const build = (op: ReturnType<typeof Operation.invokeHostFunction>) =>
    new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), {
      fee: "1000000",
      networkPassphrase: opts.env.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(120)
      .build();

  // 1. kaydetme modunda simülasyon: auth girdileri çıkar (__check_auth çalışmaz).
  const rec = await server.simulateTransaction(build(call));
  if (rpc.Api.isSimulationError(rec)) throw new Error(reason(rec.error));
  const latest = (await server.getLatestLedger()).sequence;
  const signedAuth = await signOwnerEntries(rec.result?.auth ?? [], {
    accountId: opts.accountId,
    owner: opts.owner,
    env: opts.env,
    validUntilLedger: latest + 60,
    signAuth: opts.signAuth,
  });
  const func = (build(call).operations[0] as unknown as { func: Parameters<typeof Operation.invokeHostFunction>[0]["func"] }).func;
  const withAuth = build(Operation.invokeHostFunction({ func, auth: signedAuth }));

  // 2. imzalı auth ile simülasyon: __check_auth burada gerçekten çalışır.
  const sim = await server.simulateTransaction(withAuth);
  if (rpc.Api.isSimulationError(sim)) throw new Error(reason(sim.error));

  return submit(server, rpc.assembleTransaction(withAuth, sim).build(), opts.env, opts.owner, opts.sign);
}

/**
 * Kullanıcının KENDİ Reinkey hesabını kurar: dağıtılmış hesap kodunun aynısı,
 * sahibi bağlanan cüzdan. Kurucu argümanları sahip anahtarı ve ilk politikadır;
 * yetki işlemin kaynağından gelir, ayrı bir auth imzası gerekmez.
 */
export async function createAccount(opts: {
  env: ChainEnv;
  wasmHash: string;
  owner: string;
  policy: PolicyInput;
  sign: TxSigner;
}): Promise<{ hash: string; contractId: string }> {
  const { Address, Operation, TransactionBuilder, rpc, scValToNative, xdr } = await sdk();
  const server = new rpc.Server(opts.env.rpcUrl, { allowHttp: opts.env.rpcUrl.startsWith("http://") });
  const source = await server.getAccount(opts.owner);
  const salt = crypto.getRandomValues(new Uint8Array(32));

  const tx = new TransactionBuilder(source, { fee: "1000000", networkPassphrase: opts.env.networkPassphrase })
    .addOperation(
      Operation.createCustomContract({
        address: new Address(opts.owner),
        wasmHash: Buffer.from(opts.wasmHash, "hex"),
        salt,
        constructorArgs: [
          xdr.ScVal.scvBytes(Buffer.from(await rawEd25519(opts.owner))),
          await policyScVal(opts.policy),
        ],
      }),
    )
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(reason(sim.error));
  const prepared = rpc.assembleTransaction(tx, sim).build();
  const { hash, returnValue } = await submit(server, prepared, opts.env, opts.owner, opts.sign);

  // Yeni hesabın adresi: host fonksiyonunun dönüş değeri. Simülasyon da aynısını
  // verir ama kesin olan zincirin döndürdüğüdür.
  const scv = returnValue ?? sim.result?.retval;
  const contractId = scv ? (scValToNative(scv) as string) : "";
  return { hash, contractId };
}

type Server = InstanceType<typeof import("@stellar/stellar-sdk").rpc.Server>;

/** İmzala, gönder, kesinleşmesini bekle. */
async function submit(
  server: Server,
  tx: { toXDR(): string },
  env: ChainEnv,
  address: string,
  sign: TxSigner,
): Promise<{ hash: string; returnValue?: import("@stellar/stellar-sdk").xdr.ScVal }> {
  const { TransactionBuilder } = await sdk();
  const signedXdr = await sign(tx.toXDR(), env.networkPassphrase, address);
  const signed = TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(reason(sent.errorResult?.toXDR("base64") ?? sent.status));
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await server.getTransaction(sent.hash);
    if (got.status === "SUCCESS") return { hash: sent.hash, returnValue: got.returnValue };
    if (got.status === "FAILED") throw new Error(reason(got.resultXdr?.toXDR("base64") ?? "FAILED"));
  }
  // Zaman aşımı: işlem yine de geçmiş olabilir, kullanıcı explorer'dan bakar.
  return { hash: sent.hash };
}

/** reinkey-account hata kodları: ham `Error(Contract, #N)` kullanıcıya gösterilmez. */
const CODES: Record<string, string> = {
  "1": "BAD_SIGNATURE",
  "2": "POLICY_EXPIRED",
  "3": "ACCOUNT_FROZEN",
  "4": "CONTEXT_NOT_ALLOWED",
  "5": "PAYEE_NOT_ALLOWED",
  "6": "PER_TX_CAP_EXCEEDED",
  "7": "DAILY_CAP_EXCEEDED",
  "8": "PAIR_NOT_ALLOWED",
  "9": "SLIPPAGE_UNBOUNDED",
  "11": "CONTROLLER_MISMATCH",
};

function reason(text: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  if (m) return CODES[m[1]] ?? `CONTRACT_${m[1]}`;
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
