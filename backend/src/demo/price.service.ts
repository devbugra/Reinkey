import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHAIN, type ChainPort, type PairReserves } from '../chain/chain.port';
import { ReinkeyError } from '../common/errors';

const SCALE = 10_000_000n; // 7 ondalık
const REFRESH_MS = 3_000;
const STALE_MS = 30_000;
/** Soroswap havuz ücreti: %0,3. */
const FEE_NUM = 997n;
const FEE_DEN = 1000n;
const LEVELS = 10;
/** Defter seviyeleri arası fiyat adımı: %0,5. */
const STEP_BPS = 50n;

export function fmt7(v: bigint): string {
  const s = v.toString().padStart(8, '0');
  return `${s.slice(0, -7)}.${s.slice(-7)}`;
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y === x || y === x + 1n || y === x - 1n) {
      // Newton yakınsadı; tam tabanı seç.
      let r = y < x ? y : x;
      while (r * r > n) r--;
      while ((r + 1n) * (r + 1n) <= n) r++;
      return r;
    }
    x = y;
  }
}

export interface Quote {
  pair: 'XLM_USDC';
  /** 1 XLM kaç USDC (7 ondalık, taban birim). */
  mid: bigint;
  bid: bigint;
  ask: bigint;
  reserveUsdc: bigint;
  reserveXlm: bigint;
  ledger: number;
  fetchedAt: number;
}

/**
 * GERÇEK FİYAT KAYNAĞI: Soroswap USDC/XLM havuzunun zincirdeki rezervleri.
 * Sentetik ya da rastgele fiyat YOKTUR. Havuz okunamazsa `PRICE_SOURCE_UNAVAILABLE`.
 * Ajanın satın aldığı veri, işlem yaptığı DEX'in kendi fiyatıdır.
 */
@Injectable()
export class PriceService {
  private readonly log = new Logger('Price');
  private last?: Quote;
  private inflight?: Promise<Quote>;
  private lastError?: string;

  constructor(@Inject(CHAIN) private readonly chain: ChainPort) {}

  health() {
    return {
      priceSource: 'dex' as const,
      priceOk: !!this.last && Date.now() - this.last.fetchedAt < STALE_MS,
      ...(this.last
        ? { price: fmt7(this.last.mid), priceLedger: this.last.ledger }
        : {}),
      ...(this.lastError ? { priceError: this.lastError } : {}),
    };
  }

  static fromReserves(r: PairReserves, now = Date.now()): Quote {
    if (r.reserveXlm <= 0n || r.reserveUsdc <= 0n)
      throw new Error('havuz boş');
    const mid = (r.reserveUsdc * SCALE) / r.reserveXlm;
    return {
      pair: 'XLM_USDC',
      mid,
      bid: (mid * FEE_NUM) / FEE_DEN,
      ask: (mid * FEE_DEN) / FEE_NUM,
      reserveUsdc: r.reserveUsdc,
      reserveXlm: r.reserveXlm,
      ledger: r.ledger,
      fetchedAt: now,
    };
  }

  /** Güncel fiyat; 3 sn'den eskiyse zincirden yeniler. Bayat (30 sn+) veri döndürülmez. */
  async quote(): Promise<Quote> {
    const now = Date.now();
    if (this.last && now - this.last.fetchedAt < REFRESH_MS) return this.last;
    this.inflight ??= this.chain
      .getPairReserves()
      .then((r) => {
        this.last = PriceService.fromReserves(r);
        this.lastError = undefined;
        return this.last;
      })
      .catch((e: Error) => {
        this.lastError = e.message.slice(0, 200);
        this.log.warn(`havuz okunamadı: ${this.lastError}`);
        throw e;
      })
      .finally(() => (this.inflight = undefined));
    try {
      return await this.inflight;
    } catch {
      if (this.last && now - this.last.fetchedAt < STALE_MS) return this.last;
      throw new ReinkeyError(
        'PRICE_SOURCE_UNAVAILABLE',
        'DEX havuzu okunamıyor; fiyat verisi sunulamıyor',
        'chain',
        503,
      );
    }
  }

  /**
   * Emir defteri: havuzun sabit çarpım eğrisinden (x·y=k) türetilen 10 seviye.
   * Bir seviyenin miktarı, fiyatı bir önceki seviyeden o seviyeye taşımak için
   * alınması/satılması gereken XLM'dir: x(P) = sqrt(k / P).
   */
  static book(q: Quote) {
    const k = q.reserveUsdc * q.reserveXlm;
    const xAt = (price: bigint) => isqrt((k * SCALE) / price);
    const asks: { price: string; amount: string }[] = [];
    const bids: { price: string; amount: string }[] = [];
    let prevAsk = q.mid;
    let prevBid = q.mid;
    for (let i = 1; i <= LEVELS; i++) {
      const up = (q.mid * (10_000n + STEP_BPS * BigInt(i))) / 10_000n;
      const down = (q.mid * (10_000n - STEP_BPS * BigInt(i))) / 10_000n;
      asks.push({
        price: fmt7((up * FEE_DEN) / FEE_NUM),
        amount: fmt7(xAt(prevAsk) - xAt(up)),
      });
      bids.push({
        price: fmt7((down * FEE_NUM) / FEE_DEN),
        amount: fmt7(xAt(down) - xAt(prevBid)),
      });
      prevAsk = up;
      prevBid = down;
    }
    return { asks, bids };
  }
}
