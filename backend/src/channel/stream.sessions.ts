import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ReinkeyError } from '../common/errors';
import { ChannelVerifier, type ChannelReceipt } from './channel.verifier';

export type SliceOutcome =
  | { kind: 'paid'; receipt: ChannelReceipt }
  | { kind: 'timeout' }
  | { kind: 'exhausted' }
  | { kind: 'frozen' }
  | { kind: 'aborted' };

interface Session {
  streamId: string;
  channelId: bigint;
  sliceCost: bigint;
  resource: string;
  payTo: string;
  unit: string;
  /** Bu akışta kabul edilen TÜM kuponların delta toplamı (ilk dilim dahil). */
  charged: bigint;
  vouchers: number;
  /** Beklenmeden önce ödenmiş dilimler. */
  prepaid: ChannelReceipt[];
  waiter?: (o: SliceOutcome) => void;
  timer?: NodeJS.Timeout;
}

/**
 * Akışlı yanıtlar için kısa ömürlü oturumlar (`streamId` → beklenen ödeme).
 * Yalnızca bellekte; süreç yeniden başlarsa açık akışlar zaten kopar.
 */
@Injectable()
export class StreamSessions {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly verifier: ChannelVerifier) {}

  open(p: {
    channelId: bigint;
    sliceCost: bigint;
    resource: string;
    payTo: string;
    unit: string;
    /** İsteği açan ilk kuponun deltası. */
    initialCharge: bigint;
  }): string {
    const streamId = randomUUID();
    const { initialCharge, ...rest } = p;
    this.sessions.set(streamId, {
      streamId,
      prepaid: [],
      charged: initialCharge,
      vouchers: 1,
      ...rest,
    });
    return streamId;
  }

  /**
   * Akışın ödeme toplamı. `charged`, kabul edilen kuponların delta toplamıdır:
   * beklenmeden önce gelmiş (prepaid) ve henüz tüketilmemiş dilimler de dahildir,
   * çünkü kanalın kümülatifi onlarla birlikte ilerlemiştir.
   */
  totals(streamId: string): { charged: bigint; vouchers: number } {
    const s = this.sessions.get(streamId);
    return s
      ? { charged: s.charged, vouchers: s.vouchers }
      : { charged: 0n, vouchers: 0 };
  }

  /**
   * İstemci bağlantıyı kesti: bekleyen dilimi uyandırır ama oturumu SİLMEZ.
   * Akış döngüsü `stream.ended` için toplamı okuduktan sonra `close` çağırır;
   * burada silinirse olay `charged: 0` ile yayınlanır.
   */
  abort(streamId: string) {
    const s = this.sessions.get(streamId);
    if (!s) return;
    clearTimeout(s.timer);
    s.waiter?.({ kind: 'aborted' });
  }

  close(streamId: string) {
    const s = this.sessions.get(streamId);
    if (!s) return;
    clearTimeout(s.timer);
    s.waiter?.({ kind: 'aborted' });
    this.sessions.delete(streamId);
  }

  /** Bir sonraki dilimin ödenmesini bekler. */
  waitForSlice(streamId: string, timeoutMs: number): Promise<SliceOutcome> {
    const s = this.sessions.get(streamId);
    if (!s) return Promise.resolve({ kind: 'aborted' });
    const early = s.prepaid.shift();
    if (early) return Promise.resolve({ kind: 'paid', receipt: early });
    return new Promise((resolve) => {
      s.waiter = (o) => {
        clearTimeout(s.timer);
        s.waiter = undefined;
        resolve(o);
      };
      s.timer = setTimeout(() => s.waiter?.({ kind: 'timeout' }), timeoutMs);
    });
  }

  /** `POST /channels/:id/voucher`: kuponu doğrular ve bekleyen akışı sürdürür. */
  async submit(
    channelId: bigint,
    streamId: string,
    cumulative: bigint,
    signature: string,
  ): Promise<ChannelReceipt> {
    const s = this.sessions.get(streamId);
    if (!s)
      throw new ReinkeyError(
        'STREAM_NOT_FOUND',
        `Akış ${streamId} bulunamadı ya da bitti`,
      );
    if (s.channelId !== channelId)
      throw new ReinkeyError(
        'BAD_REQUEST',
        'Kupon bu akışın kanalına ait değil',
      );
    try {
      const receipt = await this.verifier.accept(
        { channelId, cumulative, signature: signature.toLowerCase() },
        {
          price: s.sliceCost,
          payTo: s.payTo,
          resource: s.resource,
          unit: s.unit,
        },
      );
      s.charged += BigInt(receipt.delta);
      s.vouchers++;
      if (s.waiter) s.waiter({ kind: 'paid', receipt });
      else s.prepaid.push(receipt);
      return receipt;
    } catch (e) {
      if (e instanceof ReinkeyError && e.code === 'CHANNEL_EXHAUSTED')
        s.waiter?.({ kind: 'exhausted' });
      if (e instanceof ReinkeyError && e.code === 'ACCOUNT_FROZEN')
        s.waiter?.({ kind: 'frozen' });
      throw e;
    }
  }
}
