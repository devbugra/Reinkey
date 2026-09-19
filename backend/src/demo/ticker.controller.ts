import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventsService } from '../audit/events.service';
import { ChannelStore } from '../channel/channel.cache';
import { StreamSessions } from '../channel/stream.sessions';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { PaidRequest } from '../x402/meter';
import { PriceService, fmt7 } from './price.service';

const VOUCHER_TIMEOUT_MS = 10_000;

/**
 * Saniye başı ücretli canlı fiyat akışı (BACKEND.md §14.1).
 * Fiyat Soroswap XLM/USDC havuzunun zincirdeki rezervlerinden gelir; sentetik veri yok.
 * Protokol /demo/chat ile aynıdır: dilim bitince `payment-required`, kupon
 * `POST /channels/:id/voucher` ile gelir; gelmezse ya da depozito biterse akış kapanır.
 */
@ApiTags('demo')
@Controller('demo')
export class TickerController {
  private readonly log = new Logger('Ticker');

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly sessions: StreamSessions,
    private readonly store: ChannelStore,
    private readonly events: EventsService,
    private readonly prices: PriceService,
  ) {}

  @Get('ticker/stream')
  @ApiOperation({
    summary:
      'Canlı XLM/USDC fiyat akışı (SSE), saniye başına ücretli. Kaynak: Soroswap havuz rezervleri.',
  })
  @ApiHeader({ name: 'PAYMENT-SIGNATURE', required: false })
  @ApiResponse({ status: 402, description: 'Ödeme gerekli' })
  @ApiResponse({ status: 503, description: 'PRICE_SOURCE_UNAVAILABLE' })
  async stream(@Req() req: PaidRequest, @Res() res: Response) {
    const receipt = req.payment as { channelId: string; delta: string };
    const channelId = BigInt(receipt.channelId);
    const ch = this.store.peek(channelId);
    const slice = this.cfg.tickerSliceSeconds;
    const perSecond = this.cfg.priceTickerPerSecond;
    const sliceCost = perSecond * BigInt(slice);
    const resource = `${this.cfg.publicUrl}/demo/ticker/stream`;
    const streamId = this.sessions.open({
      channelId,
      sliceCost,
      resource,
      payTo: this.cfg.sellerPayTo,
      unit: 'second',
      initialCharge: BigInt(receipt.delta),
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    req.on('close', () => {
      closed = true;
      this.sessions.abort(streamId);
    });
    const send = (event: string, data: unknown) => {
      if (!closed)
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let seconds = 0;
    let paidThrough = slice;
    const meta = { channelId, account: ch?.payer };
    this.events.emit(
      'stream.started',
      'gateway',
      { streamId, channelId, unit: 'second' },
      meta,
    );
    send('session', {
      streamId,
      channelId: channelId.toString(),
      unit: 'second',
      sliceSeconds: slice,
      pricePerSecond: perSecond.toString(),
    });

    let ended = false;
    const end = (
      reason:
        | 'done'
        | 'CHANNEL_EXHAUSTED'
        | 'TIMEOUT'
        | 'PRICE_SOURCE_UNAVAILABLE'
        | 'ACCOUNT_FROZEN',
    ) => {
      if (ended) return;
      ended = true;
      const { charged } = this.sessions.totals(streamId);
      this.events.emit(
        'stream.ended',
        'gateway',
        {
          streamId,
          channelId,
          reason,
          unit: 'second',
          tokens: seconds,
          seconds,
          charged,
        },
        meta,
      );
      this.sessions.close(streamId);
      if (!closed) res.end();
    };

    try {
      while (!closed) {
        if (seconds >= paidThrough) {
          const cached = this.store.peek(channelId);
          const current = cached?.lastAccepted ?? 0n;
          // Kalan depozito bir dilime yetmiyorsa alıcı kupon imzalayamaz (SDK yerelde
          // durur). Beklemek akışı yanıltıcı biçimde TIMEOUT ile bitirirdi.
          if (cached && cached.deposit - current < sliceCost) {
            send('error', { code: 'CHANNEL_EXHAUSTED', seconds });
            return end('CHANNEL_EXHAUSTED');
          }
          send('payment-required', {
            streamId,
            requiredCumulative: (current + sliceCost).toString(),
          });
          const outcome = await this.sessions.waitForSlice(
            streamId,
            VOUCHER_TIMEOUT_MS,
          );
          if (outcome.kind === 'aborted' || closed) break;
          if (outcome.kind !== 'paid') {
            const code =
              outcome.kind === 'timeout'
                ? 'TIMEOUT'
                : outcome.kind === 'frozen'
                  ? 'ACCOUNT_FROZEN'
                  : 'CHANNEL_EXHAUSTED';
            send('error', { code, seconds });
            return end(code);
          }
          paidThrough += slice;
        }
        const q = await this.prices.quote();
        const tick = {
          pair: q.pair,
          price: fmt7(q.mid),
          bid: fmt7(q.bid),
          ask: fmt7(q.ask),
          source: 'soroswap',
          ledger: q.ledger,
          index: seconds,
          paidThrough,
        };
        send('tick', { ...tick, ts: new Date().toISOString() });
        // Panel, ajanın satın aldığı verinin aynısını görür; deftere yazılmaz.
        this.events.emit(
          'ticker.tick',
          'gateway',
          { streamId, ...tick },
          { ...meta, transient: true },
        );
        seconds++;
        await sleep(1000);
      }
      // İstemci bağlantıyı kesti: ödeme de durur.
      end('done');
    } catch (e) {
      const code =
        e instanceof ReinkeyError ? e.code : 'INTERNAL';
      this.log.warn(`akış kesildi: ${(e as Error).message}`);
      send('error', { code, seconds });
      end(code === 'PRICE_SOURCE_UNAVAILABLE' ? code : 'done');
    }
  }
}
