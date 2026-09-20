/**
 * Reinkey Account ve kanal işlemleri.
 *
 * Ajan hiçbir işlemin kaynağı değildir: işlemi relayer (ücret ödeyen G-hesabı)
 * gönderir, ajan yalnızca auth girişini imzalar. Politika zincirde uygulanır;
 * ihlal `SorobanCallError.contractError` ile döner.
 */
import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { chainCodeName, voucherPublicKey } from "@reinkey/core";
import {
  invokeWithAuth,
  simulateView,
  SorobanCallError,
  type Signers,
} from "./soroban.ts";

export type Policy = {
  agentKey: Uint8Array;
  asset: string;
  perTxCap: bigint;
  dailyCap: bigint;
  payees: string[];
  channel: string;
  expiresLedger: number;
  /** Katman 2 (DEX) alanları; kontrat sürümünde yoksa undefined. */
  dexRouter?: string;
  pairs?: [string, string][];
};

export type ChannelState = {
  id: bigint;
  payer: string;
  payee: string;
  asset: string;
  deposit: bigint;
  claimed: bigint;
  voucherKey: Uint8Array;
  expiryLedger: number;
  open: boolean;
};

export type AccountOptions = {
  rpcUrl: string;
  networkPassphrase: string;
  /** Reinkey Account (C-adresi). */
  accountId: string;
  channelContractId: string;
  usdcContractId: string;
  /** Ajanın ed25519 anahtarı (politikadaki `agent_key`). */
  agent: Keypair;
  /** İşlem ücretini ödeyen G-hesabı. */
  relayer: Keypair;
  dexRouterId?: string;
  xlmContractId?: string;
};

/** Zincir hatasını sebep koduna çevirir (örn. 6 → PER_TX_CAP_EXCEEDED). */
export function chainReason(e: unknown): string | null {
  if (!(e instanceof SorobanCallError) || !e.contractError) return null;
  return e.contractError.kind === "contract"
    ? chainCodeName(e.contractError.code)
    : e.contractError.message;
}

export class ReinkeyAccount {
  readonly server: rpc.Server;
  private readonly signers: Signers;

  constructor(readonly o: AccountOptions) {
    this.server = new rpc.Server(o.rpcUrl);
    this.signers = { [o.accountId]: { keypair: o.agent, variant: "Agent" } };
  }

  private call(contractId: string, fn: string, ...args: xdr.ScVal[]): xdr.Operation {
    return new Contract(contractId).call(fn, ...args);
  }

  private async view<T>(op: xdr.Operation): Promise<T> {
    const v = await simulateView(
      this.server,
      this.o.networkPassphrase,
      this.o.relayer.publicKey(),
      op,
    );
    return scValToNative(v) as T;
  }

  private async send(op: xdr.Operation, probe?: xdr.Operation) {
    return invokeWithAuth(op, {
      server: this.server,
      networkPassphrase: this.o.networkPassphrase,
      source: this.o.relayer,
      signers: this.signers,
      submitOnFailure: probe ? { probe } : undefined,
    });
  }

  async getPolicy(): Promise<Policy> {
    const p = await this.view<Record<string, unknown>>(this.call(this.o.accountId, "get_policy"));
    return {
      agentKey: p.agent_key as Uint8Array,
      asset: String(p.asset),
      perTxCap: BigInt(p.per_tx_cap as string | bigint),
      dailyCap: BigInt(p.daily_cap as string | bigint),
      payees: (p.payees as string[]) ?? [],
      channel: String(p.channel),
      expiresLedger: Number(p.expires_ledger),
      dexRouter: p.dex_router ? String(p.dex_router) : undefined,
      pairs: (p.pairs as [string, string][]) ?? undefined,
    };
  }

  async getSpent(): Promise<{ day: number; amount: bigint }> {
    const [day, amount] = await this.view<[number, bigint]>(this.call(this.o.accountId, "get_spent"));
    return { day: Number(day), amount: BigInt(amount) };
  }

  async isFrozen(): Promise<boolean> {
    return this.view<boolean>(this.call(this.o.accountId, "is_frozen"));
  }

