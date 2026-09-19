import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { jsonSafe } from '../common/bigint';
import type { ErrorSource } from '../common/reason-codes';
import { PrismaService } from './prisma.service';

// Olay tipleri (BACKEND.md §8.2). Panel bunlara göre yazılıyor: DEĞİŞTİRME.
export type EventType =
  | 'channel.opened'
  | 'channel.topped_up'
  | 'voucher.accepted'
  | 'voucher.rejected'
  | 'channel.claimed'
  | 'channel.closed'
  | 'payment.exact'
  | 'chain.rejected'
  | 'stream.started'
  | 'stream.ended'
  | 'dex.swapped'
  | 'account.frozen'
  | 'agent.log'
  | 'agent.exited'
  // Geçici (transient): ajana satılan her fiyat tik'i panelde de görünsün diye.
  | 'ticker.tick';

export interface ReinkeyEvent {
  id: string;
  type: EventType;
  source: ErrorSource;
  ts: string;
  channelId?: string;
  account?: string;
  [field: string]: unknown;
}

export interface EmitMeta {
  /** true: yalnızca SSE'ye yayınlanır; DB'ye ve son-olaylar tamponuna yazılmaz. */
  transient?: boolean;
  channelId?: bigint;
  account?: string;
  code?: string;
  tx?: string;
}

/** Verifier ve diğer servislerin bağımlı olduğu dar arayüz (testlerde sahtelenir). */
export interface EventSink {
  emit(
    type: EventType,
    source: ErrorSource,
    data: Record<string, unknown>,
    meta?: EmitMeta,
  ): ReinkeyEvent;
}

const RECENT = 200;
const FLUSH_MS = 250;

/**
 * Olayları yayınlar (SSE), son 200'ü bellekte tutar ve Postgres'e 250 ms'lik
 * gruplar hâlinde toplu yazar. Kimlikler süreç içinde verilir ki SSE anında numaralı olsun.
 */
@Injectable()
export class EventsService
  implements EventSink, OnModuleInit, OnApplicationShutdown
{
  private readonly log = new Logger('Events');
  readonly stream$ = new Subject<ReinkeyEvent>();
  private readonly recent: ReinkeyEvent[] = [];
  private pending: {
    id: bigint;
    type: string;
    source: string;
    channelId: bigint | null;
    account: string | null;
    code: string | null;
    tx: string | null;
    data: any;
    createdAt: Date;
  }[] = [];
  private nextId = 1n;
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const last = await this.prisma.event.findFirst({ orderBy: { id: 'desc' } });
    this.nextId = (last?.id ?? 0n) + 1n;
    const rows = await this.prisma.event.findMany({
      orderBy: { id: 'desc' },
      take: RECENT,
    });
    for (const r of rows.reverse()) this.recent.push(this.fromRow(r));
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.flush();
  }

  emit(
    type: EventType,
    source: ErrorSource,
    data: Record<string, unknown>,
    meta: EmitMeta = {},
  ): ReinkeyEvent {
    const id = this.nextId++;
    const createdAt = new Date();
    const safe = jsonSafe(data) as Record<string, unknown>;
    const channelId =
      meta.channelId ??
      (typeof safe.channelId === 'string' ? BigInt(safe.channelId) : undefined);
    const event: ReinkeyEvent = {
      ...safe,
      id: id.toString(),
      type,
      source,
      ts: createdAt.toISOString(),
      ...(channelId !== undefined ? { channelId: channelId.toString() } : {}),
      ...(meta.account ? { account: meta.account } : {}),
    };

    if (meta.transient) {
      this.stream$.next(event);
      return event;
    }
    this.recent.push(event);
    if (this.recent.length > RECENT) this.recent.shift();
    this.pending.push({
      id,
      type,
      source,
      channelId: channelId ?? null,
      account: meta.account ?? null,
      code: meta.code ?? (typeof safe.code === 'string' ? safe.code : null),
      tx: meta.tx ?? (typeof safe.tx === 'string' && safe.tx ? safe.tx : null),
      data: safe,
      createdAt,
    });
    this.stream$.next(event);
    return event;
  }

  recentEvents(): ReinkeyEvent[] {
    return [...this.recent];
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    this.flushing = this.prisma.event
      .createMany({ data: batch })
      .then(() => undefined)
      .catch((e) => {
        this.log.error(`olaylar yazılamadı (${batch.length}): ${e.message}`);
        this.pending.unshift(...batch);
      })
      .finally(() => (this.flushing = undefined));
    return this.flushing;
  }

  fromRow(r: {
    id: bigint;
    type: string;
    source: string;
    channelId: bigint | null;
    account: string | null;
    data: unknown;
    createdAt: Date;
  }): ReinkeyEvent {
    return {
      ...((r.data as Record<string, unknown>) ?? {}),
      id: r.id.toString(),
      type: r.type as EventType,
      source: r.source as ErrorSource,
      ts: r.createdAt.toISOString(),
      ...(r.channelId !== null ? { channelId: r.channelId.toString() } : {}),
      ...(r.account ? { account: r.account } : {}),
    };
  }
}
