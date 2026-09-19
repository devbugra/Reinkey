import { Inject, Injectable, Optional } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { EventsService, type EventSink } from '../audit/events.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ReinkeyError } from '../common/errors';
import { ChannelStore, type CachedChannel } from './channel.cache';
import { ChainWatcher, type LedgerSource } from './chain.watcher';
import { FrozenRegistry } from './frozen.registry';
import { verifyVoucher } from './voucher';

const digits = z.string().regex(/^\d+$/);

/** Base64'ten çözülmüş x402 ödeme yükü (v1 düz, v2 `accepted` alanlı). */
export const ChannelPayload = z.object({
  x402Version: z.number().int().optional(),
  scheme: z.string().optional(),
  network: z.string().optional(),
  accepted: z
    .object({ scheme: z.string(), network: z.string() })
    .passthrough()
    .optional(),
  payload: z.object({
    channelId: digits,
    cumulative: digits,
    signature: z.string().regex(/^[0-9a-fA-F]{128}$/),
  }),
});

export interface VerifyContext {
  /** Bu çağrının bedeli (taban birim). Kupon en az bu kadar artmalı. */
  price: bigint;
  payTo: string;
  resource: string;
  unit: string;
}

export interface ChannelReceipt {
  scheme: 'channel';
  channelId: string;
  accepted: string;
  delta: string;
  remaining: string;
  latencyMs: number;
}

export interface VoucherInput {
  channelId: bigint;
  cumulative: bigint;
  signature: string;
}