  async usdcBalance(): Promise<bigint> {
    return BigInt(
      await this.view<bigint>(
        this.call(this.o.usdcContractId, "balance", new Address(this.o.accountId).toScVal()),
      ),
    );
  }

  async latestLedger(): Promise<number> {
    return (await this.server.getLatestLedger()).sequence;
  }

  private openOp(payee: string, deposit: bigint, voucherKeyPub: Uint8Array, expiryLedger: number) {
    return this.call(
      this.o.channelContractId,
      "open",
      new Address(this.o.accountId).toScVal(),
      new Address(payee).toScVal(),
      new Address(this.o.usdcContractId).toScVal(),
      nativeToScVal(deposit, { type: "i128" }),
      xdr.ScVal.scvBytes(Buffer.from(voucherKeyPub)),
      nativeToScVal(expiryLedger, { type: "u32" }),
    );
  }

  /**
   * Kanal açar. Kupon anahtarı kanala özeldir: ajan anahtarı çalınsa bile
   * yalnızca o kanalın kuponları imzalanabilir.
   */
  async openChannel(params: {
    payee: string;
    deposit: bigint;
    voucherSecret: Uint8Array;
    /** Kaç ledger sonra süresi dolsun (varsayılan ~1 saat). */
    ttlLedgers?: number;
    /** Reddedilirse başarısız işlemi yine de gönder (demo kanıtı). */
    probeDeposit?: bigint;
  }): Promise<{ channelId: bigint; tx: string; expiryLedger: number }> {
    const expiry = (await this.latestLedger()) + (params.ttlLedgers ?? 720);
    const pub = voucherPublicKey(params.voucherSecret);
    const op = this.openOp(params.payee, params.deposit, pub, expiry);
    const probe =
      params.probeDeposit !== undefined
        ? this.openOp(params.payee, params.probeDeposit, pub, expiry)
        : undefined;
    const r = await this.send(op, probe);
    return {
      channelId: BigInt(scValToNative(r.returnValue!) as string | bigint),
      tx: r.hash,
      expiryLedger: expiry,
    };
  }

  /**
   * DEX fiyatı: `amountOut` kadar `path[1]` almak için kaç `path[0]` gerekir
   * (Soroswap `router_get_amounts_in`; havuz ücreti dahil). Salt okunur.
   */
  async quoteIn(amountOut: bigint, path: [string, string]): Promise<bigint> {
    const router = this.o.dexRouterId;
    if (!router) throw new Error("dexRouterId tanımlı değil");
    const amounts = await this.view<(string | bigint)[]>(
      this.call(
        router,
        "router_get_amounts_in",
        nativeToScVal(amountOut, { type: "i128" }),
        nativeToScVal([new Address(path[0]), new Address(path[1])]),
      ),
    );
    return BigInt(amounts[0]);
  }

  /**
   * HERHANGİ BİR VARLIKLA ÖDE (katman 3). Hesapta USDC yoksa bile kanal açılır:
   * gereken XLM DEX'te USDC'ye çevrilir, ardından depozito kilitlenir. Satıcı her
   * zaman USDC alır; ödeme rayı ile takas rayı aynı ağdadır.
   *
   * İki zincir işlemidir (Soroban'da işlem başına tek kontrat çağrısı): takas,
   * sonra açılış. İkisi de hesabın politikasından geçer: çift izinli olmalı,
   * `minOut` zorunludur (burada depozitonun kendisi), depozito tavana sayılır.
   * Kontrat yalnızca girdi-sabit takasa izin verdiği için girdi, fiyatın üstüne
   * `slippageBps` pay eklenerek hesaplanır; artan USDC hesapta kalır.
   */
  async openChannelWith(params: {
    payee: string;
    deposit: bigint;
    voucherSecret: Uint8Array;
    payWith: "XLM";
    /** Fiyat ile gönderim arasındaki oynamaya pay (baz puan; varsayılan %1). */
    slippageBps?: number;
    ttlLedgers?: number;
  }): Promise<{
    channelId: bigint;
    tx: string;
    expiryLedger: number;
    swap: { tx: string; sold: bigint; bought: bigint };
  }> {
    if (!this.o.xlmContractId) throw new Error("xlmContractId tanımlı değil");
    const path: [string, string] = [this.o.xlmContractId, this.o.usdcContractId];
    const quoted = await this.quoteIn(params.deposit, path);
    const amountIn = quoted + (quoted * BigInt(params.slippageBps ?? 100)) / 10_000n + 1n;
    const swapped = await this.swap({ amountIn, minOut: params.deposit, path });
    const opened = await this.openChannel({
      payee: params.payee,
      deposit: params.deposit,
      voucherSecret: params.voucherSecret,
      ttlLedgers: params.ttlLedgers,
    });
    return {
      ...opened,
      swap: { tx: swapped.tx, sold: amountIn, bought: swapped.amounts.at(-1) ?? 0n },
    };
  }

