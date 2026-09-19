import { Keypair } from '@stellar/stellar-sdk';
import { randomBytes } from 'node:crypto';
import type { EventSink, EventType } from '../audit/events.service';
import { MockChain } from '../chain/testing/mock.chain';
import { ReinkeyError } from '../common/errors';
import { loadConfig, type AppConfig } from '../config/config';
import { ChannelStore } from './channel.cache';
import { ChannelVerifier, type VerifyContext } from './channel.verifier';
import { ClaimService } from './claim.scheduler';
import { publicKeyFromSeed, signVoucher } from './voucher';

const PRICE = 5000n;

function setup(overrides: Partial<AppConfig> = {}) {
  const cfg: AppConfig = {
    // Zincire gidilmez (MockChain); anahtar yalnızca config doğrulamasını geçmek için üretilir.
    ...loadConfig({
      DATABASE_URL: 'postgresql://x',
      CHAIN_MODE: 'stellar',
      FACILITATOR_SECRET: Keypair.random().secret(),
    }),
    ...overrides,
  };
  const chain = new MockChain(
    cfg.networkPassphrase,
    cfg.channelContractId,
    cfg.usdcContractId,
  );
  const emitted: { type: EventType; data: Record<string, unknown> }[] = [];
  const events: EventSink = {
    emit: (type, source, data) => {
      emitted.push({ type, data });
      return { id: String(emitted.length), type, source, ts: '' };
    },
  };
  const store = new ChannelStore(chain, events);
  let ledger = 1_000_000;
  const ledgerSource = { current: () => ledger };
  const verifier = new ChannelVerifier(cfg, store, ledgerSource, events);
  const claims = new ClaimService(cfg, chain, store, ledgerSource, events);

  const seed = randomBytes(32);
  const open = (
    p: {
      deposit?: bigint;
      payee?: string;
      asset?: string;
      expiryInLedgers?: number;
    } = {},
  ) =>
    chain.openChannel({
      payer: 'CPAYER',
      payee: p.payee ?? cfg.sellerPayTo,
      asset: p.asset,
      deposit: p.deposit ?? 100_000n,
      voucherKey: publicKeyFromSeed(seed),
      expiryInLedgers: p.expiryInLedgers ?? 17_280,
    }).channel.id;

  const sign = (id: bigint, cumulative: bigint, key = seed) =>
    signVoucher(
      {
        networkPassphrase: cfg.networkPassphrase,
        contractId: cfg.channelContractId,
        channelId: id,
        cumulative,
      },
      key,
    );
  const payload = (
    id: bigint,
    cumulative: bigint,
    signature = sign(id, cumulative),
  ) => ({
    x402Version: 2,
    scheme: 'channel',
    network: cfg.network,
    payload: {
      channelId: id.toString(),
      cumulative: cumulative.toString(),
      signature,
    },
  });
  const ctx: VerifyContext = {
    price: PRICE,
    payTo: cfg.sellerPayTo,
    resource: '/demo/book',
    unit: 'request',
  };

  return {
    cfg,
    chain,
    store,
    verifier,
    claims,
    emitted,
    open,
    sign,
    payload,
    ctx,
    setLedger: (n: number) => (ledger = n),
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    if (e instanceof ReinkeyError) return e.code;
    throw e;
  }
}

