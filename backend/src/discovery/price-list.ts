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
        unit: 'request',
        price: cfg.priceBookPerRequest.toString(),
        schemes: ['channel'],
      },
      {
        method: 'POST',
        path: '/demo/chat',
        url: `${cfg.publicUrl}/demo/chat`,
        description: 'Streamed chat completion (SSE), paid per token in slices',
        unit: 'token',
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
