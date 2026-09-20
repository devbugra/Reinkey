import type { AccountState, ChainPort, PairReserves } from '../chain/chain.port';
import type { AppConfig } from '../config/config';
import { PriceService } from '../demo/price.service';
import { DexService } from './dex.service';

/**
 * Politika ön kararının kurallarının, kontratın kurallarıyla aynı olduğunu doğrular
 * (contracts/reinkey-account/src/lib.rs → check_swap ve tavanlar). Ön karar yanılırsa
 * ajan zincire gidip boşuna ücret öder; bu yüzden red yolları tek tek denenir.
 */
const USDC = 'CUSDC';
const XLM = 'CXLM';
const ACCOUNT = 'CACCOUNT';

const RESERVES: PairReserves = {
  pair: 'XLM_USDC',
  // 1 XLM ≈ 0,1338 USDC
  reserveUsdc: 5_175_899_000n,
  reserveXlm: 38_680_198_532n,
  ledger: 1000,
};

function policy(over: Partial<AccountState['policy']> = {}): AccountState['policy'] {
  return {
    agentKey: 'ff'.repeat(32),
    perTxCap: 10_000_000n, // 1 USDC
    dailyCap: 50_000_000n, // 5 USDC
    payees: ['GSELLER'],
    channel: 'CCHANNEL',
    expiresLedger: 100_000,
    asset: USDC,
    dexRouter: 'CROUTER',
    dexFactory: 'CFACTORY',
    pairs: ['USDC→XLM', 'XLM→USDC'],
    controller: null,
    ...over,
  };
}

function setup(
  account?: (Omit<Partial<AccountState>, 'policy'> & { policy?: Partial<AccountState['policy']> }) | null,
) {
  const cfg = {
    usdcContractId: USDC,
    xlmContractId: XLM,
    dexRouterId: 'CROUTER',
    creditPoolId: undefined,
  } as unknown as AppConfig;
  const chain = {
    latestLedger: async () => 1000,
    getAccount: async () =>
      account === null
        ? null
        : ({
            address: ACCOUNT,
            policy: policy(account?.policy),
            spentToday: account?.spentToday ?? 0n,
            day: 1,
            frozen: account?.frozen ?? false,
            balance: 100_000_000n,
          } as AccountState),
    getPairReserves: async () => RESERVES,
    readContract: async () => {
      throw new Error('kullanılmaz');
    },
  } as unknown as ChainPort;
  return new DexService(cfg, chain, new PriceService(chain));
}

