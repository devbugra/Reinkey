import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EventsService, type EventSink } from '../audit/events.service';
import { PrismaService } from '../audit/prisma.service';
import { StatsService } from '../audit/stats.service';
import {
  CHAIN,
  type ChainEvent,
  type ChainPort,
  type ChannelState,
} from '../chain/chain.port';
import { max } from '../common/bigint';

export interface CachedChannel extends ChannelState {
  /** Kabul edilen en yüksek kümülatif tutar. Başlangıçta zincirdeki `claimed`. */
  lastAccepted: bigint;
  lastSig: string | null;
  /** Son claim'den beri kabul edilen kupon sayısı. */
  vouchersSinceClaim: number;
}

const FLUSH_MS = 250;

/**
 * Kanal durumu önbelleği. Doğrulama sıcak yolda zincire ve veritabanına gitmez;
 * değişiklikler Postgres'e 250 ms'de bir toplu yazılır.
 */
@Injectable()
export class ChannelStore implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('ChannelStore');
  private readonly channels = new Map<bigint, CachedChannel>();
  private readonly loading = new Map<bigint, Promise<CachedChannel | null>>();
  private readonly dirty = new Set<bigint>();
  /** Kendi gönderdiğimiz claim tx'leri; zincirden geri gelen olay tekrar yayınlanmaz. */
  private readonly ownClaimTxs = new Set<string>();
  private readonly ownClaimsInFlight = new Set<bigint>();
  private readonly suppressedClaimTxs = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(CHAIN) private readonly chain: ChainPort,
    @Inject(EventsService) private readonly events: EventSink,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly stats?: StatsService,
  ) {}

  async onModuleInit() {
    if (this.prisma) {
      const rows = await this.prisma.channel.findMany();
      for (const r of rows) {
        this.channels.set(r.id, {
          id: r.id,
          payer: r.payer,
          payee: r.payee,
          asset: r.asset,
          deposit: r.deposit,
          claimed: r.claimed,
          voucherKey: r.voucherKey,
          expiryLedger: r.expiryLedger,
          open: r.open,
          lastAccepted: r.lastAccepted,
          lastSig: r.lastSig,
          vouchersSinceClaim: r.vouchersSinceClaim,
        });
      }
      this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    }
    this.stats?.setOpenChannelsCounter(() => this.openCount());
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.flush();
  }

  openCount(): number {
    let n = 0;
    for (const c of this.channels.values()) if (c.open) n++;
    return n;
  }

  all(): CachedChannel[] {
    return [...this.channels.values()];
  }

  peek(id: bigint): CachedChannel | undefined {
    return this.channels.get(id);
  }

  /** Önce önbellek; yoksa zincir. İlk kez görülen kanal için `channel.opened` yayınlanır. */
  async get(id: bigint, tx?: string): Promise<CachedChannel | null> {
    const hit = this.channels.get(id);
    if (hit) return hit;
    let p = this.loading.get(id);
    if (!p) {
      p = this.chain
        .getChannel(id)
        .then((state) => (state ? this.insert(state, tx) : null))
        .finally(() => this.loading.delete(id));
      this.loading.set(id, p);
    }
    return p;
  }

  private insert(state: ChannelState, tx?: string): CachedChannel {
    const existing = this.channels.get(state.id);
    if (existing) return existing;
    const ch: CachedChannel = {
      ...state,
      lastAccepted: state.claimed,
      lastSig: null,
      vouchersSinceClaim: 0,
    };
    this.channels.set(ch.id, ch);
    this.markDirty(ch.id);
    this.events.emit(
      'channel.opened',
      'chain',
      {
        channelId: ch.id,
        payer: ch.payer,
        payee: ch.payee,
        deposit: ch.deposit,
        expiryLedger: ch.expiryLedger,
        tx: tx ?? null,
      },
      { channelId: ch.id, account: ch.payer, tx },
    );
    return ch;
  }

  markDirty(id: bigint) {
    this.dirty.add(id);
  }

  /**
   * Kendi tahsilatımız zincire gönderilmeden ÖNCE çağrılır. Zincir izleyicisi
   * olayı, `chain.claim()` tx hash'ini döndürmeden önce görebilir; o durumda
   * `rememberOwnClaim` geç kalır ve aynı tahsilat panele iki kez yayınlanırdı.
   */
  beginOwnClaim(id: bigint) {
    this.ownClaimsInFlight.add(id);
  }

  endOwnClaim(id: bigint) {
    this.ownClaimsInFlight.delete(id);
  }

  rememberOwnClaim(tx: string) {
    // İzleyici bu işlemi zaten görüp susturduysa beklemeye gerek yok.
    if (!this.suppressedClaimTxs.delete(tx)) this.ownClaimTxs.add(tx);
  }

  /** Zincir olaylarını önbelleğe yansıtır ve panele yayınlar. */
  async applyChainEvent(e: ChainEvent): Promise<void> {
    const d = e.data;
    if (e.type === 'channel.opened') {
      if (!this.channels.has(e.channelId)) await this.get(e.channelId, e.tx);
      return;
    }
    const ch = await this.get(e.channelId);
    if (!ch) return;

    if (e.type === 'channel.topped_up') {
      ch.deposit = BigInt(d.deposit);
      this.markDirty(ch.id);
      this.events.emit(
        'channel.topped_up',
        'chain',
        { channelId: ch.id, amount: d.amount, deposit: ch.deposit, tx: e.tx },
        { channelId: ch.id, account: ch.payer, tx: e.tx },
      );
    } else if (e.type === 'channel.claimed') {
      const cumulative = BigInt(d.cumulative);
      ch.claimed = max(ch.claimed, cumulative);
      ch.lastAccepted = max(ch.lastAccepted, cumulative);
      this.markDirty(ch.id);
      if (this.ownClaimTxs.delete(e.tx)) return;
      if (this.ownClaimsInFlight.has(ch.id)) {
        this.suppressedClaimTxs.add(e.tx);
        return;
      }
      this.events.emit(
        'channel.claimed',
        'chain',
        { channelId: ch.id, amount: d.amount, vouchersCovered: 0, tx: e.tx },
        { channelId: ch.id, account: ch.payer, tx: e.tx },
      );
    } else if (e.type === 'channel.closed') {
      if (!ch.open) return;
      ch.open = false;
      if (d.claimed) ch.claimed = max(ch.claimed, BigInt(d.claimed));
      this.markDirty(ch.id);
      this.events.emit(
        'channel.closed',
        'chain',
        { channelId: ch.id, refunded: d.refunded ?? '0', tx: e.tx },
        { channelId: ch.id, account: ch.payer, tx: e.tx },
      );
    }
  }

  async flush(): Promise<void> {
    if (!this.prisma || !this.dirty.size) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    try {
      await this.prisma.$transaction(
        ids.map((id) => {
          const c = this.channels.get(id)!;
          const data = {
            payer: c.payer,
            payee: c.payee,
            asset: c.asset,
            deposit: c.deposit,
            claimed: c.claimed,
            lastAccepted: c.lastAccepted,
            lastSig: c.lastSig,
            voucherKey: c.voucherKey,
            expiryLedger: c.expiryLedger,
            open: c.open,
            vouchersSinceClaim: c.vouchersSinceClaim,
          };
          return this.prisma!.channel.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }),
      );
    } catch (e) {
      this.log.error(`kanallar yazılamadı: ${(e as Error).message}`);
      for (const id of ids) this.dirty.add(id);
    }
  }
}
