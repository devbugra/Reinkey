import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

// Ortam değişkenlerinin tek doğrulama noktası. Tutarlar bigint'e çevrilir.

const big = z
  .string()
  .regex(/^\d+$/, 'negatif olmayan tamsayı olmalı')
  .transform((v) => BigInt(v));
const int = z.coerce.number().int().nonnegative();
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  PORT: int.default(3000),
  PUBLIC_URL: optional,
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001,http://localhost:3002'),
  DATABASE_URL: z.string().min(1),

  // Sahte zincir modu kaldırıldı: backend yalnızca gerçek Stellar ağıyla çalışır.
  CHAIN_MODE: z
    .string()
    .default('stellar')
    .refine((v) => v === 'stellar', {
      message:
        "yalnızca 'stellar' desteklenir (mock modu kaldırıldı; MockChain yalnızca birim testlerinde)",
    }),
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .default('Test SDF Network ; September 2015'),
  X402_NETWORK: z.string().default('stellar:testnet'),

  CHANNEL_CONTRACT_ID: optional,
  USDC_CONTRACT_ID: optional,
  FACILITATOR_SECRET: optional,
  SELLER_PAY_TO: optional,

  CLAIM_THRESHOLD: big.default(1_000_000n),
  CLAIM_INTERVAL_SECONDS: int.default(30),
  // Herkese açık elle tahsilat: taban tutar ve kanal başına bekleme süresi.
  MANUAL_CLAIM_MIN: big.default(1000n),
  MANUAL_CLAIM_COOLDOWN_SECONDS: int.default(30),
  CLAIM_EXPIRY_MARGIN_LEDGERS: int.default(120),
  VOUCHER_EXPIRY_SAFETY_LEDGERS: int.default(60),
  RATE_LIMIT_PER_MINUTE: int.default(1200),
  // IP başına: genel tavan ödeme yolunu da kapsar (geniş); dar tavan sunucuya
  // zincir ücreti ödeten uçlar içindir. 0 = kapalı.
  IP_RATE_LIMIT_PER_MINUTE: int.default(3000),
  IP_COSTLY_LIMIT_PER_MINUTE: int.default(30),
  /** Aynı IP'den en çok kaç açık SSE bağlantısı. */
  SSE_MAX_PER_IP: int.default(10),
  /** Verilirse örnek akış kontrolleri `x-demo-key` başlığı ister. */
  DEMO_CONTROL_KEY: optional,
  NODE_ENV: optional,
  /** Render'ın servise verdiği dış adres; PUBLIC_URL boşsa buradan türetilir. */
  RENDER_EXTERNAL_URL: optional,

  PRICE_BOOK_PER_REQUEST: big.default(5000n),
  PRICE_CHAT_PER_TOKEN: big.default(200n),
  PRICE_TICKER_PER_SECOND: big.default(1000n),
  TICKER_SLICE_SECONDS: int.default(10),

  // Boş bırakılırsa ../deployments/testnet.json dosyasından okunur.
  XLM_CONTRACT_ID: optional,
  DEX_PAIR_ID: optional,
  DEX_ROUTER_ID: optional,
  DEX_FACTORY_ID: optional,
  ACCOUNT_WASM_HASH: optional,
  DEPLOYMENT_FILE: z.string().default('../deployments/testnet.json'),

  // Panel demo kontrolleri: ajanı başlat, hesabı dondur.
  DEMO_CONTROLS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  DEMO_ACCOUNT_ID: optional,
  AGENT_OWNER_SECRET: optional,
  AGENTS_DIR: z.string().default('../agents'),
  // Reinkey Float (kredi havuzu). Boşsa deployments dosyasından okunur; o da yoksa Float kapalı.
  CREDIT_POOL_ID: optional,
  /** Havuzdan hat açılmış Reinkey hesapları, virgülle. */
  CREDIT_ACCOUNT_IDS: optional,
  /** Pozisyonu gösterilecek yatırımcı adresleri, virgülle. */
  FLOAT_INVESTORS: optional,
  CHAT_SLICE_TOKENS: int.default(50),

  ANTHROPIC_API_KEY: optional,
  /** Workspace'e bağlı olmayan (organizasyon) anahtarlar için zorunlu başlık. */
  ANTHROPIC_WORKSPACE_ID: optional,
  CHAT_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  CHAT_MODE: z.enum(['fallback', 'llm']).default('fallback'),
});

