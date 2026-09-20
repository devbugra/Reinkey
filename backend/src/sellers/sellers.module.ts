import { Controller, Get, Header, Module, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RevenueService, type Bucket } from './revenue.service';

/** Reinkey Meter · satıcı finansı: gelir, alacak yaşlandırma, tahsilatlar, CSV. Salt okunur. */
@ApiTags('sellers')
@Controller('sellers')
export class SellersController {
  constructor(private readonly revenue: RevenueService) {}

  @Get(':payTo/revenue')
  @ApiOperation({ summary: 'Satıcının gelir raporu: kazanılan, tahsil edilen, alacak; kaynak ve zaman kırılımı' })
  @ApiQuery({ name: 'days', required: false, description: 'pencere (1–365, varsayılan 30)' })
  @ApiQuery({ name: 'bucket', required: false, description: 'hour | day (varsayılan day)' })
  report(@Param('payTo') payTo: string, @Query('days') days?: string, @Query('bucket') bucket?: string) {
    return this.revenue.report(payTo, days ? Number(days) : 30, (bucket === 'hour' ? 'hour' : 'day') as Bucket);
  }

  @Get(':payTo/settlements.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Muhasebe dışa aktarımı: tahsilat başına bir satır (CSV)' })
  csv(@Param('payTo') payTo: string, @Query('days') days?: string) {
    return this.revenue.settlementsCsv(payTo, days ? Number(days) : 30);
  }
}

@Module({ providers: [RevenueService], controllers: [SellersController] })
export class SellersModule {}
