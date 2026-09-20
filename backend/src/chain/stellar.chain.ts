import { Logger } from '@nestjs/common';
import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  authorizeEntry,
  contract,
  inspectAuthEntry,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { ReinkeyError } from '../common/errors';
import {
  chainCodeFromNumber,
  parseContractError,
} from '../common/reason-codes';
import type {
  AccountState,
  ChainEvent,
  ChainPort,
  ChannelState,
  PairReserves,
} from './chain.port';

export interface StellarChainOptions {
  xlmContractId?: string;
  dexPairId?: string;
}

type AnyClient = contract.Client & Record<string, any>;

const EVENT_TYPES: Record<string, ChainEvent['type']> = {
  opened: 'channel.opened',
  topped_up: 'channel.topped_up',
  claimed: 'channel.claimed',
  closed: 'channel.closed',
};

/**
 * Gerçek Stellar testnet erişimi. Kontrat istemcileri spesifikasyonu zincirden okur
 * (`contract.Client.from`), oluşturulmuş binding gerekmez.
 */
export class StellarChain implements ChainPort {
  private readonly log = new Logger('StellarChain');
  private readonly server: rpc.Server;
  private readonly keypair: Keypair;
  private readonly clients = new Map<string, Promise<AnyClient>>();
  /** Sequence çakışmasın diye claim'ler tek kuyrukta sırayla gider. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly networkPassphrase: string,
    readonly channelContractId: string,
    private readonly usdcContractId: string,
    private readonly rpcUrl: string,
    facilitatorSecret: string,
    private readonly opts: StellarChainOptions = {},
  ) {
    this.server = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
    this.keypair = Keypair.fromSecret(facilitatorSecret);
  }

  get facilitatorAddress(): string {
    return this.keypair.publicKey();
  }

  get signerAddress(): string {
    return this.keypair.publicKey();
  }

  signMessage(data: Buffer): Buffer {
    // stellar-sdk Uint8Array döndürür; kopyalamadan Buffer görünümü alınır.
    const sig = this.keypair.sign(data);
    return Buffer.from(sig.buffer, sig.byteOffset, sig.byteLength);
  }

  private client(contractId: string): Promise<AnyClient> {
    let c = this.clients.get(contractId);
    if (!c) {
      const signer = contract.basicNodeSigner(
        this.keypair,
        this.networkPassphrase,
      );
      c = contract.Client.from({
        contractId,
        rpcUrl: this.rpcUrl,
        networkPassphrase: this.networkPassphrase,
        publicKey: this.keypair.publicKey(),
        signTransaction: signer.signTransaction,
        allowHttp: this.rpcUrl.startsWith('http://'),
      }) as Promise<AnyClient>;
      c.catch(() => this.clients.delete(contractId));
      this.clients.set(contractId, c);
    }
    return c;
  }

  /** Salt okunur çağrı: simülasyon sonucunu döndürür. */
  private async read<T>(
    contractId: string,
    method: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const c = await this.client(contractId);
    const tx = await (args ? c[method](args) : c[method]());
    return unwrapResult<T>(tx.result);
  }

  readContract<T>(
    contractId: string,
    method: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    return this.read<T>(contractId, method, args);
  }

  /** Kontrat kimliğini okunur varlık adına çevirir. */
  private assetName(id: string): string {
    if (id === this.usdcContractId) return 'USDC';
    if (id === this.opts.xlmContractId) return 'XLM';
    return `${id.slice(0, 4)}…${id.slice(-4)}`;
  }

  async latestLedger(): Promise<number> {
    return (await this.server.getLatestLedger()).sequence;
  }

  async getChannel(id: bigint): Promise<ChannelState | null> {
    try {
      const ch = await this.read<any>(this.channelContractId, 'get', { id });
      if (!ch || ch.deposit === undefined) return null;
      return {
        id,
        payer: String(ch.payer),
        payee: String(ch.payee),
        asset: String(ch.asset),
        deposit: BigInt(ch.deposit),
        claimed: BigInt(ch.claimed),
        voucherKey: Buffer.from(ch.voucher_key).toString('hex'),
        expiryLedger: Number(ch.expiry_ledger),
        open: Boolean(ch.open),
      };
    } catch (e) {
      const n =
        (e as ContractResultError).contractCode ??
        parseContractError(String((e as Error)?.message ?? e));
      if (n === 20) return null;
      throw e;
    }
  }

