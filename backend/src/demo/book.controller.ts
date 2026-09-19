import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { PaidRequest } from '../x402/meter';
import { PriceService, fmt7 } from './price.service';

@ApiTags('demo')
@Controller('demo')
export class BookController {
  constructor(private readonly prices: PriceService) {}

  @Get('book')
  @ApiOperation({
    summary:
      'Emir defteri: Soroswap XLM/USDC havuzunun zincirdeki rezervlerinden türetilir (x402 channel, çağrı başına)',
  })
  @ApiQuery({ name: 'pair', required: false, example: 'XLM_USDC' })
  @ApiHeader({
    name: 'PAYMENT-SIGNATURE',
    required: false,
    description: 'base64 JSON ödeme yükü',
  })
  @ApiResponse({
    status: 402,
    description: 'Ödeme gerekli; gövde ve PAYMENT-REQUIRED başlığı',
  })
  @ApiResponse({ status: 503, description: 'PRICE_SOURCE_UNAVAILABLE' })
  async book(@Query('pair') _pair: string | undefined, @Req() req: PaidRequest) {
    const q = await this.prices.quote();
    return {
      pair: q.pair,
      base: 'XLM',
      quote: 'USDC',
      source: 'soroswap',
      mid: fmt7(q.mid),
      bid: fmt7(q.bid),
      ask: fmt7(q.ask),
      reserves: { usdc: fmt7(q.reserveUsdc), xlm: fmt7(q.reserveXlm) },
      ...PriceService.book(q),
      ledger: q.ledger,
      ts: new Date(q.fetchedAt).toISOString(),
      payment: req.payment,
    };
  }
}
