import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.controller';
import { AuditModule } from './audit/audit.module';
import { ChainModule } from './chain/chain.module';
import { ChannelModule } from './channel/channel.module';
import { AppConfigModule } from './config/config.module';
import type { AppConfig } from './config/config';
import { DemoControlsModule } from './demo/controls.module';
import { DemoModule } from './demo/demo.module';
import { DexModule } from './dex/dex.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { FloatModule } from './float/float.module';
import { HealthController } from './health.controller';
import { SellersModule } from './sellers/sellers.module';
import { X402Module } from './x402/x402.module';

@Module({})
export class AppModule {
  /** Demo kontrol uçları yalnızca DEMO_CONTROLS=true iken yüklenir. */
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule,
        ScheduleModule.forRoot(),
        ChainModule,
        AuditModule,
        ChannelModule,
        X402Module,
        DemoModule,
        DexModule,
        AccountsModule,
        DiscoveryModule,
        FloatModule,
        SellersModule,
        ...(cfg.demoControls ? [DemoControlsModule] : []),
      ],
      controllers: [HealthController],
    };
  }
}
