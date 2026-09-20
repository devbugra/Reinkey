import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { installBigIntJson } from './common/bigint';
import { ipLimit, securityHeaders } from './common/ip-limit';
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
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(cfg),
    { forceCloseConnections: true },
  );
  // Barındırıcının proxy'si arkasındayız: gerçek istemci IP'si X-Forwarded-For'da.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  if (cfg.ipRateLimitPerMinute > 0)
    app.use(
      ipLimit({
        windowMs: 60_000,
        general: cfg.ipRateLimitPerMinute,
        writes: cfg.ipCostlyLimitPerMinute || cfg.ipRateLimitPerMinute,
        skip: (path) => path === '/events' || path === '/health',
        // Sunucuya zincir ücreti ödeten ya da doğrulanamayan kayıt yazan uçlar.
        costly: (req) =>
          req.method === 'POST' &&
          (/^\/demo\/(agent\/run|owner\/freeze)$/.test(req.path) ||
            /^\/channels\/[^/]+\/claim$/.test(req.path) ||
            /^\/receipts\/[^/]+\/attest$/.test(req.path) ||
            req.path === '/v1/report'),
      }),
    );
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
  const log = new Logger('Reinkey');
  if (cfg.publicUrlSuspect)
    log.error(
      `PUBLIC_URL üretimde ${cfg.publicUrl}: 402 yanıtları, makbuzlar ve katalog bu adresi taşır. Servisin dış adresini PUBLIC_URL olarak verin.`,
    );
  if (cfg.demoControls && !cfg.demoControlKey)
    log.warn(
      'DEMO_CONTROLS açık ve DEMO_CONTROL_KEY yok: ajan başlatma ve dondurma herkese açık.',
    );
  log.log(
    `${cfg.publicUrl} dinleniyor (CHAIN_MODE=${cfg.chainMode}, payTo ${cfg.sellerPayTo})`,
  );
}
void bootstrap();
