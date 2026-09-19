import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { installBigIntJson } from './common/bigint';
import { ReinkeyExceptionFilter } from './common/errors';
import { loadConfig } from './config/config';
import { EXPOSED_HEADERS } from './x402/headers';

// Ayarların tek kaynağı .env (.env.example'ı kopyalayın). Doğrulama config/config.ts'te.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  installBigIntJson();
  const cfg = loadConfig();

  // Panelin SSE bağlantısı hiç kapanmaz; kapanışta zorla kesilmezse süreç çıkamaz
  // ve `nest start --watch` yeni sürümü başlatamaz (backend sessizce ölü kalır).
  const app = await NestFactory.create(AppModule.forRoot(cfg), {
    forceCloseConnections: true,
  });
  app.enableCors({ origin: cfg.corsOrigins, exposedHeaders: EXPOSED_HEADERS });
  app.useGlobalFilters(new ReinkeyExceptionFilter());
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Reinkey facilitator')
      .setDescription(
        'Stellar üzerinde sayaçlı x402: channel şeması, kupon doğrulama, otomatik claim, demo satıcı.',
      )
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'openapi.json' });

  await app.listen(cfg.port);
  new Logger('Reinkey').log(
    `${cfg.publicUrl} dinleniyor (CHAIN_MODE=${cfg.chainMode}, payTo ${cfg.sellerPayTo})`,
  );
}
void bootstrap();
