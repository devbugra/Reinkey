import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventsService, ReinkeyEvent } from './events.service';
import { PrismaService } from './prisma.service';

const CHAIN_TX_TYPES = [
  'channel.opened',
  'channel.topped_up',
  'channel.claimed',
  'channel.closed',
  'payment.exact',
  'dex.swapped',
  'account.frozen',
];
const LATENCY_WINDOW = 1000;
const EXACT_SECONDS_PER_PAYMENT = 5n;

/** `/stats` sayaçları. Açılışta Postgres'ten yüklenir, sonra olaylarla güncellenir. */
@Injectable()
export class StatsService implements OnModuleInit {
  private vouchersAccepted = 0n;
  private vouchersRejected = 0n;
  private chainTxCount = 0n;
  private volume = 0n;
  private latencies: number[] = [];
  private openChannels: () => number = () => 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async onModuleInit() {
    const groups = await this.prisma.event.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    for (const g of groups) {
      const n = BigInt(g._count._all);
      if (g.type === 'voucher.accepted') this.vouchersAccepted = n;
      else if (g.type === 'voucher.rejected') this.vouchersRejected = n;
      else if (CHAIN_TX_TYPES.includes(g.type)) this.chainTxCount += n;
    }
    const [{ sum }] = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT COALESCE(SUM((data->>'delta')::numeric), 0)::text AS sum
      FROM "Event" WHERE type = 'voucher.accepted'`;
    this.volume = BigInt(sum ?? '0');
    const recent = await this.prisma.$queryRaw<{ l: number }[]>`
      SELECT (data->>'latencyMs')::float AS l FROM "Event"
      WHERE type = 'voucher.accepted' ORDER BY id DESC LIMIT ${LATENCY_WINDOW}`;
    this.latencies = recent.map((r) => Number(r.l)).reverse();

    this.events.stream$.subscribe((e) => this.observe(e));
  }

  setOpenChannelsCounter(fn: () => number) {
    this.openChannels = fn;
  }

  private observe(e: ReinkeyEvent) {
    if (e.type === 'voucher.accepted') {
      this.vouchersAccepted++;
      if (typeof e.delta === 'string') this.volume += BigInt(e.delta);
      if (typeof e.latencyMs === 'number') {
        this.latencies.push(e.latencyMs);
        if (this.latencies.length > LATENCY_WINDOW) this.latencies.shift();
      }
    } else if (e.type === 'voucher.rejected') {
      this.vouchersRejected++;
    } else if (CHAIN_TX_TYPES.includes(e.type)) {
      this.chainTxCount++;
    }
  }

  snapshot() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = !sorted.length
      ? 0
      : sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    return {
      vouchersAccepted: Number(this.vouchersAccepted),
      vouchersRejected: Number(this.vouchersRejected),
      chainTxCount: Number(this.chainTxCount),
      volume: this.volume.toString(),
      channelsOpen: this.openChannels(),
      exactEquivalent: {
        txCount: Number(this.vouchersAccepted),
        seconds: Number(this.vouchersAccepted * EXACT_SECONDS_PER_PAYMENT),
      },
      medianVoucherLatencyMs: Math.round(median * 100) / 100,
    };
  }
}
