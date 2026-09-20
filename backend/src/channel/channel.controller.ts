import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ReinkeyError } from '../common/errors';
import { ChannelStore, type CachedChannel } from './channel.cache';
import { ClaimService } from './claim.scheduler';
import { StreamSessions } from './stream.sessions';

const VoucherBody = z.object({
  streamId: z.string().min(1),
  cumulative: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^[0-9a-fA-F]{128}$/),
});

export function parseChannelId(id: string): bigint {
  if (!/^\d{1,20}$/.test(id))
    throw new ReinkeyError('BAD_REQUEST', 'Kanal kimliği u64 olmalı');
  return BigInt(id);
}

export function channelView(ch: CachedChannel) {
  return {
    id: ch.id.toString(),
    payer: ch.payer,
    payee: ch.payee,
    asset: ch.asset,
    deposit: ch.deposit.toString(),
    claimed: ch.claimed.toString(),
    voucherKey: ch.voucherKey,
    expiryLedger: ch.expiryLedger,
    open: ch.open,
    lastAccepted: ch.lastAccepted.toString(),
    unclaimed: (ch.lastAccepted - ch.claimed).toString(),
    remaining: (ch.deposit - ch.lastAccepted).toString(),
    vouchersSinceClaim: ch.vouchersSinceClaim,
  };
}

@ApiTags('channels')
@Controller('channels')
export class ChannelController {
  constructor(
    private readonly store: ChannelStore,
    private readonly claims: ClaimService,
    private readonly sessions: StreamSessions,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Bilinen kanallar, en yeni önce' })
  list() {
    return this.store
      .all()
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .map(channelView);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Kanal durumu + lastAccepted, unclaimed, remaining',
  })
  async get(@Param('id') id: string) {
    const ch = await this.store.get(parseChannelId(id));
    if (!ch) throw new ReinkeyError('NOT_FOUND', `Kanal ${id} bulunamadı`);
    return channelView(ch);
  }

  @Post(':id/voucher')
  @HttpCode(200)
  @ApiOperation({ summary: 'Akışlı yanıt için sonraki dilimin kuponu (§6.3)' })
  @ApiBody({
    schema: {
      example: { streamId: 'uuid', cumulative: '145000', signature: '128 hex' },
    },
  })
  async voucher(@Param('id') id: string, @Body() body: unknown) {
    const p = VoucherBody.safeParse(body);
    if (!p.success)
      throw new ReinkeyError(
        'PAYMENT_MALFORMED',
        p.error.issues[0].message,
        'facilitator',
      );
    return this.sessions.submit(
      parseChannelId(id),
      p.data.streamId,
      BigInt(p.data.cumulative),
      p.data.signature,
    );
  }

  @Post(':id/claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Elle tahsilat' })
  async claim(@Param('id') id: string) {
    const r = await this.claims.manualClaim(parseChannelId(id));
    return r ?? { claimed: false, reason: 'Tahsil edilecek kupon yok' };
  }
}
