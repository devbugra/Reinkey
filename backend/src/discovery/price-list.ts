import type { AppConfig } from '../config/config';

/** Ücretli kaynaklar, fiyatları ve birimleri (llms.txt ve MCP ortak kullanır). */
export function priceList(cfg: AppConfig) {
  return {
    asset: cfg.usdcContractId,
    decimals: 7,
    network: cfg.network,
    payTo: cfg.sellerPayTo,
    channelContract: cfg.channelContractId,
    resources: [
      {
        method: 'GET',
        path: '/demo/book',
        url: `${cfg.publicUrl}/demo/book`,
        description: 'Order book snapshot (USDC_XLM)',
        unit: 'request' as const,
        price: cfg.priceBookPerRequest.toString(),
        schemes: ['channel'],
      },
      {
        method: 'GET',
        path: '/demo/ticker/stream',
        url: `${cfg.publicUrl}/demo/ticker/stream`,
        description: 'Live XLM/USDC ticker (SSE), paid per second in slices',
        unit: 'second' as const,
        price: cfg.priceTickerPerSecond.toString(),
        sliceSeconds: cfg.tickerSliceSeconds,
        sliceAmount: (
          cfg.priceTickerPerSecond * BigInt(cfg.tickerSliceSeconds)
        ).toString(),
        schemes: ['channel'],
      },
      {
        method: 'POST',
        path: '/demo/chat',
        url: `${cfg.publicUrl}/demo/chat`,
        description: 'Streamed chat completion (SSE), paid per token in slices',
        unit: 'token' as const,
        price: cfg.priceChatPerToken.toString(),
        sliceTokens: cfg.chatSliceTokens,
        sliceAmount: (
          cfg.priceChatPerToken * BigInt(cfg.chatSliceTokens)
        ).toString(),
        schemes: ['channel'],
      },
    ],
  };
}
