import { Inject, Injectable } from '@nestjs/common';
import { EventsService } from '../audit/events.service';
import { PrismaService } from '../audit/prisma.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ChannelStore } from '../channel/channel.cache';

/**
 * SATICI FİNANSI (Reinkey Meter): gelir, alacak ve tahsilat raporu.
 *
 * Kaynak denetim defteridir (Event tablosu) ve kanal durumu; ayrı bir muhasebe
 * tablosu tutulmaz, böylece rapor ile defter ayrışamaz. Üç kavram:
 *   kazanılan  = kabul edilen kuponların toplamı (imzalı, tahsil edilebilir alacak)
 *   tahsil     = zincirde claim ile satıcının cüzdanına geçen tutar
 *   alacak     = kazanılan − tahsil (kanal bazında lastAccepted − claimed)
 * Aynı tahsilat eski kayıtlarda iki kez yayınlanmış olabilir; tx bazında tekilleştirilir.
 */
const LEDGER_SECONDS = 5;

export type Bucket = 'hour' | 'day';

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly store: ChannelStore,
    @Inject(CHAIN) private readonly chain: ChainPort,
  ) {}

  private since(days: number): Date {
    return new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000);
  }

  async report(payTo: string, days = 30, bucket: Bucket = 'day') {
    await this.events.flush();
    const since = this.since(days);
    const trunc = bucket === 'hour' ? 'hour' : 'day';

    const [byResource, series, settlements, ledger] = await Promise.all([
      this.prisma.$queryRaw<{ resource: string; unit: string; payments: bigint; amount: string; buyers: bigint }[]>`
        SELECT e.data->>'resource' AS resource, COALESCE(e.data->>'unit','request') AS unit,
               COUNT(*) AS payments, COALESCE(SUM((e.data->>'delta')::numeric),0)::text AS amount,
               COUNT(DISTINCT c.payer) AS buyers
        FROM "Event" e JOIN "Channel" c ON c.id = e."channelId"
        WHERE e.type = 'voucher.accepted' AND c.payee = ${payTo} AND e."createdAt" >= ${since}
        GROUP BY 1, 2 ORDER BY SUM((e.data->>'delta')::numeric) DESC`,
      this.prisma.$queryRaw<{ t: Date; earned: string; settled: string; payments: bigint }[]>`
        WITH v AS (
          SELECT date_trunc(${trunc}, e."createdAt") AS t, SUM((e.data->>'delta')::numeric) AS earned, COUNT(*) AS payments
          FROM "Event" e JOIN "Channel" c ON c.id = e."channelId"
          WHERE e.type = 'voucher.accepted' AND c.payee = ${payTo} AND e."createdAt" >= ${since} GROUP BY 1
        ), s AS (
          SELECT date_trunc(${trunc}, at) AS t, SUM(amount) AS settled FROM (
            SELECT e.tx, MIN(e."createdAt") AS at, MAX((e.data->>'amount')::numeric) AS amount
            FROM "Event" e JOIN "Channel" c ON c.id = e."channelId"
            WHERE e.type = 'channel.claimed' AND c.payee = ${payTo} AND e."createdAt" >= ${since} GROUP BY e.tx
          ) x GROUP BY 1
        )
        SELECT COALESCE(v.t, s.t) AS t, COALESCE(v.earned,0)::text AS earned, COALESCE(s.settled,0)::text AS settled,
               COALESCE(v.payments,0) AS payments
        FROM v FULL OUTER JOIN s ON v.t = s.t ORDER BY 1`,
      this.prisma.$queryRaw<{ tx: string; at: Date; channelId: bigint; payer: string; amount: string; covered: number }[]>`
        SELECT e.tx, MIN(e."createdAt") AS at, e."channelId", c.payer,
               MAX((e.data->>'amount')::numeric)::text AS amount,
               MAX(COALESCE((e.data->>'vouchersCovered')::int,0)) AS covered
        FROM "Event" e JOIN "Channel" c ON c.id = e."channelId"
        WHERE e.type = 'channel.claimed' AND c.payee = ${payTo} AND e."createdAt" >= ${since} AND e.tx IS NOT NULL
        GROUP BY e.tx, e."channelId", c.payer ORDER BY 2 DESC`,
      this.chain.latestLedger().catch(() => 0),
    ]);

    // Alacaklar canlı kanal durumundan: defter penceresinden bağımsız, şu anki gerçek.
    const lastVoucher = await this.prisma.$queryRaw<{ channelId: bigint; at: Date }[]>`
      SELECT e."channelId", MAX(e."createdAt") AS at FROM "Event" e JOIN "Channel" c ON c.id = e."channelId"
      WHERE e.type = 'voucher.accepted' AND c.payee = ${payTo} GROUP BY 1`;
    const lastAt = new Map(lastVoucher.map((r) => [r.channelId.toString(), r.at]));
    const receivables = this.store
      .all()
      .filter((c) => c.payee === payTo && c.lastAccepted > c.claimed)
      .map((c) => {
        const at = lastAt.get(c.id.toString());
        const ledgersLeft = ledger ? c.expiryLedger - ledger : null;
        return {
          channelId: c.id.toString(),
          payer: c.payer,
          amount: c.lastAccepted - c.claimed,
          vouchers: c.vouchersSinceClaim,
          open: c.open,
          lastVoucherAt: at ? at.toISOString() : null,
          ageSeconds: at ? Math.round((Date.now() - at.getTime()) / 1000) : null,
          /** Kanalın süresi dolmadan tahsil edilmeli; facilitator bunu otomatik yapar. */
          expiresInSeconds: ledgersLeft === null ? null : Math.max(0, ledgersLeft * LEDGER_SECONDS),
        };
      })
      .sort((a, b) => (a.amount < b.amount ? 1 : -1));

    const earned = byResource.reduce((s, r) => s + BigInt(r.amount.split('.')[0]), 0n);
    const settled = settlements.reduce((s, r) => s + BigInt(r.amount.split('.')[0]), 0n);
    const payments = byResource.reduce((s, r) => s + Number(r.payments), 0);
    const receivable = receivables.reduce((s, r) => s + r.amount, 0n);
    const covered = settlements.reduce((s, r) => s + r.covered, 0);

    return {
      payTo,
      window: { since: since.toISOString(), days, bucket },
      totals: {
        earned,
        settled,
        receivable,
        payments,
        settlements: settlements.length,
        /** Bir zincir işleminin ortalama kaç ödemeyi tahsil ettiği: kanal şemasının verimi. */
        paymentsPerSettlement: settlements.length ? Math.round((covered / settlements.length) * 10) / 10 : null,
        buyers: new Set(this.store.all().filter((c) => c.payee === payTo).map((c) => c.payer)).size,
      },
      byResource: byResource.map((r) => ({
        resource: r.resource,
        unit: r.unit,
        payments: Number(r.payments),
        buyers: Number(r.buyers),
        amount: BigInt(r.amount.split('.')[0]),
      })),
      series: series.map((r) => ({
        t: r.t.toISOString(),
        earned: BigInt(r.earned.split('.')[0]),
        settled: BigInt(r.settled.split('.')[0]),
        payments: Number(r.payments),
      })),
      receivables,
      settlements: settlements.map((r) => ({
        tx: r.tx,
        at: r.at.toISOString(),
        channelId: r.channelId.toString(),
        payer: r.payer,
        amount: BigInt(r.amount.split('.')[0]),
        paymentsCovered: r.covered,
      })),
    };
  }

  /** Muhasebe dışa aktarımı: tahsilat başına bir satır (zincirde kesinleşmiş gelir). */
  async settlementsCsv(payTo: string, days = 30): Promise<string> {
    const r = await this.report(payTo, days);
    const usdc = (v: bigint) => `${v / 10_000_000n}.${(v % 10_000_000n).toString().padStart(7, '0')}`;
    const rows = [
      ['settled_at', 'tx', 'channel_id', 'payer', 'amount_usdc', 'payments_covered', 'explorer'],
      ...r.settlements.map((s) => [
        s.at,
        s.tx,
        s.channelId,
        s.payer,
        usdc(s.amount),
        String(s.paymentsCovered),
        `https://stellar.expert/explorer/testnet/tx/${s.tx}`,
      ]),
    ];
    return rows.map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
  }
}
