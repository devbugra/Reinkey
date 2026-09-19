import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventsService } from '../audit/events.service';
import { ChannelStore } from '../channel/channel.cache';
import { StreamSessions } from '../channel/stream.sessions';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { PaidRequest } from '../x402/meter';
import { fallbackTokens } from './fallback-text';

const VOUCHER_TIMEOUT_MS = 10_000;
const CHARS_PER_TOKEN = 4;

@ApiTags('demo')
@Controller('demo')
export class ChatController {
  private readonly log = new Logger('Chat');
  private readonly anthropic?: Anthropic;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly sessions: StreamSessions,
    private readonly store: ChannelStore,
    private readonly events: EventsService,
  ) {
    if (cfg.anthropicApiKey)
      this.anthropic = new Anthropic({
        apiKey: cfg.anthropicApiKey,
        // Organizasyon düzeyinde (workspace'e bağlı olmayan) anahtarlar bu başlığı zorunlu tutar.
        ...(cfg.anthropicWorkspaceId
          ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } }
          : {}),
      });
  }

  @Post('chat')
  @ApiOperation({
    summary:
      'Token başına ücretli akışlı yanıt (SSE). İlk kupon ilk dilimi öder; sonraki dilimler POST /channels/:id/voucher ile.',
  })
  @ApiHeader({ name: 'PAYMENT-SIGNATURE', required: false })
  @ApiBody({
    schema: { example: { prompt: 'Explain metered x402 on Stellar' } },
  })
  @ApiResponse({ status: 402, description: 'Ödeme gerekli' })
  async chat(
    @Body() body: { prompt?: string },
    @Req() req: PaidRequest,
    @Res() res: Response,
  ) {
    const receipt = req.payment as { channelId: string; delta: string };
    const channelId = BigInt(receipt.channelId);
    const ch = this.store.peek(channelId);
    const slice = this.cfg.chatSliceTokens;
    const perToken = this.cfg.priceChatPerToken;
    const sliceCost = perToken * BigInt(slice);
    const resource = `${this.cfg.publicUrl}/demo/chat`;
    const streamId = this.sessions.open({
      channelId,
      sliceCost,
      resource,
      payTo: this.cfg.sellerPayTo,
      unit: 'token',
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

    let tokens = 0;
    let paidThrough = slice;
    const meta = { channelId, account: ch?.payer };
    this.events.emit(
      'stream.started',
      'gateway',
      { streamId, channelId, unit: 'token' },
      meta,
    );
    send('session', {
      streamId,
      channelId: channelId.toString(),
      sliceTokens: slice,
      pricePerToken: perToken.toString(),
      mode: this.cfg.chatMode,
    });

    const end = (reason: 'done' | 'CHANNEL_EXHAUSTED' | 'TIMEOUT') => {
      const { charged } = this.sessions.totals(streamId);
      this.events.emit(
        'stream.ended',
        'gateway',
        { streamId, channelId, reason, unit: 'token', tokens, charged },
        meta,
      );
      this.sessions.close(streamId);
      if (!closed) res.end();
    };

    try {
      // LLM hata verip hazır metne düşerse alıcı bunu bilmeli: ödediği şey değişti.
      const onFallback = () =>
        send('notice', {
          code: 'LLM_UNAVAILABLE',
          message: 'LLM unavailable; streaming fallback text instead',
        });
      for await (const text of this.tokens(body?.prompt ?? '', onFallback)) {
        if (closed) break;
        if (tokens >= paidThrough) {
          const cached = this.store.peek(channelId);
          const current = cached?.lastAccepted ?? 0n;
          // Kalan depozito bir dilime yetmiyorsa alıcı kupon imzalayamaz (SDK yerelde
          // durur). Beklemek akışı yanıltıcı biçimde TIMEOUT ile bitirirdi.
          if (cached && cached.deposit - current < sliceCost) {
            send('error', { code: 'CHANNEL_EXHAUSTED', tokens });
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
            // Dondurulmuş hesap da akışı keser; panel bunu depozito bitişi gibi görür.
            const code =
              outcome.kind === 'timeout' ? 'TIMEOUT' : 'CHANNEL_EXHAUSTED';
            send('error', { code, tokens });
            return end(code);
          }
          paidThrough += slice;
        }
        send('token', { text, index: tokens, paidThrough });
        tokens++;
      }
      const t = this.sessions.totals(streamId);
      send('done', {
        tokens,
        charged: t.charged.toString(),
        vouchers: t.vouchers,
      });
      end('done');
    } catch (e) {
      this.log.error(`akış hatası: ${(e as Error).message}`);
      send('error', { code: 'INTERNAL', tokens });
      end('done');
    }
  }

  /** Token kaynağı: fallback (hazır metin) ya da llm (Anthropic). LLM hatasında fallback'e düşer. */
  private async *tokens(
    prompt: string,
    onFallback?: () => void,
  ): AsyncGenerator<string> {
    if (this.cfg.chatMode === 'llm' && this.anthropic) {
      let yielded = 0;
      try {
        const stream = this.anthropic.messages.stream({
          model: this.cfg.chatModel,
          max_tokens: 800,
          messages: [
            {
              role: 'user',
              content: prompt || 'Explain metered x402 payments on Stellar.',
            },
          ],
        });
        let buf = '';
        for await (const ev of stream) {
          if (
            ev.type === 'content_block_delta' &&
            ev.delta.type === 'text_delta'
          ) {
            buf += ev.delta.text;
            while (buf.length >= CHARS_PER_TOKEN) {
              yield buf.slice(0, CHARS_PER_TOKEN);
              buf = buf.slice(CHARS_PER_TOKEN);
              yielded++;
            }
          }
        }
        if (buf) yield buf;
        return;
      } catch (e) {
        this.log.warn(
          `LLM hatası, fallback moduna geçiliyor: ${(e as Error).message}`,
        );
        if (yielded > 0) return;
        onFallback?.();
      }
    }
    for (const t of fallbackTokens()) {
      await sleep(30 + Math.floor(Math.random() * 31));
      yield t;
    }
  }
}
