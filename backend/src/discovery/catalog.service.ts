import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../audit/prisma.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { MeterFactory } from '../x402/meter.factory';
import { bazaarExtension, paymentRequirements } from '../x402/meter';
import { priceList } from './price-list';

/**
 * BAZAAR KATALOĞU (x402 keşif katmanı).
 *
 * Kayıt ucu yoktur: bir kaynak kataloğa yalnızca `/verify`'dan geçen gerçek bir
 * ödemeyle girer (ödeme kanıtı = listelenme hakkı; spam'e kapalı). Facilitator'ın
 * kendi demo uçları açılışta eklenir. Liste biçimi x402.org facilitator'ının
 * `GET /discovery/resources` yanıtıyla aynıdır: { x402Version, items, pagination }.
 */
export interface CatalogItem {
  resource: string;
  type: 'http';
  x402Version: 2;
  accepts: Record<string, unknown>[];
  lastUpdated: string;
  metadata: Record<string, unknown>;
}

export interface Seen {
  resource: string;
  method?: string;
  payTo: string;
  unit: string;
  price: bigint;
  description?: string;
  accepts?: Record<string, unknown>[];
  /** 402'deki `extensions.bazaar` (satıcı gönderdiyse). */
  bazaar?: Record<string, unknown>;
}

const MAX_LIMIT = 100;
const MAX_URL = 2048;
const MAX_DESCRIPTION = 500;
const MAX_JSON = 16_384;

/**
 * Kataloğa girebilecek hâle getirir ya da null döner. Katalog ajanlara sunulur:
 * satıcının gönderdiği serbest metin ve JSON sınırlanır, bedava kaynak listelenmez.
 */
export function admissible(s: Seen): Seen | null {
  if (s.price <= 0n) return null;
  if (s.resource.length > MAX_URL || !/^https?:\/\//i.test(s.resource)) return null;
  const fits = (v: unknown) => v === undefined || JSON.stringify(v).length <= MAX_JSON;
  return {
    ...s,
    unit: s.unit.slice(0, 16),
    method: s.method?.slice(0, 8),
    description: s.description?.slice(0, MAX_DESCRIPTION),
    // Sığmayan uzantı atılır; kayıt varsayılan meta veriyle yine yapılır.
    accepts: fits(s.accepts) ? s.accepts : undefined,
    bazaar: fits(s.bazaar) ? s.bazaar : undefined,
  };
}

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly log = new Logger('Bazaar');

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly prisma: PrismaService,
    private readonly meters: MeterFactory,
  ) {}

  /** Demo satıcının uçları: fiyat listesindeki her kaynak, gerçek 402'deki accepts ile. */
  async onModuleInit() {
    for (const r of priceList(this.cfg).resources) {
      const opts = {
        price: BigInt(r.price),
        unit: r.unit,
        description: r.description,
        sliceTokens: r.sliceTokens,
        sliceSeconds: r.sliceSeconds,
      };
      await this.record(
        {
          resource: r.url,
          method: r.method,
          payTo: this.cfg.sellerPayTo,
          unit: r.unit,
          price: BigInt(r.price),
          description: r.description,
          accepts: paymentRequirements(opts, this.meters.deps, r.url),
          bazaar: bazaarExtension(opts, r.method),
        },
        false,
      ).catch((e) => this.log.warn(`demo kaynağı eklenemedi: ${(e as Error).message}`));
    }
  }

  /**
   * Görülen kaynağı ekler ya da günceller; `paid` ise ödeme sayacı artar.
   * Tek SQL ile (INSERT … ON CONFLICT): /verify yazımı beklemez, art arda gelen
   * ödemelerin yazımları çakışır; Prisma upsert'i bu yarışta tekil anahtar hatası verirdi.
   */
  async record(seen: Seen, paid = true) {
    const s = admissible(seen);
    if (!s) return;
    const method = (s.method ?? 'GET').toUpperCase();
    const metadata =
      s.bazaar ?? bazaarExtension({ unit: s.unit as 'request' | 'token' | 'second' }, method);
    const accepts = s.accepts ?? [];
    const inc = paid ? 1 : 0;
    await this.prisma.$executeRaw`
      INSERT INTO "Resource" ("url", "method", "payTo", "unit", "price", "description", "accepts", "metadata", "payments", "firstSeenAt", "lastPaidAt")
      VALUES (${s.resource}, ${method}, ${s.payTo}, ${s.unit}, ${s.price}, ${s.description ?? ''}, ${JSON.stringify(accepts)}::jsonb, ${JSON.stringify(metadata)}::jsonb, ${inc}, now(), now())
      ON CONFLICT ("url") DO UPDATE SET
        "method" = EXCLUDED."method",
        "unit" = EXCLUDED."unit",
        "price" = EXCLUDED."price",
        "description" = CASE WHEN ${s.description !== undefined} THEN EXCLUDED."description" ELSE "Resource"."description" END,
        "accepts" = CASE WHEN ${s.accepts !== undefined} THEN EXCLUDED."accepts" ELSE "Resource"."accepts" END,
        "metadata" = CASE WHEN ${s.bazaar !== undefined} THEN EXCLUDED."metadata" ELSE "Resource"."metadata" END,
        "payments" = "Resource"."payments" + ${inc},
        "lastPaidAt" = CASE WHEN ${paid} THEN now() ELSE "Resource"."lastPaidAt" END
      WHERE "Resource"."payTo" = EXCLUDED."payTo"`;
    // WHERE: bir adres ilk kimin ödemesiyle listelendiyse onundur. Başka bir
    // `payTo` ile gelen ödeme kaydı DEĞİŞTİRMEZ; aksi hâlde 1 stroop'luk geçerli bir
    // kuponla herkes başkasının kaynağını kendi adresine yönlendirebilirdi.
  }

  async list(q: { limit?: number; offset?: number; payTo?: string } = {}) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), MAX_LIMIT);
    const offset = Math.max(q.offset ?? 0, 0);
    const where = q.payTo ? { payTo: q.payTo } : {};
    const [rows, total] = await Promise.all([
      this.prisma.resource.findMany({
        where,
        orderBy: [{ lastPaidAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.resource.count({ where }),
    ]);
    const items: CatalogItem[] = rows.map((r) => ({
      resource: r.url,
      type: 'http',
      x402Version: 2,
      accepts: r.accepts as Record<string, unknown>[],
      lastUpdated: r.lastPaidAt.toISOString(),
      metadata: {
        ...(r.metadata as Record<string, unknown>),
        method: r.method,
        description: r.description,
        payTo: r.payTo,
        unit: r.unit,
        price: r.price.toString(),
        payments: r.payments,
        firstSeen: r.firstSeenAt.toISOString(),
      },
    }));
    return { x402Version: 2, items, pagination: { limit, offset, total } };
  }
}
