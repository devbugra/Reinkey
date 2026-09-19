import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EventsService } from '../audit/events.service';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ChannelStore } from './channel.cache';
import { StreamSessions, type SliceOutcome } from './stream.sessions';

/**
 * DIŞ SATICI İÇİN AKIŞ OTURUMLARI.
 *
 * Token ya da saniye başına satan bir satıcı, dilim bittiğinde alıcıdan yeni
 * kupon bekler. Kuponu doğrulayan facilitator olduğu için bekleme de burada
 * olur: satıcı oturum açar, alıcıya `payment-required` der, `/wait` ile uzun
 * sorguda bekler; alıcı kuponu `POST /channels/:id/voucher` ile gönderince
 * `/wait` `paid` döner. Demo satıcı aynı StreamSessions'ı süreç içinden
 * kullanır; bu uçlar aynı şeyi HTTP'ye açar (@reinkey/meter `rk.stream()`).
 *
 * Güvenlik: oturum açmak para hareketi değildir (kupon zaten /verify'dan geçer;
 * oturum yalnızca onu beklemenin kancasıdır). Kötüye kullanım yüzeyi bellek:
 * kanal başına ve toplamda oturum sayısı sınırlı, boşta kalan oturum düşer.
 */
const digits = z.string().regex(/^\d+$/);
const OpenBody = z.object({
  channelId: digits,
  payTo: z.string().min(1),
  resource: z.string().url(),
  unit: z.enum(['token', 'second']),
  /** Dilim bedeli (taban birim): fiyat × dilim boyu. */
  sliceCost: digits,
  /** Akışı açan ilk kuponun deltası (/verify makbuzundaki `delta`). */
  initialCharge: digits,
});
const WaitBody = z.object({ timeoutMs: z.number().int().min(1000).max(30_000).optional() });
const EndBody = z.object({
  reason: z.enum(['done', 'CHANNEL_EXHAUSTED', 'TIMEOUT', 'ACCOUNT_FROZEN', 'ABORTED']).optional(),
  /** Teslim edilen birim (token ya da saniye). */
  units: z.number().int().min(0).optional(),
});

const MAX_PER_CHANNEL = 4;
const MAX_TOTAL = 1000;
const IDLE_MS = 90_000;
const DEFAULT_WAIT_MS = 10_000;

interface Meta {
  channelId: bigint;
  payer?: string;
  unit: 'token' | 'second';
  sliceCost: bigint;
  resource: string;
  idle: NodeJS.Timeout;
}