describe('ChannelVerifier', () => {
  it('geçerli kuponu kabul eder, makbuz ve olay üretir', async () => {
    const t = setup();
    const id = t.open();
    const r = await t.verifier.verify(t.payload(id, PRICE), t.ctx);
    expect(r).toMatchObject({
      scheme: 'channel',
      channelId: String(id),
      accepted: '5000',
      delta: '5000',
      remaining: '95000',
    });
    expect(t.emitted.map((e) => e.type)).toEqual([
      'channel.opened',
      'voucher.accepted',
    ]);
    expect(t.store.peek(id)!.lastAccepted).toBe(PRICE);
  });

  it('önbellekteki kanal için doğrulama < 10 ms', async () => {
    const t = setup();
    const id = t.open({ deposit: 1_000_000n });
    await t.verifier.verify(t.payload(id, PRICE), t.ctx);
    const payloads = Array.from({ length: 50 }, (_, i) =>
      t.payload(id, PRICE * BigInt(i + 2)),
    );
    const start = performance.now();
    for (const p of payloads) await t.verifier.verify(p, t.ctx);
    expect((performance.now() - start) / 50).toBeLessThan(10);
  });

  it('PAYMENT_MALFORMED', async () => {
    const t = setup();
    expect(await code(t.verifier.verify({ foo: 1 }, t.ctx))).toBe(
      'PAYMENT_MALFORMED',
    );
    expect(
      await code(
        t.verifier.verify({ ...t.payload(1n, PRICE), scheme: 'exact' }, t.ctx),
      ),
    ).toBe('PAYMENT_MALFORMED');
    expect(
      await code(
        t.verifier.verify(
          { ...t.payload(1n, PRICE), network: 'stellar:pubnet' },
          t.ctx,
        ),
      ),
    ).toBe('PAYMENT_MALFORMED');
  });

  it('v2 `accepted` biçimini de kabul eder', async () => {
    const t = setup();
    const id = t.open();
    const { scheme, network, ...rest } = t.payload(id, PRICE);
    expect(
      await code(
        t.verifier.verify({ ...rest, accepted: { scheme, network } }, t.ctx),
      ),
    ).toBe('OK');
  });

  it('CHANNEL_NOT_FOUND', async () => {
    const t = setup();
    expect(await code(t.verifier.verify(t.payload(99n, PRICE), t.ctx))).toBe(
      'CHANNEL_NOT_FOUND',
    );
  });

  it('CHANNEL_CLOSED', async () => {
    const t = setup();
    const id = t.open();
    await t.store.get(id);
    t.store.peek(id)!.open = false;
    expect(await code(t.verifier.verify(t.payload(id, PRICE), t.ctx))).toBe(
      'CHANNEL_CLOSED',
    );
  });

  it('WRONG_PAYEE', async () => {
    const t = setup();
    const id = t.open({ payee: 'GSOMEONEELSE' });
    expect(await code(t.verifier.verify(t.payload(id, PRICE), t.ctx))).toBe(
      'WRONG_PAYEE',
    );
  });

  it('WRONG_ASSET', async () => {
    const t = setup();
    const id = t.open({ asset: 'CNOTUSDC' });
    expect(await code(t.verifier.verify(t.payload(id, PRICE), t.ctx))).toBe(
      'WRONG_ASSET',
    );
  });

  it('CHANNEL_EXPIRING', async () => {
    const t = setup();
    const id = t.open({ expiryInLedgers: 100 });
    t.setLedger(1_000_000 + 100 - 59);
    expect(await code(t.verifier.verify(t.payload(id, PRICE), t.ctx))).toBe(
      'CHANNEL_EXPIRING',
    );
  });

  it('VOUCHER_BAD_SIGNATURE', async () => {
    const t = setup();
    const id = t.open();
    const wrongKey = t.sign(id, PRICE, randomBytes(32));
    expect(
      await code(t.verifier.verify(t.payload(id, PRICE, wrongKey), t.ctx)),
    ).toBe('VOUCHER_BAD_SIGNATURE');
    // Başka tutarın imzası
    expect(
      await code(
        t.verifier.verify(t.payload(id, PRICE, t.sign(id, PRICE * 2n)), t.ctx),
      ),
    ).toBe('VOUCHER_BAD_SIGNATURE');
  });

  it('VOUCHER_NOT_INCREASING', async () => {
    const t = setup();
    const id = t.open();
    await t.verifier.verify(t.payload(id, PRICE * 2n), t.ctx);
    expect(
      await code(t.verifier.verify(t.payload(id, PRICE * 2n), t.ctx)),
    ).toBe('VOUCHER_NOT_INCREASING');
    expect(await code(t.verifier.verify(t.payload(id, PRICE), t.ctx))).toBe(
      'VOUCHER_NOT_INCREASING',
    );
  });

  it('VOUCHER_UNDERPAID', async () => {
    const t = setup();
    const id = t.open();
    expect(
      await code(t.verifier.verify(t.payload(id, PRICE - 1n), t.ctx)),
    ).toBe('VOUCHER_UNDERPAID');
  });

  it('CHANNEL_EXHAUSTED', async () => {
    const t = setup();
    const id = t.open({ deposit: 7000n });
    await t.verifier.verify(t.payload(id, PRICE), t.ctx);
    expect(
      await code(t.verifier.verify(t.payload(id, PRICE * 2n), t.ctx)),
    ).toBe('CHANNEL_EXHAUSTED');
  });

  it('RATE_LIMITED', async () => {
    const t = setup({ rateLimitPerMinute: 2 });
    const id = t.open();
    await t.verifier.verify(t.payload(id, PRICE), t.ctx);
    await t.verifier.verify(t.payload(id, PRICE * 2n), t.ctx);
    expect(
      await code(t.verifier.verify(t.payload(id, PRICE * 3n), t.ctx)),
    ).toBe('RATE_LIMITED');
  });

  it('her red voucher.rejected olayı yayınlar', async () => {
    const t = setup();
    await code(t.verifier.verify(t.payload(99n, PRICE), t.ctx));
    const e = t.emitted.find((x) => x.type === 'voucher.rejected')!;
    expect(e.data).toMatchObject({
      code: 'CHANNEL_NOT_FOUND',
      resource: '/demo/book',
      channelId: 99n,
    });
  });

  it('yarış: aynı kupon eşzamanlı iki kez → biri kabul, biri red', async () => {
    const t = setup();
    const id = t.open();
    const p = t.payload(id, PRICE);
    const results = await Promise.all([
      code(t.verifier.verify(p, t.ctx)),
      code(t.verifier.verify(p, t.ctx)),
    ]);
    expect(results.sort()).toEqual(['OK', 'VOUCHER_NOT_INCREASING']);
  });

  it('yarış: soğuk önbellekte 20 eşzamanlı aynı kupon → tek kabul', async () => {
    const t = setup();
    const id = t.open();
    const p = t.payload(id, PRICE);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => code(t.verifier.verify(p, t.ctx))),
    );
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
  });
});

