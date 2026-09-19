import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ChannelStore } from './channel.cache';

/** Doğrulayıcının okuduğu son ledger. Sıcak yolda RPC çağrısı yapılmaz. */
export interface LedgerSource {
  current(): number;
}

const POLL_MS = 5000;
const SEEN_LIMIT = 5000;

/** Zincir olaylarını 5 saniyede bir çeker, kanal önbelleğine uygular, ledger'ı günceller. */
@Injectable()
export class ChainWatcher
  implements LedgerSource, OnModuleInit, OnApplicationShutdown
{
  private readonly log = new Logger('ChainWatcher');
  private ledger = 0;
  private cursor = 0;
  private readonly seen = new Set<string>();
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private lastError?: string;

  constructor(
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly store: ChannelStore,
  ) {}

  async onModuleInit() {
    try {
      this.ledger = await this.chain.latestLedger();
      // Yalnızca yeni olaylar; eski kanallar ilk kuponda zincirden okunur.
      this.cursor = this.ledger;
    } catch (e) {
      this.log.warn(`ledger okunamadı: ${(e as Error).message}`);
    }
    this.timer = setInterval(() => void this.pollNow(), POLL_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  current(): number {
    return this.ledger;
  }

  health() {
    return { latestLedger: this.ledger, error: this.lastError };
  }

  /** Olayları hemen çeker (ör. /dev/channels sonrası). Eşzamanlı çağrılar birleşir. */
  pollNow(): Promise<void> {
    if (!this.running) {
      this.running = this.poll().finally(() => (this.running = undefined));
    }
    return this.running;
  }

  private async poll() {
    try {
      const { events, latestLedger } = await this.chain.pollEvents(this.cursor);
      this.ledger = Math.max(this.ledger, latestLedger);
      for (const e of events) {
        const key = `${e.tx}:${e.type}:${e.channelId}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        if (this.seen.size > SEEN_LIMIT) {
          this.seen.delete(this.seen.values().next().value);
        }
        await this.store.applyChainEvent(e);
        this.cursor = Math.max(this.cursor, e.ledger);
      }
      // Aynı ledger'daki olaylar `seen` ile ayıklanır.
      this.cursor = Math.max(this.cursor, latestLedger - 1);
      this.lastError = undefined;
    } catch (e) {
      this.lastError = (e as Error).message;
      this.log.warn(`olaylar çekilemedi: ${this.lastError}`);
    }
  }
}
