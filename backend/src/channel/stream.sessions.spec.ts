import type { ChannelVerifier } from './channel.verifier';
import { StreamSessions } from './stream.sessions';

describe('StreamSessions', () => {
  const open = (s: StreamSessions) =>
    s.open({
      channelId: 1n,
      sliceCost: 10_000n,
      resource: 'r',
      payTo: 'G',
      unit: 'second',
      initialCharge: 10_000n,
    });

  it('abort bekleyeni uyandırır ama toplamı korur; close sonrası toplam sıfırdır', async () => {
    const s = new StreamSessions({} as ChannelVerifier);
    const id = open(s);
    const waiting = s.waitForSlice(id, 60_000);
    s.abort(id);
    await expect(waiting).resolves.toEqual({ kind: 'aborted' });
    // İstemci koptuktan sonra da stream.ended doğru tutarı okuyabilmeli.
    expect(s.totals(id)).toEqual({ charged: 10_000n, vouchers: 1 });
    s.close(id);
    expect(s.totals(id)).toEqual({ charged: 0n, vouchers: 0 });
  });
});