  async topUp(channelId: bigint, amount: bigint): Promise<string> {
    const op = this.call(
      this.o.channelContractId,
      "top_up",
      nativeToScVal(channelId, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    );
    return (await this.send(op)).hash;
  }

  async getChannel(channelId: bigint): Promise<ChannelState> {
    const c = await this.view<Record<string, unknown>>(
      this.call(this.o.channelContractId, "get", nativeToScVal(channelId, { type: "u64" })),
    );
    return {
      id: channelId,
      payer: String(c.payer),
      payee: String(c.payee),
      asset: String(c.asset),
      deposit: BigInt(c.deposit as string | bigint),
      claimed: BigInt(c.claimed as string | bigint),
      voucherKey: c.voucher_key as Uint8Array,
      expiryLedger: Number(c.expiry_ledger),
      open: Boolean(c.open),
    };
  }

  /**
   * Katman 2: DEX'te (Soroswap router) işlem. Çift, tavan ve `to == self`
   * kuralları zincirde `__check_auth` içinde uygulanır.
   * `minOut = 0` politikaca reddedilir (SLIPPAGE_UNBOUNDED).
   */
  async swap(params: {
    amountIn: bigint;
    minOut: bigint;
    /** Varsayılan: USDC → XLM. */
    path?: [string, string];
    to?: string;
    /** Reddedilirse başarısız işlemi de gönder (demo kanıtı). */
    probeAmountIn?: bigint;
  }): Promise<{ tx: string; amounts: bigint[] }> {
    const router = this.o.dexRouterId;
    if (!router) throw new Error("dexRouterId tanımlı değil");
    const [from, into] = params.path ?? [this.o.usdcContractId, this.o.xlmContractId!];
    const to = params.to ?? this.o.accountId;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const mk = (amountIn: bigint, minOut: bigint) =>
      this.call(
        router,
        "swap_exact_tokens_for_tokens",
        nativeToScVal(amountIn, { type: "i128" }),
        nativeToScVal(minOut, { type: "i128" }),
        nativeToScVal([new Address(from), new Address(into)]),
        new Address(to).toScVal(),
        nativeToScVal(deadline, { type: "u64" }),
      );
    const probe =
      params.probeAmountIn !== undefined ? mk(params.probeAmountIn, 1n) : undefined;
    const r = await this.send(mk(params.amountIn, params.minOut), probe);
    const amounts = (scValToNative(r.returnValue!) as (string | bigint)[]).map((x) => BigInt(x));
    return { tx: r.hash, amounts };
  }

  /**
   * Doğrudan USDC transferi. Politika yalnızca izinli alıcılara izin verir;
   * ele geçirilmiş ajan senaryosu bunu kullanır (→ PAYEE_NOT_ALLOWED).
   */
  async transfer(to: string, amount: bigint, opts?: { submitOnFailure?: boolean; probeTo?: string }) {
    const op = this.call(
      this.o.usdcContractId,
      "transfer",
      new Address(this.o.accountId).toScVal(),
      new Address(to).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    );
    const probe =
      opts?.submitOnFailure && opts.probeTo
        ? this.call(
            this.o.usdcContractId,
            "transfer",
            new Address(this.o.accountId).toScVal(),
            new Address(opts.probeTo).toScVal(),
            nativeToScVal(1n, { type: "i128" }),
          )
        : undefined;
    return (await this.send(op, probe)).hash;
  }
}