export type Env = z.infer<typeof schema>;

export interface AppConfig {
  port: number;
  publicUrl: string;
  corsOrigins: string[];
  databaseUrl: string;
  chainMode: 'stellar';
  rpcUrl: string;
  networkPassphrase: string;
  network: string;
  /** Ana ağ mı: friendbot, demo ajanı ve explorer adresi buna göre değişir. */
  isMainnet: boolean;
  explorerTxBase: string;
  channelContractId: string;
  usdcContractId: string;
  facilitatorSecret: string;
  sellerPayTo: string;
  claimThreshold: bigint;
  claimIntervalSeconds: number;
  manualClaimMin: bigint;
  manualClaimCooldownSeconds: number;
  claimExpiryMarginLedgers: number;
  voucherExpirySafetyLedgers: number;
  rateLimitPerMinute: number;
  ipRateLimitPerMinute: number;
  ipCostlyLimitPerMinute: number;
  sseMaxPerIp: number;
  demoControlKey?: string;
  /** Üretimde PUBLIC_URL localhost'ta kaldıysa: 402 yanıtları kullanılamaz adres taşır. */
  publicUrlSuspect: boolean;
  priceBookPerRequest: bigint;
  priceChatPerToken: bigint;
  priceTickerPerSecond: bigint;
  tickerSliceSeconds: number;
  xlmContractId?: string;
  dexPairId?: string;
  dexRouterId?: string;
  dexFactoryId?: string;
  /**
   * Dağıtılmış `reinkey-account` wasm'ının hash'i (hex). Konsol bununla
   * kullanıcının KENDİ hesabını tarayıcıdan kurar: aynı kod, kendi sahibi.
   */
  accountWasmHash?: string;
  demoControls: boolean;
  demoAccountId?: string;
  agentOwnerSecret?: string;
  agentsDir: string;
  creditPoolId?: string;
  creditAccountIds: string[];
  floatInvestors: string[];
  chatSliceTokens: number;
  anthropicApiKey?: string;
  anthropicWorkspaceId?: string;
  chatModel: string;
  chatMode: 'fallback' | 'llm';
}

