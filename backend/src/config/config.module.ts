import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './config';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true })],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
