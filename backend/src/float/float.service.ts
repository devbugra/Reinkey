import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../audit/prisma.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';

/**
 * REINKEY FLOAT: kredi havuzunun salt okunur görünümü (contracts/credit-pool).
 *
 * Fikir: Reins hesabındaki para yalnızca politikanın izin verdiği yerlere gidebilir.
 * Hesap havuza devredilince (`set_controller`) sahip imzası da geçersizleşir; kredi
 * dışarı kaçamaz, bu yüzden teminat istenmez. Yatırımcı USDC yatırıp pay alır; pay
 * fiyatı = (havuzdaki USDC + açık borç + havuzdaki XLM × fiyat) / toplam pay.
 *
 * Bu servis zincire YAZMAZ: her şey simülasyonla okunur. Pay fiyatı dakikada bir
 * örneklenip Postgres'e yazılır; kontrat geçmiş tutmadığı için getiri grafiği buradan gelir.
 */
const SCALE = 10_000_000n;
const CACHE_MS = 5_000;
const SAMPLE_MS = 60_000;
const HISTORY_LIMIT = 500;

type Wrapped<T> = T | { value: T };
const unwrap = <T>(v: Wrapped<T>): T =>
  v !== null && typeof v === 'object' && 'value' in (v as object) && Object.keys(v as object).length === 1
    ? (v as { value: T }).value
    : (v as T);

interface RawConfig {
  admin: string;
  usdc: string;
  xlm: string;
  oracle?: string | null;
  pair?: string | null;
  liq_threshold_bps: number;
  profit_share_bps: number;
  max_price_age: bigint | number | string;
}
interface RawLine {
  debt: bigint;
  beneficiary: string;
  open: boolean;
}
interface RawHealth {
  value: bigint;
  debt: bigint;
  usdc: bigint;
  xlm: bigint;
  price: bigint;
  liquidatable: boolean;
}

export interface PoolSummary {
  pool: string;
  config: {
    admin: string;
    liqThresholdBps: number;
    profitShareBps: number;
    maxPriceAgeSeconds: number;
    oracle: string | null;
    pair: string | null;
  };
  totalShares: bigint;
  totalAssets: bigint;
  totalDebt: bigint;
  /** Havuzda boşta duran (kredi olarak verilmemiş) varlık. */
  idle: bigint;
  /** 1 payın USDC değeri (7 ondalık). */
  sharePrice: bigint;
  /** 1 XLM kaç USDC (7 ondalık); oracle ile DEX'in düşüğü. */
  price: bigint;
  /** Açık borç / toplam varlık, baz puan. */
  utilizationBps: number;
  ledger: number;
  asOf: string;
}

export interface LineView {
  account: string;
  open: boolean;
  debt: bigint;
  beneficiary: string;
  value: bigint;
  usdc: bigint;
  xlm: bigint;
  price: bigint;
  liquidatable: boolean;
  /** Değer / borç, baz puan (10000 = borç kadar değer). Borç yoksa null. */
  healthBps: number | null;
  /** Tasfiye eşiği (baz puan); healthBps bunun altına inerse herkes tasfiye edebilir. */
  liqThresholdBps: number;
}

