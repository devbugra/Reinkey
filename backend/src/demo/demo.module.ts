import {
  Global,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { MeterFactory } from '../x402/meter.factory';
import { BookController } from './book.controller';
import { ChatController } from './chat.controller';
import { InfoController } from './info.controller';
import { PriceService } from './price.service';
import { TickerController } from './ticker.controller';

@Global()
@Module({
  providers: [PriceService],
  controllers: [
    InfoController,
    BookController,
    TickerController,
    ChatController,
  ],
  exports: [PriceService],
})
export class DemoModule implements NestModule {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly meters: MeterFactory,
    private readonly prices: PriceService,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    /**
     * Fiyat kaynağı okunamıyorsa ödeme alınmadan önce 503 dönülür: satamayacağımız
     * verinin parasını almayız.
     */
    const requirePrice = (_req: Request, res: Response, next: NextFunction) => {
      this.prices.quote().then(
        () => next(),
        (e: unknown) => {
          const err =
            e instanceof ReinkeyError
              ? e
              : new ReinkeyError(
                  'PRICE_SOURCE_UNAVAILABLE',
                  'Fiyat kaynağı okunamıyor',
                  'chain',
                  503,
                );
          res.status(err.status).json(err.toBody());
        },
      );
    };

    consumer
      .apply(
        requirePrice,
        this.meters.create({
          price: this.cfg.priceBookPerRequest,
          unit: 'request',
          description:
            'XLM/USDC order book derived from on-chain Soroswap reserves, paid per request',
        }),
      )
      .forRoutes({ path: 'demo/book', method: RequestMethod.GET });

    consumer
      .apply(
        requirePrice,
        this.meters.create({
          price: this.cfg.priceTickerPerSecond,
          unit: 'second',
          sliceSeconds: this.cfg.tickerSliceSeconds,
          description: 'Live XLM/USDC ticker, paid per second',
        }),
      )
      .forRoutes({ path: 'demo/ticker/stream', method: RequestMethod.GET });

    consumer
      .apply(
        this.meters.create({
          price: this.cfg.priceChatPerToken,
          unit: 'token',
          sliceTokens: this.cfg.chatSliceTokens,
          description: 'Streamed chat completion, paid per token',
        }),
      )
      .forRoutes({ path: 'demo/chat', method: RequestMethod.POST });
  }
}
