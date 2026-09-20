import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FloatService } from './float.service';

/** Reinkey Float: kredi havuzu, kredi hatları ve yatırımcı pozisyonları. Salt okunur. */
@ApiTags('float')
@Controller('float')
export class FloatController {
  constructor(private readonly float: FloatService) {}

  @Get()
  @ApiOperation({
    summary: 'Havuz özeti, bilinen kredi hatları, yatırımcı pozisyonları ve pay fiyatı geçmişi',
  })
  @ApiQuery({ name: 'history', required: false, description: 'geçmiş örnek sayısı (en çok 500)' })
  async overview(@Query('history') history?: string) {
    if (!this.float.enabled) return { enabled: false };
    const [{ pool, lines }, positions, samples] = await Promise.all([
      this.float.snapshot(),
      this.float.positions(),
      this.float.history(history ? Number(history) : 200),
    ]);
    return { enabled: true, pool, lines, positions, history: samples };
  }

  @Get('lines/:account')
  @ApiOperation({ summary: 'Bir Reinkey hesabının kredi hattı ve sağlığı (değer, borç, tasfiye edilebilir mi)' })
  line(@Param('account') account: string) {
    return this.float.lineFor(account);
  }

  @Get('positions/:address')
  @ApiOperation({ summary: 'Bir yatırımcının payı ve bugünkü USDC karşılığı' })
  position(@Param('address') address: string) {
    return this.float.position(address);
  }
}
