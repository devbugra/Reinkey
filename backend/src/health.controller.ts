import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './audit/prisma.service';
import { ChainWatcher } from './channel/chain.watcher';
import { APP_CONFIG, type AppConfig } from './config/config';
import { PriceService } from './demo/price.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly prisma: PrismaService,
    private readonly watcher: ChainWatcher,
    private readonly prices: PriceService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Sağlık: zincir modu, son ledger, veritabanı' })
  async health() {
    const db = await this.prisma.ping();
    const chain = this.watcher.health();
    return {
      ok: db,
      chainMode: this.cfg.chainMode,
      latestLedger: chain.latestLedger,
      db,
      demoControls: this.cfg.demoControls,
      ...this.prices.health(),
      // Ayrıntı (RPC'nin ham hata metni) günlüğe yazılır; dışarı yalnızca bayrak.
      ...(chain.error ? { chainOk: false } : {}),
    };
  }
}