  claim(id: bigint, cumulative: bigint, signatureHex: string) {
    const run = this.queue.then(() =>
      this.doClaim(id, cumulative, signatureHex),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doClaim(
    id: bigint,
    cumulative: bigint,
    signatureHex: string,
  ): Promise<{ tx: string }> {
    const c = await this.client(this.channelContractId);
    let hash: string | undefined;
    try {
      // Simüle et → hazırla → imzala → gönder → sonucu bekle.
      const tx = await c.claim({
        id,
        cumulative,
        sig: Buffer.from(signatureHex, 'hex'),
      });
      const sent = await tx.signAndSend();
      hash =
        sent.sendTransactionResponse?.hash ??
        sent.getTransactionResponse?.txHash;
      return { tx: hash ?? '' };
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      const n = parseContractError(text);
      this.log.warn(`claim(${id}) başarısız: ${text.slice(0, 300)}`);
      if (n !== undefined) {
        throw new ReinkeyError(
          chainCodeFromNumber(n),
          `Zincir reddetti: Error(Contract, #${n})`,
          'chain',
          402,
          hash,
        );
      }
      throw new ReinkeyError(
        'CHAIN_UNAVAILABLE',
        `claim gönderilemedi: ${text.slice(0, 200)}`,
        'chain',
        503,
        hash,
      );
    }
  }

  async getAccount(address: string): Promise<AccountState | null> {
    if (!address.startsWith('C')) return null;
    try {
      const [policy, spent, frozen, balance, balanceXlm, controller, owner] =
        await Promise.all([
          this.read<any>(address, 'get_policy'),
          this.read<any>(address, 'get_spent').catch(() => [0, 0n]),
          this.read<boolean>(address, 'is_frozen').catch(() => false),
          this.read<bigint>(this.usdcContractId, 'balance', {
            id: address,
          }).catch(() => 0n),
          this.opts.xlmContractId
            ? this.read<bigint>(this.opts.xlmContractId, 'balance', {
                id: address,
              }).catch(() => 0n)
            : Promise.resolve(0n),
          // Eski wasm'larda bu fonksiyon yok.
          this.read<unknown>(address, 'get_controller').catch(() => null),
          this.read<Uint8Array>(address, 'get_owner').catch(() => null),
        ]);
      const [day, amount] = Array.isArray(spent) ? spent : [0, 0n];
      const pairs: string[] = (policy.pairs ?? []).map(
        (p: [unknown, unknown]) =>
          `${this.assetName(String(p[0]))}→${this.assetName(String(p[1]))}`,
      );
      return {
        address,
        policy: {
          agentKey: Buffer.from(policy.agent_key ?? []).toString('hex'),
          perTxCap: BigInt(policy.per_tx_cap ?? 0),
          dailyCap: BigInt(policy.daily_cap ?? 0),
          payees: (policy.payees ?? []).map(String),
          channel: String(policy.channel ?? this.channelContractId),
          expiresLedger: Number(policy.expires_ledger ?? 0),
          asset: policy.asset ? String(policy.asset) : undefined,
          dexRouter: policy.dex_router ? String(policy.dex_router) : null,
          dexFactory: policy.dex_factory ? String(policy.dex_factory) : null,
          pairs,
          pairIds: (policy.pairs ?? []).map((p: [unknown, unknown]) => [
            String(p[0]),
            String(p[1]),
          ]),
          controller: controller ? String(controller) : null,
        },
        // Sahip bir ed25519 anahtarıdır; konsol bağlı cüzdanla karşılaştırır.
        owner: owner
          ? StrKey.encodeEd25519PublicKey(Buffer.from(owner))
          : null,
        spentToday: BigInt(amount),
        day: Number(day),
        frozen: Boolean(frozen),
        balance: BigInt(balance),
        balanceXlm: BigInt(balanceXlm),
      };
    } catch (e) {
      this.log.warn(`getAccount(${address}): ${(e as Error).message}`);
      return null;
    }
  }

  // ---- DEX fiyatı ----

  private pairTokens?: Promise<{ token0: string; token1: string }>;

  async getPairReserves(): Promise<PairReserves> {
    const pair = this.opts.dexPairId;
    if (!pair) throw new Error('DEX_PAIR_ID tanımlı değil');
    this.pairTokens ??= Promise.all([
      this.read<string>(pair, 'token_0'),
      this.read<string>(pair, 'token_1'),
    ])
      .then(([token0, token1]) => ({
        token0: String(token0),
        token1: String(token1),
      }))
      .catch((e) => {
        this.pairTokens = undefined;
        throw e;
      });
    const [{ token0, token1 }, reserves, ledger] = await Promise.all([
      this.pairTokens,
      this.read<[bigint, bigint]>(pair, 'get_reserves'),
      this.latestLedger(),
    ]);
    const [r0, r1] = [BigInt(reserves[0]), BigInt(reserves[1])];
    // Token sırası varsayılmaz: token_0 / token_1 çıktısına bakılır.
    if (token0 === this.usdcContractId)
      return { pair, reserveUsdc: r0, reserveXlm: r1, ledger };
    if (token1 === this.usdcContractId)
      return { pair, reserveUsdc: r1, reserveXlm: r0, ledger };
    throw new Error(`Havuzda USDC yok (${token0}, ${token1})`);
  }

  // ---- Sahip işlemleri (demo kontrolleri) ----

  setFrozen(account: string, frozen: boolean, ownerSecret: string) {
    const run = this.queue.then(() =>
      this.doSetFrozen(account, frozen, ownerSecret),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * `freeze` / `unfreeze`: hesabın kendi auth'unu ister; `Sig::Owner` ile imzalanır.
   * Kayıt simülasyonu → auth imzası → uygulama simülasyonu → gönder.
   */
  private async doSetFrozen(
    account: string,
    frozen: boolean,
    ownerSecret: string,
  ): Promise<{ tx: string }> {
    const owner = Keypair.fromSecret(ownerSecret);
    const op = new Contract(account).call(frozen ? 'freeze' : 'unfreeze');
    const source = async () => {
      const a = await this.server.getAccount(this.keypair.publicKey());
      return new Account(a.accountId(), a.sequenceNumber());
    };
    const build = (acc: Account, o: xdr.Operation) =>
      new TransactionBuilder(acc, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(o)
        .setTimeout(60)
        .build();

    const draft = build(await source(), op);
    const sim1 = await this.server.simulateTransaction(draft);
    if (rpc.Api.isSimulationError(sim1)) throw this.chainError(sim1.error);
    const validUntil = (await this.latestLedger()) + 60;
    const entries: xdr.SorobanAuthorizationEntry[] = [];
    for (const e of sim1.result?.auth ?? []) {
      if (inspectAuthEntry(e).address !== account) {
        entries.push(e);
        continue;
      }
      entries.push(
        await authorizeEntry(
          e,
          async (_pre, payload) => ({
            signatureScVal: xdr.ScVal.scvVec([
              xdr.ScVal.scvSymbol('Owner'),
              xdr.ScVal.scvBytes(owner.sign(Buffer.from(payload))),
            ]),
          }),
          validUntil,
          this.networkPassphrase,
        ),
      );
    }
    const func = (draft.operations[0] as unknown as { func: xdr.HostFunction })
      .func;
    const signedOp = Operation.invokeHostFunction({ func, auth: entries });
    const withAuth = build(await source(), signedOp);
    const sim2 = await this.server.simulateTransaction(withAuth);
    if (rpc.Api.isSimulationError(sim2)) throw this.chainError(sim2.error);
    const tx = rpc
      .assembleTransaction(build(await source(), signedOp), sim2)
      .build();
    tx.sign(this.keypair);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === 'ERROR')
      throw new ReinkeyError(
        'CHAIN_UNAVAILABLE',
        'freeze işlemi ağ tarafından kabul edilmedi',
        'chain',
        503,
      );
    const final = await this.server.pollTransaction(sent.hash, {
      attempts: 40,
    });
    if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS)
      throw new ReinkeyError(
        'TX_FAILED',
        `freeze işlemi başarısız (${final.status})`,
        'chain',
        502,
        sent.hash,
      );
    return { tx: sent.hash };
  }

  private chainError(text: string): ReinkeyError {
    const n = parseContractError(text);
    return n !== undefined
      ? new ReinkeyError(
          chainCodeFromNumber(n),
          `Zincir reddetti: Error(Contract, #${n})`,
          'chain',
          402,
        )
      : new ReinkeyError(
          'CHAIN_UNAVAILABLE',
          text.slice(0, 200),
          'chain',
          503,
        );
  }

  async getTransactionStatus(hash: string) {
    const r = await this.server.getTransaction(hash);
    if (r.status === rpc.Api.GetTransactionStatus.SUCCESS)
      return { status: 'SUCCESS' as const };
    if (r.status === rpc.Api.GetTransactionStatus.NOT_FOUND)
      return { status: 'NOT_FOUND' as const };
    return {
      status: 'FAILED' as const,
      contractErrorCode: this.findContractError(r),
    };
  }

  /**
   * Başarısız işlemin tanı olaylarından `Error(Contract, #N)` değerini bulur.
   * Politika reddinde üst düzey hata `Error(Auth, InvalidAction)` olur; bizim
   * kodumuz "failed account authentication" tanı olayının verisindedir (§15).
   */
  private findContractError(r: unknown): number | undefined {
    const codes: number[] = [];
    collectContractCodes(
      (r as { diagnosticEventsXdr?: unknown }).diagnosticEventsXdr,
      codes,
      new Set(),
    );
    // Hesap politikası kodları (1–11) önceliklidir; yoksa ilk kontrat kodu.
    return codes.find((c) => c >= 1 && c <= 11) ?? codes[0];
  }

  async pollEvents(
    fromLedger: number,
  ): Promise<{ events: ChainEvent[]; latestLedger: number }> {
    const latest = await this.latestLedger();
    const start = Math.max(fromLedger, latest - 10_000);
    if (start > latest) return { events: [], latestLedger: latest };
    const res = await this.server.getEvents({
      startLedger: start,
      filters: [{ type: 'contract', contractIds: [this.channelContractId] }],
      limit: 500,
    });
    const events: ChainEvent[] = [];
    for (const e of res.events) {
      try {
        const topics = e.topic.map((t) => scValToNative(t));
        if (topics[0] !== 'channel') continue;
        const type = EVENT_TYPES[String(topics[1])];
        if (!type) continue;
        const raw = scValToNative(e.value) ?? {};
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          // snake_case → camelCase (expiry_ledger → expiryLedger)
          data[k.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] =
            String(v);
        }
        events.push({
          type,
          channelId: BigInt(topics[2]),
          data,
          tx: e.txHash,
          ledger: e.ledger,
        });
      } catch (err) {
        this.log.warn(`olay çözülemedi: ${(err as Error).message}`);
      }
    }
    return { events, latestLedger: res.latestLedger ?? latest };
  }
}

/** `Result<T, Error>` dönen kontrat fonksiyonlarının sarmalayıcısını açar. */
interface ContractResultError extends Error {
  contractCode?: number;
}

function unwrapResult<T>(result: unknown): T {
  const r = result as {
    isErr?: () => boolean;
    isOk?: () => boolean;
    unwrap?: () => T;
    unwrapErr?: () => { message?: string };
  };
  if (r && typeof r.isErr === 'function' && typeof r.unwrap === 'function') {
    if (r.isErr()) {
      const msg = r.unwrapErr?.().message ?? '';
      const err: ContractResultError = new Error(
        `kontrat hata döndürdü: ${msg}`,
      );
      // Boş mesaj: spesifikasyonda hata adı yok; çağıran taraf "bulunamadı" sayar.
      err.contractCode = parseContractError(msg) ?? (msg === '' ? 20 : undefined);
      throw err;
    }
    return r.unwrap();
  }
  return result as T;
}

/**
 * stellar-sdk 17 XDR nesnelerinde `{ type: 'sceContract', contractCode }`
 * düğümlerini (yani `Error(Contract, #N)`) sırayla toplar.
 */
function collectContractCodes(
  v: unknown,
  out: number[],
  seen: Set<unknown>,
): void {
  if (!v || typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  const o = v as Record<string, unknown>;
  if (o.type === 'sceContract' && typeof o.contractCode === 'number') {
    out.push(o.contractCode);
    return;
  }
  for (const x of Array.isArray(v) ? v : Object.values(o))
    collectContractCodes(x, out, seen);
}
