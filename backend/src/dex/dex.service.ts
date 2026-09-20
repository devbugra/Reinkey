import { Inject, Injectable } from '@nestjs/common';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PriceService } from '../demo/price.service';

/**
 * BORSA KATMANI — x402 ile ölçülen emir yolu.
 *
 * Kendi likidite havuzumuz YOKTUR ve olmayacak: takas Stellar üzerindeki mevcut
 * likiditede (Soroswap) gerçekleşir. Bizim kattığımız üç şey:
 *
 *   1. Rota ve fiyat etkisi, havuzun sabit çarpım eğrisinden hesaplanır.
 *   2. Kayma koruması önerisi (`minOut`) — kontrat bunu ZORUNLU tutar.
 *   3. POLİTİKA ÖN KARARI: bu işlem, ajanın kendi hesabından geçer mi? Kuralların
 *      kaynağı `contracts/reinkey-account` (`check_swap` + tavanlar); burada aynı
 *      kurallar zincire gitmeden, ücret ödemeden uygulanır. Kesin karar her zaman
 *      zincirindir; bu yalnızca önizlemedir.
 *
 * Fiyat iki kaynaktan okunur: Soroswap havuz rezervleri ve kredi havuzunun
 * ihtiyatlı fiyatı (Reflector oracle ile havuzun düşüğü). İkisi de gösterilir.
 */
const SCALE = 10_000_000n;
const FEE_NUM = 997n;
const FEE_DEN = 1000n;
const DEFAULT_SLIPPAGE_BPS = 100n;

export type Side = 'USDC_XLM' | 'XLM_USDC';

/** Taban birimi insanın okuduğu tutara çevirir: red sebebi ekranda ham sayı olmasın. */
function usdcAmount(base: bigint): string {
  const whole = base / SCALE;
  const frac = (base % SCALE).toString().padStart(7, '0').slice(0, 4).replace(/0+$/, '');
  return `${whole}${frac ? `,${frac}` : ''} USDC`;
}

export interface PolicyVerdict {
  /** Zincirin bu işlemi kabul edeceği tahmini. */
  allowed: boolean;
  /** Reddedilecekse kontratın vereceği sebep kodu. */
  code: string | null;
  message: string | null;
  caps: {
    perTxCap: string;
    dailyCap: string;
    spentToday: string;
    remainingToday: string;
    /** Tavanlara sayılan çıkış: yalnızca politikanın varlığı (USDC) satılırken. */
    counted: string;
  } | null;
}

