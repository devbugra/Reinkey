import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { CHAIN, ChainPort } from './chain.port';
import { StellarChain } from './stellar.chain';

/** Zincir erişimi: yalnızca gerçek Stellar ağı. Sahte zincir çalışma zamanında yoktur. */
@Global()
@Module({
  providers: [
    {
      provide: CHAIN,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig): ChainPort => {
        const chain = new StellarChain(
          cfg.networkPassphrase,
          cfg.channelContractId,
          cfg.usdcContractId,
          cfg.rpcUrl,
          cfg.facilitatorSecret,
          { xlmContractId: cfg.xlmContractId, dexPairId: cfg.dexPairId },
        );
        new Logger('ChainModule').log(
          `RPC ${cfg.rpcUrl}, facilitator ${chain.facilitatorAddress}, kanal ${cfg.channelContractId}`,
        );
        return chain;
      },
    },
  ],
  exports: [CHAIN],
})
export class ChainModule {}
