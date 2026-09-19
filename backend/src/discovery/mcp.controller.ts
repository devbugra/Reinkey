import {
  All,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { StatsService } from '../audit/stats.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ChannelStore } from '../channel/channel.cache';
import { channelView } from '../channel/channel.controller';
import { jsonSafe } from '../common/bigint';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ExactVerifier } from '../x402/exact.verifier';
import { priceList } from './price-list';

const text = (value: unknown) => ({
  content: [
    { type: 'text' as const, text: JSON.stringify(jsonSafe(value), null, 2) },
  ],
});

/** MCP sunucusu (streamable HTTP, durumsuz). Araçlar salt okunur. */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  private readonly log = new Logger('MCP');

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly store: ChannelStore,
    private readonly stats: StatsService,
    private readonly exact: ExactVerifier,
  ) {}

  private build(): McpServer {
    const server = new McpServer({ name: 'reinkey', version: '0.1.0' });

    server.registerTool(
      'reinkey_supported',
      { description: 'x402 schemes and networks this facilitator supports' },
      () =>
        text({
          kinds: [
            { scheme: 'channel', network: this.cfg.network },
            ...(this.exact.enabled
              ? [{ scheme: 'exact', network: this.cfg.network }]
              : []),
          ],
        }),
    );

    server.registerTool(
      'reinkey_get_channel',
      {
        description:
          'Payment channel state: deposit, claimed, lastAccepted, unclaimed, remaining',
        inputSchema: {
          channelId: z.string().regex(/^\d+$/).describe('u64 channel id'),
        },
      },
      async ({ channelId }) => {
        const ch = await this.store.get(BigInt(channelId));
        return ch
          ? text(channelView(ch))
          : text({ error: 'CHANNEL_NOT_FOUND', channelId });
      },
    );

    server.registerTool(
      'reinkey_get_account',
      {
        description: 'Reinkey Account policy, daily spend and open channels',
        inputSchema: { address: z.string().describe('C… or G… address') },
      },
      async ({ address }) => {
        const state = await this.chain.getAccount(address).catch(() => null);
        const channels = this.store
          .all()
          .filter((c) => c.payer === address && c.open)
          .map(channelView);
        return text({ address, found: !!state, ...(state ?? {}), channels });
      },
    );

    server.registerTool(
      'reinkey_stats',
      {
        description:
          'Vouchers accepted/rejected, on-chain tx count, volume, median latency',
      },
      () => text(this.stats.snapshot()),
    );

    server.registerTool(
      'reinkey_price_list',
      {
        description:
          'Paid resources, prices (USDC base units, 7 decimals) and units',
      },
      () => text(priceList(this.cfg)),
    );

    return server;
  }

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const server = this.build();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      this.log.error(`MCP isteği işlenemedi: ${(e as Error).message}`);
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
    }
  }

  @All()
  notAllowed(@Res() res: Response) {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Durumsuz sunucu: yalnızca POST.',
      },
      id: null,
    });
  }
}
