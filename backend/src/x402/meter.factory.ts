import { Inject, Injectable } from '@nestjs/common';
import { ChannelVerifier } from '../channel/channel.verifier';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ExactVerifier } from './exact.verifier';
import { meter, type MeterDeps, type MeterOptions } from './meter';

/** Minimum depozito önerisi: kitap ucunda 1000 çağrı. */
const MIN_DEPOSIT_CALLS = 1000n;

/** Nest bağımlılıklarını framework'ten bağımsız `meter()`'a bağlar. */
@Injectable()
export class MeterFactory {
  readonly deps: MeterDeps;

  constructor(
    @Inject(APP_CONFIG) cfg: AppConfig,
    channel: ChannelVerifier,
    exact: ExactVerifier,
  ) {
    this.deps = {
      network: cfg.network,
      asset: cfg.usdcContractId,
      payTo: cfg.sellerPayTo,
      channelContract: cfg.channelContractId,
      facilitatorUrl: cfg.publicUrl,
      publicUrl: cfg.publicUrl,
      minDeposit: cfg.priceBookPerRequest * MIN_DEPOSIT_CALLS,
      exactEnabled: exact.enabled,
      verifyChannel: (p, ctx) => channel.verify(p, ctx),
      verifyExact: (p, ctx) => exact.verify(p, ctx),
      toError: (e) =>
        e instanceof ReinkeyError
          ? {
              status: e.status,
              code: e.code,
              source: e.source,
              message: e.message,
              tx: e.tx,
            }
          : {
              status: 500,
              code: 'INTERNAL',
              source: 'gateway',
              message: 'Beklenmeyen sunucu hatası',
            },
    };
  }

  create(opts: MeterOptions) {
    return meter(opts, this.deps);
  }
}
