import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../config/config';

/** Panelin açılışta okuduğu sabitler: demo hesabı, satıcı, kontratlar, fiyatlar. */
@ApiTags('demo')
@Controller('demo')
export class InfoController {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  @Get('info')
  @ApiOperation({ summary: 'Demo ortamı: hesap, satıcı, kontratlar, fiyatlar' })
  info() {
    const c = this.cfg;
    return {
      network: c.network,
      /** İstemcinin zincire doğrudan bağlanabilmesi için (cüzdanla imzalı işlemler). */
      networkPassphrase: c.networkPassphrase,
      rpcUrl: c.rpcUrl,
      explorerTxBase: 'https://stellar.expert/explorer/testnet/tx/',
      account: c.demoAccountId ?? null,
      seller: c.sellerPayTo,
      channelContract: c.channelContractId,
      usdc: c.usdcContractId,
      xlm: c.xlmContractId ?? null,
      dexPair: c.dexPairId ?? null,
      dexRouter: c.dexRouterId ?? null,
      demoControls: c.demoControls,
      prices: {
        bookPerRequest: c.priceBookPerRequest.toString(),
        tickerPerSecond: c.priceTickerPerSecond.toString(),
        tickerSliceSeconds: c.tickerSliceSeconds,
        chatPerToken: c.priceChatPerToken.toString(),
      },
    };
  }
}
