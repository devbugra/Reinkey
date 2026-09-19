import { Injectable } from '@nestjs/common';
import { ReinkeyError } from '../common/errors';
import type { MeterContext } from './meter';

/**
 * `exact` şeması (BACKEND.md §7, öncelik DÜŞÜK). Henüz etkin değil:
 * 402 yanıtı yalnızca `channel` ilan eder, gelen `exact` yükleri reddedilir.
 * Etkinleştirmek için @x402/stellar `ExactStellarScheme` süreç içinde bağlanacak.
 */
@Injectable()
export class ExactVerifier {
  readonly enabled = false;

  // eslint-disable-next-line @typescript-eslint/require-await
  async verify(_payload: unknown, _ctx: MeterContext): Promise<object> {
    throw new ReinkeyError(
      'PAYMENT_MALFORMED',
      "exact henüz etkin değil; 'channel' şemasını kullanın",
      'facilitator',
    );
  }
}
