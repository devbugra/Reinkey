import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ChannelStore } from '../channel/channel.cache';
import { ChannelVerifier } from '../channel/channel.verifier';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { CatalogService } from '../discovery/catalog.service';
import { ExactVerifier } from './exact.verifier';
import { payloadScheme } from './headers';

const Requirements = z
  .object({
    scheme: z.string().optional(),
    payTo: z.string().min(1),
    amount: z.string().regex(/^\d+$/).optional(),
    maxAmountRequired: z.string().regex(/^\d+$/).optional(),
    resource: z.string().optional(),
    unit: z.string().optional(),
  })
  .passthrough();

const FacilitatorBody = z.object({
  x402Version: z.number().optional(),
  paymentPayload: z.unknown(),
  paymentRequirements: Requirements,
  /** Satıcının 402'sindeki uzantılar; `bazaar` varsa kataloğa yazılır. */
  extensions: z.record(z.string(), z.unknown()).optional(),
});

const example = {
  paymentPayload: {
    x402Version: 2,
    scheme: 'channel',
    network: 'stellar:testnet',
    payload: { channelId: '1', cumulative: '5000', signature: '128 hex' },
  },
  paymentRequirements: {
    scheme: 'channel',
    payTo: 'G...',
    amount: '5000',
    resource: 'http://localhost:3000/demo/book',
  },
};

/** x402 facilitator API: /supported, /verify, /settle. */
@ApiTags('facilitator')
@Controller()
export class FacilitatorController {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly channel: ChannelVerifier,
    private readonly exact: ExactVerifier,
    private readonly store: ChannelStore,
    private readonly catalog: CatalogService,
  ) {}

  @Get('supported')
  @ApiOperation({ summary: 'Desteklenen şemalar' })
  supported() {
    // `extra`: dış satıcının (@reinkey/meter) 402 şartlarını kurması için gerekenler.
    // Bunlar olmadan paket demo ucuna (/demo/info) bakmak zorunda kalıyordu.
    const kinds: Record<string, unknown>[] = [
      {
        x402Version: 2,
        scheme: 'channel',
        network: this.cfg.network,
        extra: {
          asset: this.cfg.usdcContractId,
          channelContract: this.cfg.channelContractId,
          areFeesSponsored: true,
        },
      },
    ];
    if (this.exact.enabled)
      kinds.push({
        x402Version: 2,
        scheme: 'exact',
        network: this.cfg.network,
      });
    return { kinds };
  }

  private parse(body: unknown) {
    const p = FacilitatorBody.safeParse(body);
    if (!p.success)
      throw new ReinkeyError(
        'PAYMENT_MALFORMED',
        p.error.issues[0].message,
        'facilitator',
      );
    const r = p.data.paymentRequirements;
    const amount = r.amount ?? r.maxAmountRequired;
    if (!amount)
      throw new ReinkeyError(
        'PAYMENT_MALFORMED',
        'paymentRequirements.amount eksik',
        'facilitator',
      );
    return {
      payload: p.data.paymentPayload,
      scheme: payloadScheme(p.data.paymentPayload) ?? r.scheme,
      ctx: {
        price: BigInt(amount),
        payTo: r.payTo,
        resource: r.resource ?? 'facilitator:/verify',
        unit: r.unit ?? 'request',
      },
      requirements: r,
      bazaar: p.data.extensions?.bazaar as Record<string, unknown> | undefined,
    };
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ödemeyi doğrula. channel: kupon doğrulanır ve kabul edilir (lastAccepted ilerler).',
  })
  @ApiBody({ schema: { example } })
  async verify(@Body() body: unknown) {
    const { payload, scheme, ctx, requirements, bazaar } = this.parse(body);
    try {
      const receipt =
        scheme === 'exact'
          ? await this.exact.verify(payload, ctx)
          : await this.channel.verify(payload, ctx);
      // Ödeme kanıtlandı: kaynak Bazaar kataloğuna girer (yanıtı bekletmez).
      if (requirements.resource?.startsWith('http')) {
        void this.catalog
          .record({
            resource: requirements.resource,
            method: typeof requirements.method === 'string' ? requirements.method : undefined,
            payTo: ctx.payTo,
            unit: ctx.unit,
            price: BigInt(requirements.amount ?? requirements.maxAmountRequired ?? '0'),
            description:
              typeof requirements.description === 'string' ? requirements.description : undefined,
            accepts: [requirements as Record<string, unknown>],
            bazaar,
          })
          .catch(() => {});
      }
      return { isValid: true, receipt };
    } catch (e) {
      if (!(e instanceof ReinkeyError) || e.code === 'CHAIN_UNAVAILABLE')
        throw e;
      return { isValid: false, invalidReason: e.code, message: e.message };
    }
  }

  @Post('settle')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'channel: kabul edilmiş kuponu tahsilat kuyruğuna alır (claim zamanlayıcısı gönderir). exact: uzlaştırır.',
  })
  @ApiBody({ schema: { example } })
  async settle(@Body() body: unknown) {
    const { payload, scheme } = this.parse(body);
    if (scheme === 'exact') {
      await this.exact.verify(payload, {
        price: 0n,
        payTo: '',
        resource: '',
        unit: '',
      });
      return;
    }
    const v = this.channel.parse(payload, 'facilitator:/settle');
    const ch = await this.store.get(v.channelId);
    if (!ch || ch.lastAccepted < v.cumulative) {
      return {
        success: false,
        errorReason: 'VOUCHER_NOT_ACCEPTED',
        message: 'Kupon önce /verify ile kabul edilmeli',
        network: this.cfg.network,
      };
    }
    return {
      success: true,
      network: this.cfg.network,
      transaction: '',
      queued: true,
      channelId: ch.id.toString(),
      unclaimed: (ch.lastAccepted - ch.claimed).toString(),
    };
  }
}
