import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EventsService, type EventSink } from '../audit/events.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ReinkeyError } from '../common/errors';
import { ChannelStore, type CachedChannel } from './channel.cache';
import { ChainWatcher, type LedgerSource } from './chain.watcher';

export interface ClaimResult {
  channelId: string;
  amount: string;
  vouchersCovered: number;
  tx: string;
}

/** Birikmiş kuponları periyodik olarak tek bir `claim` işlemiyle tahsil eder (§5.3). */
@Injectable()
export class ClaimService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('Claims');
  private readonly inFlight = new Set<bigint>();
  private tickRunning = false;
  /** Elle tahsilatın kanal başına son zamanı (bekleme süresi için). */
  private readonly lastManual = new Map<bigint, number>();

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly store: ChannelStore,
    @Inject(ChainWatcher) private readonly ledger: LedgerSource,
    @Inject(EventsService) private readonly events: EventSink,
    private readonly scheduler?: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (!this.scheduler || this.cfg.claimIntervalSeconds <= 0) return;
    const t = setInterval(
      () => void this.tick(),
      this.cfg.claimIntervalSeconds * 1000,
    );
    this.scheduler.addInterval('claims', t);
  }

  onApplicationShutdown() {
    try {
      this.scheduler?.deleteInterval('claims');
    } catch {
      // zaten silinmiş
    }
  }

  /** Eşik ya da süre koşulunu sağlayan her açık kanalı tahsil eder. */
  async tick(): Promise<ClaimResult[]> {
    if (this.tickRunning) return [];
    this.tickRunning = true;
    const done: ClaimResult[] = [];
    try {
      const now = this.ledger.current();
      for (const ch of this.store.all()) {
        if (!this.isDue(ch, now)) continue;
        try {
          const r = await this.claim(ch.id);
          if (r) done.push(r);
        } catch (e) {
          this.log.warn(
            `kanal ${ch.id} tahsil edilemedi: ${(e as Error).message}`,
          );
        }
      }
    } finally {
      this.tickRunning = false;
    }
    return done;
  }

  isDue(ch: CachedChannel, ledger: number): boolean {
    if (!ch.open || !ch.lastSig) return false;
    const unclaimed = ch.lastAccepted - ch.claimed;
    if (unclaimed <= 0n) return false;
    if (unclaimed >= this.cfg.claimThreshold) return true;
    return ch.expiryLedger - ledger <= this.cfg.claimExpiryMarginLedgers;
  }

  /**
   * Herkese açık uçtan gelen elle tahsilat. `claim` facilitator'a zincir ücreti
   * ödetir; bu yüzden kimliksiz çağrı iki koşula bağlıdır:
   *  - birikmiş tutar elle tahsilat tabanının altında değilse (ya da otomatik
   *    tahsilat zaten yapılacak durumdaysa),
   *  - aynı kanal için bekleme süresi dolmuşsa.
   * "1 stroop'luk kupon → claim" döngüsü böylece sunucuya işlem ödetemez.
   */
  async manualClaim(id: bigint, now = Date.now()): Promise<ClaimResult | null> {
    const ch = await this.store.get(id);
    if (!ch)
      throw new ReinkeyError('CHANNEL_NOT_FOUND', `Kanal ${id} bulunamadı`);
    const unclaimed = ch.lastAccepted - ch.claimed;
    if (unclaimed <= 0n) return null;
    if (
      unclaimed < this.cfg.manualClaimMin &&
      !this.isDue(ch, this.ledger.current())
    )
      throw new ReinkeyError(
        'BAD_REQUEST',
        `Birikmiş tutar elle tahsilat tabanının altında (${unclaimed} < ${this.cfg.manualClaimMin} taban birim); eşik ya da süre dolunca kendiliğinden tahsil edilir`,
        'facilitator',
      );
    const wait =
      (this.lastManual.get(id) ?? 0) + this.cfg.manualClaimCooldownSeconds * 1000 - now;
    if (wait > 0)
      throw new ReinkeyError(
        'RATE_LIMITED',
        `Bu kanal ${Math.ceil(wait / 1000)} sn sonra yeniden tahsil edilebilir`,
        'facilitator',
      );
    this.lastManual.set(id, now);
    if (this.lastManual.size > 10_000)
      this.lastManual.delete(this.lastManual.keys().next().value as bigint);
    return this.claim(id);
  }

  /** Elle ya da zamanlayıcıyla tahsilat. Tahsil edilecek bir şey yoksa `null`. */
  async claim(id: bigint): Promise<ClaimResult | null> {
    const ch = await this.store.get(id);
    if (!ch)
      throw new ReinkeyError('CHANNEL_NOT_FOUND', `Kanal ${id} bulunamadı`);
    if (!ch.open) throw new ReinkeyError('CHANNEL_CLOSED', 'Kanal kapalı');
    if (!ch.lastSig || ch.lastAccepted <= ch.claimed) return null;
    if (this.inFlight.has(id)) return null;

    // Anlık görüntü: claim sürerken gelen kuponlar bir sonraki claim'e kalır.
    const cumulative = ch.lastAccepted;
    const sig = ch.lastSig;
    const covered = ch.vouchersSinceClaim;
    const amount = cumulative - ch.claimed;

    this.inFlight.add(id);
    this.store.beginOwnClaim(id);
    try {
      const { tx } = await this.chain.claim(id, cumulative, sig);
      if (tx) this.store.rememberOwnClaim(tx);
      if (cumulative > ch.claimed) ch.claimed = cumulative;
      ch.vouchersSinceClaim = Math.max(0, ch.vouchersSinceClaim - covered);
      this.store.markDirty(id);
      this.events.emit(
        'channel.claimed',
        'facilitator',
        { channelId: id, amount, vouchersCovered: covered, tx },
        { channelId: id, account: ch.payer, tx },
      );
      this.log.log(`kanal ${id}: ${covered} kupon → 1 işlem (${amount}) ${tx}`);
      return {
        channelId: id.toString(),
        amount: amount.toString(),
        vouchersCovered: covered,
        tx,
      };
    } finally {
      this.inFlight.delete(id);
      this.store.endOwnClaim(id);
    }
  }
}
