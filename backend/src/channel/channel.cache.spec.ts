import type { EventSink, EventType } from '../audit/events.service';
import { MockChain } from '../chain/testing/mock.chain';
import { ChannelStore } from './channel.cache';

describe('ChannelStore: kendi tahsilatımız panele bir kez yayınlanır', () => {
  function setup() {
    const chain = new MockChain(
      'Test SDF Network ; September 2015',
      'CCHANNEL',
      'CUSDC',
    );
    const emitted: EventType[] = [];
    const events: EventSink = {
      emit: (type, source) => {
        emitted.push(type);
        return { id: String(emitted.length), type, source, ts: '' };
      },
    };
    const store = new ChannelStore(chain, events);
    const id = chain.openChannel({
      payer: 'CPAYER',
      payee: 'GSELLER',
      deposit: 100_000n,
      voucherKey: '00'.repeat(32),
      expiryInLedgers: 17_280,
    }).channel.id;
    const claimed = (tx: string) =>
      store.applyChainEvent({
        type: 'channel.claimed',
        channelId: id,
        tx,
        ledger: 1,
        data: { cumulative: '50000', amount: '50000' },
      });
    const count = () => emitted.filter((t) => t === 'channel.claimed').length;
    return { store, id, claimed, count };
  }

  it('izleyici olayı tx hash dönmeden ÖNCE görürse susturur', async () => {
    const { store, id, claimed, count } = setup();
    store.beginOwnClaim(id);
    await claimed('aa');
    store.rememberOwnClaim('aa');
    store.endOwnClaim(id);
    expect(count()).toBe(0);
  });

  it('izleyici olayı tx hash döndükten SONRA görürse susturur', async () => {
    const { store, id, claimed, count } = setup();
    store.beginOwnClaim(id);
    store.rememberOwnClaim('bb');
    store.endOwnClaim(id);
    await claimed('bb');
    expect(count()).toBe(0);
  });

  it('başkasının tahsilatı yayınlanır', async () => {
    const { claimed, count } = setup();
    await claimed('cc');
    expect(count()).toBe(1);
  });
});