describe('DexService.quote', () => {
  it('sabit çarpım eğrisinden çıktı, fiyat etkisi ve kayma koruması hesaplar', async () => {
    const q = await setup().quote({ side: 'USDC_XLM', amountIn: 5_000_000n });
    // 0,5 USDC ≈ 3,72 XLM; ücret dahil.
    expect(BigInt(q.amountOut)).toBeGreaterThan(37_000_000n);
    expect(BigInt(q.amountOut)).toBeLessThan(37_500_000n);
    // Varsayılan %1 kayma: minOut çıktının %99'u.
    expect(BigInt(q.minOut)).toBe((BigInt(q.amountOut) * 9_900n) / 10_000n);
    // Küçük işlemde fiyat etkisi küçük olmalı (havuz ücreti kadar).
    expect(q.price.impactBps).toBeLessThan(100);
    expect(q.liquidity.source).toBe('soroswap');
  });

  it('büyük işlemde fiyat etkisi belirgin şekilde artar', async () => {
    const dex = setup();
    const small = await dex.quote({ side: 'USDC_XLM', amountIn: 1_000_000n });
    const big = await dex.quote({ side: 'USDC_XLM', amountIn: 500_000_000n });
    expect(big.price.impactBps).toBeGreaterThan(small.price.impactBps * 5);
  });

  it('hesap verilmezse politika uygulanmaz', async () => {
    const q = await setup().quote({ side: 'USDC_XLM', amountIn: 5_000_000n });
    expect(q.policy).toEqual({ allowed: true, code: null, message: null, caps: null });
  });

  it('politika içindeki takası kabul eder ve tavanları raporlar', async () => {
    const q = await setup({ spentToday: 20_000_000n }).quote({
      side: 'USDC_XLM',
      amountIn: 5_000_000n,
      account: ACCOUNT,
    });
    expect(q.policy.allowed).toBe(true);
    expect(q.policy.caps).toMatchObject({
      perTxCap: '10000000',
      dailyCap: '50000000',
      spentToday: '20000000',
      remainingToday: '30000000',
      counted: '5000000',
    });
  });

  it('tek işlem tavanını aşan takası PER_TX_CAP_EXCEEDED ile reddeder', async () => {
    const q = await setup().quote({ side: 'USDC_XLM', amountIn: 20_000_000n, account: ACCOUNT });
    expect(q.policy).toMatchObject({ allowed: false, code: 'PER_TX_CAP_EXCEEDED' });
  });

  it('günlük tavanı aşan takası DAILY_CAP_EXCEEDED ile reddeder', async () => {
    const q = await setup({ spentToday: 48_000_000n }).quote({
      side: 'USDC_XLM',
      amountIn: 5_000_000n,
      account: ACCOUNT,
    });
    expect(q.policy).toMatchObject({ allowed: false, code: 'DAILY_CAP_EXCEEDED' });
  });

  it('XLM satarken tavanlara sayılmaz: politikanın varlığı USDC', async () => {
    const q = await setup().quote({ side: 'XLM_USDC', amountIn: 200_000_000n, account: ACCOUNT });
    expect(q.policy.allowed).toBe(true);
    expect(q.policy.caps?.counted).toBe('0');
  });

  it('izinli olmayan çifti PAIR_NOT_ALLOWED ile reddeder', async () => {
    const q = await setup({ policy: { pairs: ['XLM→USDC'] } }).quote({
      side: 'USDC_XLM',
      amountIn: 1_000_000n,
      account: ACCOUNT,
    });
    expect(q.policy).toMatchObject({ allowed: false, code: 'PAIR_NOT_ALLOWED' });
  });

  it('kayma koruması sıfırlanırsa SLIPPAGE_UNBOUNDED ile reddeder', async () => {
    const q = await setup().quote({
      side: 'USDC_XLM',
      amountIn: 1_000_000n,
      slippageBps: 10_000n,
      account: ACCOUNT,
    });
    expect(BigInt(q.minOut)).toBe(0n);
    expect(q.policy).toMatchObject({ allowed: false, code: 'SLIPPAGE_UNBOUNDED' });
  });

  it('dondurulmuş hesabı ACCOUNT_FROZEN ile reddeder', async () => {
    const q = await setup({ frozen: true }).quote({ side: 'USDC_XLM', amountIn: 1_000_000n, account: ACCOUNT });
    expect(q.policy).toMatchObject({ allowed: false, code: 'ACCOUNT_FROZEN' });
  });

  it('süresi dolmuş politikayı POLICY_EXPIRED ile reddeder', async () => {
    const q = await setup({ policy: { expiresLedger: 10 } }).quote({
      side: 'USDC_XLM',
      amountIn: 1_000_000n,
      account: ACCOUNT,
    });
    expect(q.policy).toMatchObject({ allowed: false, code: 'POLICY_EXPIRED' });
  });

  it('router tanımsızsa takas kapalıdır', async () => {
    const q = await setup({ policy: { dexRouter: null } }).quote({
      side: 'USDC_XLM',
      amountIn: 1_000_000n,
      account: ACCOUNT,
    });
    expect(q.policy).toMatchObject({ allowed: false, code: 'CONTEXT_NOT_ALLOWED' });
  });

  it('zincirde olmayan hesabı açıkça söyler', async () => {
    const q = await setup(null).quote({ side: 'USDC_XLM', amountIn: 1_000_000n, account: ACCOUNT });
    expect(q.policy).toMatchObject({ allowed: false, code: 'NOT_FOUND' });
  });
});
