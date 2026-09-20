import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReinkeyError } from '../common/errors';
import { DexService, type Side } from './dex.service';

const SIDES: Side[] = ['USDC_XLM', 'XLM_USDC'];

/**
 * Borsa yüzeyi. Kotasyon ücretsizdir: herkese açık zincir verisinden ve hesabın
 * kendi politikasından hesaplanır (bkz. `GET /accounts/:addr`). Ücretli olan,
 * satılan piyasa verisidir (`/demo/ticker/stream`, `/demo/book`).
 */
@ApiTags('dex')
@Controller('dex')
export class DexController {
  constructor(private readonly dex: DexService) {}

  @Get('quote')
  @ApiOperation({
    summary:
      'Rota, fiyat etkisi, önerilen kayma koruması ve POLİTİKA ÖN KARARI: bu takas ajanın hesabından geçer mi?',
  })
  @ApiQuery({ name: 'side', required: false, description: 'USDC_XLM (varsayılan) | XLM_USDC' })
  @ApiQuery({ name: 'amountIn', required: true, description: 'taban birim (7 ondalık)' })
  @ApiQuery({ name: 'account', required: false, description: 'Reinkey hesabı; verilirse politika uygulanır' })
  @ApiQuery({ name: 'slippageBps', required: false, description: 'varsayılan 100 (%1)' })
  quote(
    @Query('amountIn') amountIn: string,
    @Query('side') side?: string,
    @Query('account') account?: string,
    @Query('slippageBps') slippageBps?: string,
  ) {
    if (!amountIn || !/^\d+$/.test(amountIn))
      throw new ReinkeyError('BAD_REQUEST', 'amountIn taban birim tamsayı olmalı');
    const s = (side ?? 'USDC_XLM') as Side;
    if (!SIDES.includes(s)) throw new ReinkeyError('BAD_REQUEST', 'side: USDC_XLM | XLM_USDC');
    const bps = slippageBps ? BigInt(slippageBps) : undefined;
    if (bps !== undefined && (bps < 0n || bps > 5000n))
      throw new ReinkeyError('BAD_REQUEST', 'slippageBps 0–5000 arası olmalı');
    return this.dex.quote({ side: s, amountIn: BigInt(amountIn), slippageBps: bps, account: account || undefined });
  }
}

@Module({ providers: [DexService], controllers: [DexController], exports: [DexService] })
export class DexModule {}