/** x402 `channel` şeması doğrulayıcısı (BACKEND.md §5.2). */
@Injectable()
export class ChannelVerifier {
  private readonly rate = new Map<bigint, { minute: number; count: number }>();

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly store: ChannelStore,
    @Inject(ChainWatcher) private readonly ledger: LedgerSource,
    @Inject(EventsService) private readonly events: EventSink,
    @Optional() private readonly frozen?: FrozenRegistry,
  ) {}

  /** Adım 1: yükü çöz ve şemayla doğrula. */
  parse(raw: unknown, resource: string): VoucherInput {
    const p = ChannelPayload.safeParse(raw);
    const scheme = p.success
      ? (p.data.scheme ?? p.data.accepted?.scheme)
      : undefined;
    const network = p.success
      ? (p.data.network ?? p.data.accepted?.network)
      : undefined;
    if (
      !p.success ||
      scheme !== 'channel' ||
      (network && network !== this.cfg.network)
    ) {
      const why = !p.success
        ? p.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        : scheme !== 'channel'
          ? `şema 'channel' değil: ${scheme}`
          : `ağ uyuşmuyor: ${network}`;
      throw this.reject(
        'PAYMENT_MALFORMED',
        `Ödeme yükü geçersiz (${why})`,
        resource,
      );
    }
    return {
      channelId: BigInt(p.data.payload.channelId),
      cumulative: BigInt(p.data.payload.cumulative),
      signature: p.data.payload.signature.toLowerCase(),
    };
  }

  /** Tam doğrulama ve kabul. Başarısızlıkta `voucher.rejected` yayınlar ve ReinkeyError fırlatır. */
  async verify(raw: unknown, ctx: VerifyContext): Promise<ChannelReceipt> {
    const t0 = performance.now();
    const v = this.parse(raw, ctx.resource);
    return this.accept(v, ctx, t0);
  }

  async accept(
    v: VoucherInput,
    ctx: VerifyContext,
    t0 = performance.now(),
  ): Promise<ChannelReceipt> {
    const { channelId, cumulative, signature } = v;
    const fail = (code: string, message: string, ch?: CachedChannel) =>
      this.reject(code, message, ctx.resource, channelId, ch?.payer);

    // 2. Kanal: önce önbellek, yoksa zincir.
    let ch: CachedChannel | null;
    try {
      ch = await this.store.get(channelId);
    } catch (e) {
      throw new ReinkeyError(
        'CHAIN_UNAVAILABLE',
        `Kanal zincirden okunamadı: ${(e as Error).message}`,
        'chain',
      );
    }
    if (!ch) throw fail('CHANNEL_NOT_FOUND', `Kanal ${channelId} bulunamadı`);

    // 3. Durum, alıcı, varlık.
    if (!ch.open) throw fail('CHANNEL_CLOSED', 'Kanal kapalı', ch);
    if (ch.payee !== ctx.payTo)
      throw fail(
        'WRONG_PAYEE',
        `Kanalın alıcısı bu satıcı değil (${ch.payee})`,
        ch,
      );
    if (ch.asset !== this.cfg.usdcContractId)
      throw fail('WRONG_ASSET', `Kanal varlığı USDC değil (${ch.asset})`, ch);

    // Sahip hesabı dondurduysa kuponlar da durur (zincirdeki is_frozen, önbellekli).
    if (this.frozen?.isFrozen(ch.payer))
      throw fail('ACCOUNT_FROZEN', 'Ödeyen hesap sahibi tarafından donduruldu', ch);

    // 4. Süre.
    const left = ch.expiryLedger - this.ledger.current();
    if (left < this.cfg.voucherExpirySafetyLedgers)
      throw fail(
        'CHANNEL_EXPIRING',
        `Kanalın süresi dolmak üzere (${left} ledger)`,
        ch,
      );

    // Hız sınırı (kanal başına, dakikalık pencere).
    if (this.cfg.rateLimitPerMinute > 0) {
      const minute = Math.floor(Date.now() / 60_000);
      const r = this.rate.get(channelId);
      if (!r || r.minute !== minute)
        this.rate.set(channelId, { minute, count: 1 });
      else if (++r.count > this.cfg.rateLimitPerMinute)
        throw fail(
          'RATE_LIMITED',
          'Kanal başına dakikalık çağrı sınırı aşıldı',
          ch,
        );
    }

    // 5. İmza.
    const ok = verifyVoucher(
      {
        networkPassphrase: this.cfg.networkPassphrase,
        contractId: this.cfg.channelContractId,
        channelId,
        cumulative,
      },
      ch.voucherKey,
      signature,
    );
    if (!ok) throw fail('VOUCHER_BAD_SIGNATURE', 'Kupon imzası geçersiz', ch);

    // 6–9. Bu bloğun içinde `await` yok: Node tek iş parçacıklı olduğu için
    // karşılaştır-ve-yaz atomiktir; aynı kupon iki kez gelirse yalnızca biri geçer.
    const last = ch.lastAccepted;
    if (cumulative <= last)
      throw fail(
        'VOUCHER_NOT_INCREASING',
        `Kümülatif tutar artmalı (son kabul: ${last})`,
        ch,
      );
    const delta = cumulative - last;
    if (delta < ctx.price)
      throw fail(
        'VOUCHER_UNDERPAID',
        `Artış ${delta}, bedel ${ctx.price} (gereken kümülatif: ${last + ctx.price})`,
        ch,
      );
    if (cumulative > ch.deposit)
      throw fail(
        'CHANNEL_EXHAUSTED',
        `Kümülatif ${cumulative} depozitoyu (${ch.deposit}) aşıyor`,
        ch,
      );

    ch.lastAccepted = cumulative;
    ch.lastSig = signature;
    ch.vouchersSinceClaim++;
    this.store.markDirty(channelId);

    // 10. Olay ve makbuz.
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;
    this.events.emit(
      'voucher.accepted',
      'facilitator',
      {
        channelId,
        cumulative,
        delta,
        unit: ctx.unit,
        latencyMs,
        resource: ctx.resource,
      },
      { channelId, account: ch.payer },
    );
    return {
      scheme: 'channel',
      channelId: channelId.toString(),
      accepted: cumulative.toString(),
      delta: delta.toString(),
      remaining: (ch.deposit - cumulative).toString(),
      latencyMs,
    };
  }

  private reject(
    code: string,
    message: string,
    resource: string,
    channelId?: bigint,
    account?: string,
  ): ReinkeyError {
    this.events.emit(
      'voucher.rejected',
      'facilitator',
      { ...(channelId !== undefined ? { channelId } : {}), code, resource },
      { channelId, account, code },
    );
    return new ReinkeyError(code, message, 'facilitator');
  }
}