const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Deploy çıktısı: .env'de boş bırakılan kimlikler buradan tamamlanır. */
function readDeployment(file: string): Record<string, string> {
  try {
    return existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues}`);
  }
  const e = parsed.data;
  const dep = readDeployment(e.DEPLOYMENT_FILE);
  const channelContractId = e.CHANNEL_CONTRACT_ID ?? dep.channelContractId;
  const usdcContractId = e.USDC_CONTRACT_ID ?? dep.usdcContractId;
  const sellerPayTo = e.SELLER_PAY_TO ?? dep.sellerPublicKey;

  // PUBLIC_URL 402 gövdesine, makbuzlara ve kataloğa girer. Üretimde unutulursa
  // Render'ın verdiği dış adrese düşülür; o da yoksa açılışta yüksek sesle uyarılır.
  const production = e.NODE_ENV === 'production';
  const explicit = e.PUBLIC_URL;
  const publicUrl = (
    explicit && !(production && /localhost|127\.0\.0\.1/.test(explicit))
      ? explicit
      : ((production ? e.RENDER_EXTERNAL_URL : undefined) ??
        explicit ??
        'http://localhost:3000')
  ).replace(/\/$/, '');

  const missing = Object.entries({
    CHANNEL_CONTRACT_ID: channelContractId,
    USDC_CONTRACT_ID: usdcContractId,
    FACILITATOR_SECRET: e.FACILITATOR_SECRET,
    SELLER_PAY_TO: sellerPayTo,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Şu değerler zorunlu (.env ya da ${e.DEPLOYMENT_FILE}): ${missing.join(', ')}`,
    );
  }

  return {
    port: e.PORT,
    publicUrl,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    databaseUrl: e.DATABASE_URL,
    chainMode: 'stellar',
    rpcUrl: e.STELLAR_RPC_URL,
    networkPassphrase: e.STELLAR_NETWORK_PASSPHRASE,
    network: e.X402_NETWORK,
    isMainnet: e.STELLAR_NETWORK_PASSPHRASE === MAINNET_PASSPHRASE,
    explorerTxBase: `https://stellar.expert/explorer/${
      e.STELLAR_NETWORK_PASSPHRASE === MAINNET_PASSPHRASE ? 'public' : 'testnet'
    }/tx/`,
    channelContractId: channelContractId!,
    usdcContractId: usdcContractId!,
    facilitatorSecret: e.FACILITATOR_SECRET!,
    sellerPayTo: sellerPayTo!,
    claimThreshold: e.CLAIM_THRESHOLD,
    claimIntervalSeconds: e.CLAIM_INTERVAL_SECONDS,
    manualClaimMin: e.MANUAL_CLAIM_MIN,
    manualClaimCooldownSeconds: e.MANUAL_CLAIM_COOLDOWN_SECONDS,
    claimExpiryMarginLedgers: e.CLAIM_EXPIRY_MARGIN_LEDGERS,
    voucherExpirySafetyLedgers: e.VOUCHER_EXPIRY_SAFETY_LEDGERS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    ipRateLimitPerMinute: e.IP_RATE_LIMIT_PER_MINUTE,
    ipCostlyLimitPerMinute: e.IP_COSTLY_LIMIT_PER_MINUTE,
    sseMaxPerIp: e.SSE_MAX_PER_IP,
    demoControlKey: e.DEMO_CONTROL_KEY,
    publicUrlSuspect:
      e.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(publicUrl),
    priceBookPerRequest: e.PRICE_BOOK_PER_REQUEST,
    priceChatPerToken: e.PRICE_CHAT_PER_TOKEN,
    priceTickerPerSecond: e.PRICE_TICKER_PER_SECOND,
    tickerSliceSeconds: Math.max(1, e.TICKER_SLICE_SECONDS),
    xlmContractId: e.XLM_CONTRACT_ID ?? dep.xlmContractId,
    dexPairId: e.DEX_PAIR_ID ?? dep.dexPairUsdcXlmId,
    dexRouterId: e.DEX_ROUTER_ID ?? dep.dexRouterId,
    dexFactoryId: e.DEX_FACTORY_ID ?? dep.dexFactoryId,
    accountWasmHash: e.ACCOUNT_WASM_HASH ?? dep.accountWasmHash,
    // Ana ağda sunucunun anahtarıyla ajan başlatmak/dondurmak yok: gerçek para.
    demoControls:
      e.DEMO_CONTROLS && e.STELLAR_NETWORK_PASSPHRASE !== MAINNET_PASSPHRASE,
    demoAccountId: e.DEMO_ACCOUNT_ID ?? dep.demoAccountId,
    agentOwnerSecret: e.AGENT_OWNER_SECRET,
    agentsDir: e.AGENTS_DIR,
    creditPoolId: e.CREDIT_POOL_ID ?? dep.creditPoolId,
    creditAccountIds: list(e.CREDIT_ACCOUNT_IDS ?? dep.creditAccountId),
    floatInvestors: list(e.FLOAT_INVESTORS ?? dep.investorPublicKey),
    chatSliceTokens: e.CHAT_SLICE_TOKENS,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicWorkspaceId: e.ANTHROPIC_WORKSPACE_ID,
    chatModel: e.CHAT_MODEL,
    chatMode: e.CHAT_MODE,
  };
}

/** DI belirteci: `@Inject(APP_CONFIG) cfg: AppConfig` */
export const APP_CONFIG = Symbol('APP_CONFIG');
