import { Controller, Get, Inject, Module, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventsService } from '../audit/events.service';
import { PrismaService } from '../audit/prisma.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ChannelStore } from '../channel/channel.cache';
import { channelView } from '../channel/channel.controller';
import { ReinkeyError } from '../common/errors';

const MAX_PAGE = 200;

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly store: ChannelStore,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  @Get(':addr')
  @ApiOperation({
    summary: 'Hesap durumu (politika, harcama) + açık kanalları',
  })
  async get(@Param('addr') addr: string) {
    let state: Awaited<ReturnType<ChainPort['getAccount']>> = null;
    try {
      state = await this.chain.getAccount(addr);
    } catch {
      state = null;
    }
    const channels = this.store
      .all()
      .filter((c) => c.payer === addr && c.open)
      .map(channelView);
    if (!state && !channels.length)
      throw new ReinkeyError('NOT_FOUND', `Hesap ${addr} bulunamadı`);
    return { address: addr, ...(state ?? {}), found: !!state, channels };
  }

  @Get(':addr/ledger')
  @ApiOperation({ summary: 'Hesaba ait olaylar, yeniden eskiye, sayfalı' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'önceki sayfanın nextCursor değeri',
  })
  @ApiQuery({ name: 'limit', required: false })
  async ledger(
    @Param('addr') addr: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    await this.events.flush();
    const take = Math.min(Math.max(Number(limit) || 50, 1), MAX_PAGE);
    const before = cursor && /^\d+$/.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await this.prisma.event.findMany({
      where: { account: addr, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      events: page.map((r) => this.events.fromRow(r)),
      nextCursor:
        rows.length > take ? page[page.length - 1].id.toString() : null,
    };
  }
}

@Module({ controllers: [AccountsController] })
export class AccountsModule {}
