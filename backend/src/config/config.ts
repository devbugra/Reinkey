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
  PUBLIC_URL: z.string().default('http://localhost:3000'),
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
  CLAIM_EXPIRY_MARGIN_LEDGERS: int.default(120),
  VOUCHER_EXPIRY_SAFETY_LEDGERS: int.default(60),
  RATE_LIMIT_PER_MINUTE: int.default(1200),

  PRICE_BOOK_PER_REQUEST: big.default(5000n),
  PRICE_CHAT_PER_TOKEN: big.default(200n),
  PRICE_TICKER_PER_SECOND: big.default(1000n),
  TICKER_SLICE_SECONDS: int.default(10),

  // Boş bırakılırsa ../deployments/testnet.json dosyasından okunur.
  XLM_CONTRACT_ID: optional,
  DEX_PAIR_ID: optional,
  DEX_ROUTER_ID: optional,
  DEPLOYMENT_FILE: z.string().default('../deployments/testnet.json'),

  // Panel demo kontrolleri: ajanı başlat, hesabı dondur.
  DEMO_CONTROLS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  DEMO_ACCOUNT_ID: optional,
  AGENT_OWNER_SECRET: optional,
  AGENTS_DIR: z.string().default('../agents'),
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
  channelContractId: string;
  usdcContractId: string;
  facilitatorSecret: string;
  sellerPayTo: string;
  claimThreshold: bigint;
  claimIntervalSeconds: number;
  claimExpiryMarginLedgers: number;
  voucherExpirySafetyLedgers: number;
  rateLimitPerMinute: number;
  priceBookPerRequest: bigint;
  priceChatPerToken: bigint;
  priceTickerPerSecond: bigint;
  tickerSliceSeconds: number;
  xlmContractId?: string;
  dexPairId?: string;
  dexRouterId?: string;
  demoControls: boolean;
  demoAccountId?: string;
  agentOwnerSecret?: string;
  agentsDir: string;
  chatSliceTokens: number;
  anthropicApiKey?: string;
  anthropicWorkspaceId?: string;
  chatModel: string;
  chatMode: 'fallback' | 'llm';
}

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
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ''),
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    databaseUrl: e.DATABASE_URL,
    chainMode: 'stellar',
    rpcUrl: e.STELLAR_RPC_URL,
    networkPassphrase: e.STELLAR_NETWORK_PASSPHRASE,
    network: e.X402_NETWORK,
    channelContractId: channelContractId!,
    usdcContractId: usdcContractId!,
    facilitatorSecret: e.FACILITATOR_SECRET!,
    sellerPayTo: sellerPayTo!,
    claimThreshold: e.CLAIM_THRESHOLD,
    claimIntervalSeconds: e.CLAIM_INTERVAL_SECONDS,
    claimExpiryMarginLedgers: e.CLAIM_EXPIRY_MARGIN_LEDGERS,
    voucherExpirySafetyLedgers: e.VOUCHER_EXPIRY_SAFETY_LEDGERS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    priceBookPerRequest: e.PRICE_BOOK_PER_REQUEST,
    priceChatPerToken: e.PRICE_CHAT_PER_TOKEN,
    priceTickerPerSecond: e.PRICE_TICKER_PER_SECOND,
    tickerSliceSeconds: Math.max(1, e.TICKER_SLICE_SECONDS),
    xlmContractId: e.XLM_CONTRACT_ID ?? dep.xlmContractId,
    dexPairId: e.DEX_PAIR_ID ?? dep.dexPairUsdcXlmId,
    dexRouterId: e.DEX_ROUTER_ID ?? dep.dexRouterId,
    demoControls: e.DEMO_CONTROLS,
    demoAccountId: e.DEMO_ACCOUNT_ID ?? dep.demoAccountId,
    agentOwnerSecret: e.AGENT_OWNER_SECRET,
    agentsDir: e.AGENTS_DIR,
    chatSliceTokens: e.CHAT_SLICE_TOKENS,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicWorkspaceId: e.ANTHROPIC_WORKSPACE_ID,
    chatModel: e.CHAT_MODEL,
    chatMode: e.CHAT_MODE,
  };
}

/** DI belirteci: `@Inject(APP_CONFIG) cfg: AppConfig` */
export const APP_CONFIG = Symbol('APP_CONFIG');