describe('ClaimService', () => {
  it('eşik aşılınca tahsil eder; vouchersCovered doğru', async () => {
    const t = setup({ claimThreshold: 20_000n });
    const id = t.open();
    for (let i = 1n; i <= 3n; i++)
      await t.verifier.verify(t.payload(id, PRICE * i), t.ctx);
    expect(await t.claims.tick()).toEqual([]); // 15000 < 20000
    await t.verifier.verify(t.payload(id, PRICE * 4n), t.ctx);
    const [r] = await t.claims.tick();
    expect(r).toMatchObject({
      channelId: String(id),
      amount: '20000',
      vouchersCovered: 4,
    });
    expect((await t.chain.getChannel(id))!.claimed).toBe(20_000n);
    expect(t.store.peek(id)!.vouchersSinceClaim).toBe(0);
    const ev = t.emitted.find((e) => e.type === 'channel.claimed')!;
    expect(ev.data).toMatchObject({ amount: 20_000n, vouchersCovered: 4 });
  });

  it('süre dolmak üzereyse eşik altında da tahsil eder', async () => {
    const t = setup();
    const id = t.open({ expiryInLedgers: 1000 });
    await t.verifier.verify(t.payload(id, PRICE), t.ctx);
    expect(await t.claims.tick()).toEqual([]);
    t.setLedger(1_000_000 + 1000 - 120);
    const [r] = await t.claims.tick();
    expect(r).toMatchObject({ amount: '5000', vouchersCovered: 1 });
  });

  it('tahsil edilecek kupon yoksa null', async () => {
    const t = setup();
    const id = t.open();
    expect(await t.claims.claim(id)).toBeNull();
  });
});
