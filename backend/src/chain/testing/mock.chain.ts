// YALNIZCA BİRİM TESTLERİ. Çalışma zamanında yüklenmez.
import { randomBytes } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { ReinkeyError } from '../../common/errors';
import { chainCodeFromNumber } from '../../common/reason-codes';
import { verifyVoucher } from '../../channel/voucher';
import type {
  AccountState,
  ChainEvent,
  ChainPort,
  ChannelState,
} from '../chain.port';

const LEDGER_MS = 5000;
const GENESIS_LEDGER = 1_000_000;

/**
 * Bellek içi zincir. Kontratlar hazır olmadan backend'i ve paneli çalıştırmak için.
 * Ledger her 5 saniyede bir artar; claim kupon imzasını gerçekten doğrular.
 */
export class MockChain implements ChainPort {
  private readonly channels = new Map<bigint, ChannelState>();
  private readonly accounts = new Map<string, AccountState>();
  private readonly txs = new Map<
    string,
    { status: 'SUCCESS' | 'FAILED'; contractErrorCode?: number }
  >();
  private readonly events: ChainEvent[] = [];
  private nextId = 1n;
  private readonly startedAt = Date.now();

  constructor(
    readonly networkPassphrase: string,
    readonly channelContractId: string,
    private readonly usdcContractId: string,
  ) {}

  private ledgerNow(): number {
    return (
      GENESIS_LEDGER + Math.floor((Date.now() - this.startedAt) / LEDGER_MS)
    );
  }

  private newTx(status: 'SUCCESS' | 'FAILED' = 'SUCCESS', code?: number) {
    const tx = randomBytes(32).toString('hex');
    this.txs.set(tx, { status, contractErrorCode: code });
    return tx;
  }

  private fail(n: number): never {
    const tx = this.newTx('FAILED', n);
    throw new ReinkeyError(
      chainCodeFromNumber(n),
      `Zincir reddetti: Error(Contract, #${n})`,
      'chain',
      402,
      tx,
    );
  }

  private push(e: Omit<ChainEvent, 'ledger'>) {
    this.events.push({ ...e, ledger: this.ledgerNow() });
  }

  async latestLedger() {
    return this.ledgerNow();
  }

  async getChannel(id: bigint) {
    const ch = this.channels.get(id);
    return ch ? { ...ch } : null;
  }

  async claim(id: bigint, cumulative: bigint, signatureHex: string) {
    const ch = this.channels.get(id);
    if (!ch) this.fail(20);
    if (!ch.open) this.fail(21);
    if (cumulative <= ch.claimed) this.fail(23);
    if (cumulative > ch.deposit) this.fail(24);
    const ok = verifyVoucher(
      {
        networkPassphrase: this.networkPassphrase,
        contractId: this.channelContractId,
        channelId: id,
        cumulative,
      },
      ch.voucherKey,
      signatureHex,
    );
    if (!ok) this.fail(22);

    const amount = cumulative - ch.claimed;
    ch.claimed = cumulative;
    const tx = this.newTx();
    this.push({
      type: 'channel.claimed',
      channelId: id,
      data: { amount: amount.toString(), cumulative: cumulative.toString() },
      tx,
    });
    return { tx };
  }

  async getAccount(address: string) {
    const a = this.accounts.get(address);
    return a ? structuredClone(a) : null;
  }

  async getTransactionStatus(hash: string) {
    const t = this.txs.get(hash);
    return t ? { ...t } : { status: 'NOT_FOUND' as const };
  }

  readonly signerAddress = 'GMOCK';

  signMessage(): Buffer {
    throw new Error('MockChain: signMessage desteklenmez');
  }

  async readContract<T>(): Promise<T> {
    throw new Error('MockChain: readContract desteklenmez');
  }

  async getPairReserves(): Promise<never> {
    throw new Error('MockChain: DEX fiyatı yok (yalnızca birim testleri)');
  }

