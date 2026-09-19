import { Inject, Injectable } from '@nestjs/common';
import { CHAIN, type ChainPort } from '../chain/chain.port';

const REFRESH_MS = 5_000;

/**
 * Hesapların dondurulma durumu (zincirdeki `is_frozen`). Kupon doğrulamanın sıcak
 * yolunda zincire gidilmez: önbellekteki değer okunur, bayatsa arka planda tazelenir.
 * Sahip hesabı panelden dondurduğunda değer anında yazılır.
 */
@Injectable()
export class FrozenRegistry {
  private readonly state = new Map<string, { frozen: boolean; at: number }>();
  private readonly loading = new Set<string>();

  constructor(@Inject(CHAIN) private readonly chain: ChainPort) {}

  set(account: string, frozen: boolean) {
    this.state.set(account, { frozen, at: Date.now() });
  }

  isFrozen(account: string): boolean {
    if (!account.startsWith('C')) return false;
    const s = this.state.get(account);
    if (!s || Date.now() - s.at > REFRESH_MS) this.refresh(account);
    return s?.frozen ?? false;
  }

  private refresh(account: string) {
    if (this.loading.has(account)) return;
    this.loading.add(account);
    void this.chain
      .getAccount(account)
      .then((a) => a && this.set(account, a.frozen))
      .catch(() => undefined)
      .finally(() => this.loading.delete(account));
  }
}
