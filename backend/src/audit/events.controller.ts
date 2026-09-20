import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { EventsService, ReinkeyEvent } from './events.service';
import { StatsService } from './stats.service';
import { ReinkeyError } from '../common/errors';

const PING_MS = 15_000;

const MAX_PER_IP = 8;
const MAX_TOTAL = 200;
const openPerIp = new Map<string, number>();
let openTotal = 0;

@ApiTags('audit')
@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly stats: StatsService,
  ) {}

  @Get('events')
  @ApiOperation({
    summary: 'SSE olay akışı: önce son 200 olay, sonra canlı akış',
  })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'channelId', required: false })
  stream(
    @Query('account') account: string | undefined,
    @Query('channelId') channelId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const match = (e: ReinkeyEvent) =>
      (!account || e.account === account || e.payer === account) &&
      (!channelId || e.channelId === channelId);

    // SSE bağlantısı dakikalarca açık kalır: tek bir istemci hepsini tutmasın.
    const ip = req.ip ?? 'bilinmiyor';
    const mine = (openPerIp.get(ip) ?? 0) + 1;
    if (mine > MAX_PER_IP || openTotal >= MAX_TOTAL)
      throw new ReinkeyError('RATE_LIMITED', 'Açık olay akışı sayısı sınırda; bir sekmeyi kapatıp yeniden deneyin');
    openPerIp.set(ip, mine);
    openTotal += 1;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (e: ReinkeyEvent) =>
      res.write(
        `id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`,
      );

    for (const e of this.events.recentEvents()) if (match(e)) write(e);
    const sub = this.events.stream$.subscribe((e) => {
      if (match(e)) write(e);
    });
    const ping = setInterval(() => res.write(':ping\n\n'), PING_MS);
    req.on('close', () => {
      clearInterval(ping);
      sub.unsubscribe();
      openTotal -= 1;
      const left = (openPerIp.get(ip) ?? 1) - 1;
      if (left > 0) openPerIp.set(ip, left);
      else openPerIp.delete(ip);
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Sayaçlar: kupon, zincir işlemi, hacim, gecikme' })
  getStats() {
    return this.stats.snapshot();
  }
}