@Injectable()
export class DexService {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly prices: PriceService,
  ) {}

  private assets(side: Side) {
    const usdc = this.cfg.usdcContractId;
    const xlm = this.cfg.xlmContractId;
    if (!xlm) throw new ReinkeyError('NOT_SUPPORTED', 'XLM_CONTRACT_ID tanımlı değil; DEX katmanı kapalı');
    return side === 'USDC_XLM'
      ? { sell: 'USDC', buy: 'XLM', sellId: usdc, buyId: xlm }
      : { sell: 'XLM', buy: 'USDC', sellId: xlm, buyId: usdc };
  }

  /** Sabit çarpım eğrisi, havuz ücreti dahil: dx → dy. */
  private out(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    const withFee = amountIn * FEE_NUM;
    return (withFee * reserveOut) / (reserveIn * FEE_DEN + withFee);
  }

  /**
   * Politikayı kontratın kurallarıyla önden uygular. Kaynak:
   * contracts/reinkey-account/src/lib.rs → check_swap ve check_contexts.
   */
  private async verdict(account: string | undefined, side: Side, amountIn: bigint, minOut: bigint): Promise<PolicyVerdict> {
    if (!account) return { allowed: true, code: null, message: null, caps: null };
    const state = await this.chain.getAccount(account).catch(() => null);
    if (!state)
      return { allowed: false, code: 'NOT_FOUND', message: `Hesap ${account} zincirde okunamadı`, caps: null };

    const { sell, buy } = this.assets(side);
    const p = state.policy;
    const counted = sell === 'USDC' ? amountIn : 0n;
    const spent = BigInt(state.spentToday);
    const caps = {
      perTxCap: p.perTxCap.toString(),
      dailyCap: p.dailyCap.toString(),
      spentToday: spent.toString(),
      remainingToday: (p.dailyCap > spent ? p.dailyCap - spent : 0n).toString(),
      counted: counted.toString(),
    };
    const no = (code: string, message: string): PolicyVerdict => ({ allowed: false, code, message, caps });

    if (state.frozen) return no('ACCOUNT_FROZEN', 'Hesap sahibi tarafından dondurulmuş');
    if (!p.dexRouter) return no('CONTEXT_NOT_ALLOWED', 'Politikada DEX router yok: takas kapalı');
    if (!p.pairs.includes(`${sell}→${buy}`)) return no('PAIR_NOT_ALLOWED', `${sell}→${buy} çifti politikada yok`);
    if (minOut <= 0n) return no('SLIPPAGE_UNBOUNDED', 'Kayma koruması zorunlu: minOut sıfır olamaz');
    if (amountIn <= 0n) return no('CONTEXT_NOT_ALLOWED', 'Tutar sıfırdan büyük olmalı');
    const ledger = await this.chain.latestLedger().catch(() => 0);
    if (ledger && p.expiresLedger && ledger > p.expiresLedger)
      return no('POLICY_EXPIRED', 'Politikanın süresi dolmuş');
    if (counted > p.perTxCap)
      return no('PER_TX_CAP_EXCEEDED', `Tek işlem tavanı ${usdcAmount(p.perTxCap)}; bu işlem ${usdcAmount(counted)}`);
    if (spent + counted > p.dailyCap)
      return no(
        'DAILY_CAP_EXCEEDED',
        `Günlük tavan ${usdcAmount(p.dailyCap)}; bugün ${usdcAmount(spent)} harcandı, bu işlem ${usdcAmount(counted)}`,
      );
    return { allowed: true, code: null, message: null, caps };
  }

  /**
   * Kotasyon: rota, fiyat etkisi, önerilen kayma koruması ve politika ön kararı.
   * `account` verilirse hesabın kuralları da uygulanır.
   */
  async quote(params: { side: Side; amountIn: bigint; slippageBps?: bigint; account?: string }) {
    const { side, amountIn } = params;
    if (amountIn <= 0n) throw new ReinkeyError('BAD_REQUEST', 'amountIn sıfırdan büyük olmalı');
    const { sell, buy, sellId, buyId } = this.assets(side);
    const q = await this.prices.quote();

    const [reserveIn, reserveOut] = side === 'USDC_XLM' ? [q.reserveUsdc, q.reserveXlm] : [q.reserveXlm, q.reserveUsdc];
    const amountOut = this.out(amountIn, reserveIn, reserveOut);
    if (amountOut <= 0n) throw new ReinkeyError('BAD_REQUEST', 'Tutar havuz için çok küçük');

    // Fiyatlar her zaman "1 XLM kaç USDC" biriminde, karşılaştırılabilsin diye.
    const execution = side === 'USDC_XLM' ? (amountIn * SCALE) / amountOut : (amountOut * SCALE) / amountIn;
    const mid = q.mid;
    const impactBps = mid > 0n ? Number(((execution > mid ? execution - mid : mid - execution) * 10_000n) / mid) : 0;

    const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    const minOut = (amountOut * (10_000n - slippageBps)) / 10_000n;

    // İkinci fiyat kaynağı: kredi havuzunun ihtiyatlı fiyatı (Reflector oracle ile havuzun düşüğü).
    const conservative = this.cfg.creditPoolId
      ? await this.chain
          .readContract<bigint | { value: bigint }>(this.cfg.creditPoolId, 'price')
          .then((v) => BigInt(typeof v === 'object' && v && 'value' in v ? v.value : v))
          .catch(() => null)
      : null;

    return {
      pair: 'XLM/USDC',
      side,
      sell: { asset: sell, contract: sellId },
      buy: { asset: buy, contract: buyId },
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      minOut: minOut.toString(),
      slippageBps: Number(slippageBps),
      price: {
        /** Bu işlemin gerçekleşeceği fiyat (1 XLM = ? USDC). */
        execution: execution.toString(),
        /** Havuzun anlık orta fiyatı. */
        pool: mid.toString(),
        /** Reflector oracle ile havuzun DÜŞÜĞÜ; kredi havuzu bunu kullanır. */
        conservative: conservative === null ? null : conservative.toString(),
        impactBps,
      },
      liquidity: {
        source: 'soroswap',
        pair: q.pair,
        reserveUsdc: q.reserveUsdc.toString(),
        reserveXlm: q.reserveXlm.toString(),
        ledger: q.ledger,
      },
      /** Ajanın kendi anahtarıyla imzalayacağı çağrı. Fonlar hiçbir aşamada bize geçmez. */
      call: {
        contract: this.cfg.dexRouterId ?? null,
        method: 'swap_exact_tokens_for_tokens',
        args: {
          amount_in: amountIn.toString(),
          amount_out_min: minOut.toString(),
          path: [sellId, buyId],
          to: params.account ?? '(ajanın hesabı)',
          deadline: '(now + 600s)',
        },
      },
      policy: await this.verdict(params.account, side, amountIn, minOut),
    };
  }
}