@Injectable()
export class FloatService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('Float');
  private cache?: { at: number; pool: PoolSummary; lines: LineView[] };
  private inflight?: Promise<{ pool: PoolSummary; lines: LineView[] }>;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    return !!this.cfg.creditPoolId;
  }

  onModuleInit() {
    if (!this.enabled) return;
    const sample = () => void this.sample().catch((e) => this.log.warn(`örnek alınamadı: ${(e as Error).message}`));
    sample();
    this.timer = setInterval(sample, SAMPLE_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private pool(): string {
    if (!this.cfg.creditPoolId)
      throw new ReinkeyError('NOT_SUPPORTED', 'Bu facilitator bir kredi havuzuna bağlı değil (CREDIT_POOL_ID)');
    return this.cfg.creditPoolId;
  }

  private read<T>(method: string, args?: Record<string, unknown>): Promise<T> {
    return this.chain.readContract<Wrapped<T>>(this.pool(), method, args).then(unwrap);
  }

  private async line(account: string, liqThresholdBps: number): Promise<LineView> {
    const [line, health] = await Promise.all([
      this.read<RawLine | null | undefined>('get_line', { account }),
      this.read<RawHealth>('health', { account }),
    ]);
    const debt = BigInt(health.debt);
    const value = BigInt(health.value);
    return {
      account,
      open: !!line?.open,
      debt,
      beneficiary: line?.beneficiary ?? '',
      value,
      usdc: BigInt(health.usdc),
      xlm: BigInt(health.xlm),
      price: BigInt(health.price),
      liquidatable: health.liquidatable,
      healthBps: debt > 0n ? Number((value * 10_000n) / debt) : null,
      liqThresholdBps,
    };
  }

  private async load() {
    const [config, totalShares, totalDebt, totalAssets, sharePrice, price, ledger] = await Promise.all([
      this.read<RawConfig>('get_config'),
      this.read<bigint>('total_shares'),
      this.read<bigint>('total_debt'),
      this.read<bigint>('total_assets'),
      this.read<bigint>('share_price'),
      this.read<bigint>('price'),
      this.chain.latestLedger(),
    ]);
    const assets = BigInt(totalAssets);
    const debt = BigInt(totalDebt);
    const pool: PoolSummary = {
      pool: this.pool(),
      config: {
        admin: config.admin,
        liqThresholdBps: Number(config.liq_threshold_bps),
        profitShareBps: Number(config.profit_share_bps),
        maxPriceAgeSeconds: Number(config.max_price_age),
        oracle: config.oracle ?? null,
        pair: config.pair ?? null,
      },
      totalShares: BigInt(totalShares),
      totalAssets: assets,
      totalDebt: debt,
      idle: assets > debt ? assets - debt : 0n,
      sharePrice: BigInt(sharePrice),
      price: BigInt(price),
      utilizationBps: assets > 0n ? Number((debt * 10_000n) / assets) : 0,
      ledger,
      asOf: new Date().toISOString(),
    };
    const lines = await Promise.all(
      this.cfg.creditAccountIds.map((a) => this.line(a, pool.config.liqThresholdBps)),
    );
    return { pool, lines };
  }

  /** Havuz + bilinen hatlar; 5 sn önbellekli, eşzamanlı istekler tek okumayı paylaşır. */
  async snapshot() {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache;
    this.inflight ??= this.load().finally(() => (this.inflight = undefined));
    const fresh = await this.inflight;
    this.cache = { at: Date.now(), ...fresh };
    return this.cache;
  }

  async lineFor(account: string): Promise<LineView> {
    const { pool } = await this.snapshot();
    return this.line(account, pool.config.liqThresholdBps);
  }

  /** Yatırımcının payı ve bugünkü USDC karşılığı. */
  async position(address: string) {
    const [{ pool }, shares] = await Promise.all([
      this.snapshot(),
      this.read<bigint>('balance', { id: address }),
    ]);
    const s = BigInt(shares);
    return {
      address,
      shares: s,
      value: (s * pool.sharePrice) / SCALE,
      shareOfPoolBps: pool.totalShares > 0n ? Number((s * 10_000n) / pool.totalShares) : 0,
      sharePrice: pool.sharePrice,
    };
  }

  async positions() {
    return Promise.all(this.cfg.floatInvestors.map((a) => this.position(a)));
  }

  private async sample() {
    const { pool } = await this.snapshot();
    await this.prisma.poolSample.create({
      data: {
        pool: pool.pool,
        sharePrice: pool.sharePrice,
        totalAssets: pool.totalAssets,
        totalDebt: pool.totalDebt,
        totalShares: pool.totalShares,
        price: pool.price,
      },
    });
  }

  /** Pay fiyatı geçmişi, eskiden yeniye. */
  async history(limit = 200) {
    const rows = await this.prisma.poolSample.findMany({
      where: { pool: this.pool() },
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(limit, 1), HISTORY_LIMIT),
    });
    return rows.reverse().map((r) => ({
      ts: r.createdAt.toISOString(),
      sharePrice: r.sharePrice,
      totalAssets: r.totalAssets,
      totalDebt: r.totalDebt,
      price: r.price,
    }));
  }
}