@ApiTags('streams')
@Controller('streams')
export class StreamsController {
  private readonly open = new Map<string, Meta>();

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly sessions: StreamSessions,
    private readonly store: ChannelStore,
    private readonly events: EventsService,
  ) {}

  private touch(id: string) {
    const m = this.open.get(id);
    if (!m) return;
    clearTimeout(m.idle);
    m.idle = setTimeout(() => this.finish(id, 'ABORTED', 0), IDLE_MS);
  }

  private finish(id: string, reason: string, units: number) {
    const m = this.open.get(id);
    if (!m) return null;
    clearTimeout(m.idle);
    this.open.delete(id);
    const totals = this.sessions.totals(id);
    this.events.emit(
      'stream.ended',
      'gateway',
      {
        streamId: id,
        channelId: m.channelId,
        reason,
        unit: m.unit,
        tokens: units,
        ...(m.unit === 'second' ? { seconds: units } : {}),
        charged: totals.charged,
        resource: m.resource,
      },
      { channelId: m.channelId, account: m.payer },
    );
    this.sessions.close(id);
    return totals;
  }

  private get(id: string) {
    const m = this.open.get(id);
    if (!m) throw new ReinkeyError('STREAM_NOT_FOUND', `Akış ${id} bulunamadı ya da bitti`);
    return m;
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Dış satıcı için akış oturumu aç (ilk dilim /verify ile ödendikten sonra)' })
  @ApiBody({
    schema: {
      example: {
        channelId: '7',
        payTo: 'G…',
        resource: 'https://api.example.com/ticker',
        unit: 'second',
        sliceCost: '1000',
        initialCharge: '1000',
      },
    },
  })
  async create(@Body() body: unknown) {
    const p = OpenBody.safeParse(body);
    if (!p.success) throw new ReinkeyError('BAD_REQUEST', p.error.issues[0].message);
    const d = p.data;
    const channelId = BigInt(d.channelId);
    const ch = await this.store.get(channelId);
    if (!ch) throw new ReinkeyError('CHANNEL_NOT_FOUND', `Kanal ${d.channelId} bulunamadı`);
    if (ch.payee !== d.payTo)
      throw new ReinkeyError('WRONG_PAYEE', 'Kanalın alıcısı bu satıcı değil', 'facilitator');
    if (this.open.size >= MAX_TOTAL)
      throw new ReinkeyError('RATE_LIMITED', 'Açık akış oturumu sınırı doldu', 'facilitator');
    let perChannel = 0;
    for (const m of this.open.values()) if (m.channelId === channelId) perChannel++;
    if (perChannel >= MAX_PER_CHANNEL)
      throw new ReinkeyError('RATE_LIMITED', `Kanal başına en fazla ${MAX_PER_CHANNEL} açık akış`, 'facilitator');

    const sliceCost = BigInt(d.sliceCost);
    const streamId = this.sessions.open({
      channelId,
      sliceCost,
      resource: d.resource,
      payTo: d.payTo,
      unit: d.unit,
      initialCharge: BigInt(d.initialCharge),
    });
    this.open.set(streamId, {
      channelId,
      payer: ch.payer,
      unit: d.unit,
      sliceCost,
      resource: d.resource,
      idle: setTimeout(() => this.finish(streamId, 'ABORTED', 0), IDLE_MS),
    });
    this.events.emit(
      'stream.started',
      'gateway',
      { streamId, channelId, unit: d.unit, resource: d.resource },
      { channelId, account: ch.payer },
    );
    return {
      streamId,
      channelId: d.channelId,
      unit: d.unit,
      sliceCost: d.sliceCost,
      // Alıcıya bir sonraki dilim için söylenecek kümülatif: kabul edilen + dilim bedeli.
      requiredCumulative: (ch.lastAccepted + sliceCost).toString(),
      voucherUrl: `${this.cfg.publicUrl}/channels/${d.channelId}/voucher`,
    };
  }

  @Post(':id/wait')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Sonraki dilimin ödenmesini bekle (uzun sorgu, en çok 30 sn). paid | timeout | exhausted | frozen | aborted',
  })
  async wait(@Param('id') id: string, @Body() body: unknown) {
    const m = this.get(id);
    const p = WaitBody.safeParse(body ?? {});
    if (!p.success) throw new ReinkeyError('BAD_REQUEST', p.error.issues[0].message);
    this.touch(id);

    // Kalan depozito bir dilime yetmiyorsa alıcı kupon imzalayamaz; beklemek boşuna.
    const ch = this.store.peek(m.channelId);
    const current = ch?.lastAccepted ?? 0n;
    if (ch && ch.deposit - current < m.sliceCost) return { kind: 'exhausted' as const };

    const outcome: SliceOutcome = await this.sessions.waitForSlice(id, p.data.timeoutMs ?? DEFAULT_WAIT_MS);
    this.touch(id);
    if (outcome.kind !== 'paid') return { kind: outcome.kind };
    const after = this.store.peek(m.channelId)?.lastAccepted ?? current;
    return {
      kind: 'paid' as const,
      receipt: outcome.receipt,
      requiredCumulative: (after + m.sliceCost).toString(),
    };
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Akışı bitir; toplam tahsilatı döner ve stream.ended yayınlar' })
  end(@Param('id') id: string, @Body() body: unknown) {
    this.get(id);
    const p = EndBody.safeParse(body ?? {});
    if (!p.success) throw new ReinkeyError('BAD_REQUEST', p.error.issues[0].message);
    const totals = this.finish(id, p.data.reason ?? 'done', p.data.units ?? 0)!;
    return { charged: totals.charged.toString(), vouchers: totals.vouchers };
  }
}
