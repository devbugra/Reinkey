// Tüm zincir erişimi bu arayüzün arkasında (BACKEND.md §4).

export interface ChannelState {
  id: bigint;
  payer: string; // C… (Reinkey Account) ya da G…
  payee: string;
  asset: string; // USDC SAC kontrat kimliği
  deposit: bigint;
  claimed: bigint;
  voucherKey: string; // hex
  expiryLedger: number;
  open: boolean;
}

export interface AccountState {
  address: string;
  policy: {
    agentKey: string;
    perTxCap: bigint;
    dailyCap: bigint;
    payees: string[];
    channel: string;
    expiresLedger: number;
    /** Politikanın varlığı (USDC SAC). */
    asset?: string;
    dexRouter: string | null;
    dexFactory: string | null;
    /** İzinli (satılan, alınan) varlık çiftleri; okunur biçimde: "USDC→XLM". */
    pairs: string[];
    controller: string | null;
  };
  spentToday: bigint;
  day: number;
  frozen: boolean;
  balance: bigint; // USDC
  balanceXlm: bigint;
}

/** DEX havuzunun anlık rezervleri (taban birim, 7 ondalık). */
export interface PairReserves {
  pair: string;
  reserveUsdc: bigint;
  reserveXlm: bigint;
  ledger: number;
}

export interface ChainEvent {
  type:
    | 'channel.opened'
    | 'channel.topped_up'
    | 'channel.claimed'
    | 'channel.closed';
  channelId: bigint;
  data: Record<string, string>;
  tx: string;
  ledger: number;
}

export interface ChainPort {
  readonly networkPassphrase: string;
  readonly channelContractId: string;
  latestLedger(): Promise<number>;
  getChannel(id: bigint): Promise<ChannelState | null>;
  claim(
    id: bigint,
    cumulative: bigint,
    signatureHex: string,
  ): Promise<{ tx: string }>;
  getAccount(address: string): Promise<AccountState | null>;
  getTransactionStatus(hash: string): Promise<{
    status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
    contractErrorCode?: number;
  }>;
  /** Makbuzları imzalayan ed25519 anahtarının açık adresi (claim'i gönderen anahtarla aynı). */
  readonly signerAddress: string;
  /** Facilitator anahtarıyla ham bayt imzalar (imzalı makbuz). */
  signMessage(data: Buffer): Buffer;
  /**
   * Herhangi bir kontratta salt okunur çağrı (simülasyon; zincire yazmaz, ücret yok).
   * Float (kredi havuzu) görünümü bununla okunur; argümanlar kontrat spesifikasyonundaki adlarla verilir.
   */
  readContract<T>(
    contractId: string,
    method: string,
    args?: Record<string, unknown>,
  ): Promise<T>;
  /** Soroswap USDC/XLM havuzunun rezervleri. Okunamazsa hata fırlatır. */
  getPairReserves(): Promise<PairReserves>;
  /** Sahip imzasıyla hesabı dondurur / çözer. */
  setFrozen(
    account: string,
    frozen: boolean,
    ownerSecret: string,
  ): Promise<{ tx: string }>;
  pollEvents(
    fromLedger: number,
  ): Promise<{ events: ChainEvent[]; latestLedger: number }>;
}

/** DI belirteci. */
export const CHAIN = Symbol('CHAIN');
