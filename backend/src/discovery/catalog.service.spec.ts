import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/config';
import { admissible, CatalogService, type Seen } from './catalog.service';

const seen = (over: Partial<Seen> = {}): Seen => ({
  resource: 'https://seller.example/quote',
  payTo: 'GSELLER',
  unit: 'request',
  price: 5000n,
  ...over,
});

function setup() {
  const sql: string[] = [];
  const prisma = {
    $executeRaw: async (strings: TemplateStringsArray) => {
      sql.push(strings.join('?'));
      return 1;
    },
  };
  const svc = new CatalogService({} as AppConfig, prisma as never, {} as never);
  return { svc, sql };
}

describe('Bazaar kataloğu', () => {
  it('çakışmada payTo değiştirilmez: güncelleme yalnızca aynı alıcıya uygulanır', async () => {
    const { svc, sql } = setup();
    await svc.record(seen({ payTo: 'GATTACKER' }));
    expect(sql).toHaveLength(1);
    const update = sql[0].slice(sql[0].indexOf('DO UPDATE'));
    const set = update.slice(0, update.indexOf('WHERE'));
    expect(set).not.toContain('"payTo"');
    expect(update).toMatch(/WHERE "Resource"\."payTo" = EXCLUDED\."payTo"/);
  });

  it('bedava ya da http olmayan kaynağı listelemez', async () => {
    const { svc, sql } = setup();
    await svc.record(seen({ price: 0n }));
    await svc.record(seen({ resource: 'javascript:alert(1)' }));
    expect(sql).toHaveLength(0);
  });

  it('serbest metni ve büyük uzantıları sınırlar', () => {
    const a = admissible(seen({ description: 'x'.repeat(5000), bazaar: { blob: 'y'.repeat(50_000) } }));
    expect(a?.description).toHaveLength(500);
    expect(a?.bazaar).toBeUndefined();
  });
});