  async setFrozen(): Promise<never> {
    throw new Error('MockChain: setFrozen desteklenmiyor');
  }

  async pollEvents(fromLedger: number) {
    return {
      events: this.events.filter((e) => e.ledger >= fromLedger),
      latestLedger: this.ledgerNow(),
    };
  }

  /** Yeniden başlatmada Postgres'teki kanalları geri yükler; kimlikler çakışmaz. */
  restore(channels: ChannelState[]) {
    for (const ch of channels) {
      this.channels.set(ch.id, { ...ch });
      if (ch.id >= this.nextId) this.nextId = ch.id + 1n;
    }
  }

  // ---- Yalnızca mock: geliştirici uçları ----

  openChannel(p: {
    payer: string;
    payee: string;
    deposit: bigint;
    voucherKey: string;
    expiryInLedgers: number;
    asset?: string;
  }): { channel: ChannelState; tx: string } {
    const id = this.nextId++;
    const channel: ChannelState = {
      id,
      payer: p.payer,
      payee: p.payee,
      asset: p.asset ?? this.usdcContractId,
      deposit: p.deposit,
      claimed: 0n,
      voucherKey: p.voucherKey.toLowerCase(),
      expiryLedger: this.ledgerNow() + p.expiryInLedgers,
      open: true,
    };
    this.channels.set(id, channel);
    const tx = this.newTx();
    this.push({
      type: 'channel.opened',
      channelId: id,
      data: {
        payer: channel.payer,
        payee: channel.payee,
        asset: channel.asset,
        deposit: channel.deposit.toString(),
        expiryLedger: String(channel.expiryLedger),
      },
      tx,
    });
    return { channel: { ...channel }, tx };
  }

  topUp(id: bigint, amount: bigint) {
    const ch = this.channels.get(id);
    if (!ch) this.fail(20);
    if (!ch.open) this.fail(21);
    ch.deposit += amount;
    const tx = this.newTx();
    this.push({
      type: 'channel.topped_up',
      channelId: id,
      data: { amount: amount.toString(), deposit: ch.deposit.toString() },
      tx,
    });
    return { tx, deposit: ch.deposit };
  }

  close(id: bigint) {
    const ch = this.channels.get(id);
    if (!ch) this.fail(20);
    if (!ch.open) this.fail(21);
    ch.open = false;
    const refunded = ch.deposit - ch.claimed;
    const tx = this.newTx();
    this.push({
      type: 'channel.closed',
      channelId: id,
      data: { refunded: refunded.toString(), claimed: ch.claimed.toString() },
      tx,
    });
    return { tx, refunded };
  }

  createAccount(p: {
    address?: string;
    agentKey?: string;
    perTxCap?: bigint;
    dailyCap?: bigint;
    payees?: string[];
    balance?: bigint;
    expiryInLedgers?: number;
  }): AccountState {
    // Sahte C-adresi, gerçek strkey biçiminde.
    const address = p.address ?? StrKey.encodeContract(randomBytes(32));
    const account: AccountState = {
      address,
      policy: {
        agentKey: p.agentKey ?? randomBytes(32).toString('hex'),
        perTxCap: p.perTxCap ?? 50_000_000n,
        dailyCap: p.dailyCap ?? 500_000_000n,
        payees: p.payees ?? [this.channelContractId],
        channel: this.channelContractId,
        dexRouter: null,
        dexFactory: null,
        pairs: [],
        controller: null,
        expiresLedger: this.ledgerNow() + (p.expiryInLedgers ?? 120_960),
      },
      spentToday: 0n,
      day: Math.floor(this.ledgerNow() / 17280),
      frozen: false,
      balanceXlm: 0n,
      balance: p.balance ?? 100_000_000n,
    };
    this.accounts.set(address, account);
    return structuredClone(account);
  }

  /** Sahte başarısız işlem kaydeder (panel geliştirmesi için). */
  recordFailedTx(contractErrorCode: number): string {
    return this.newTx('FAILED', contractErrorCode);
  }
}
