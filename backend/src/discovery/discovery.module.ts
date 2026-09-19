import { Module } from '@nestjs/common';
import { LlmsController } from './llms.controller';
import { McpController } from './mcp.controller';

@Module({ controllers: [LlmsController, McpController] })
export class DiscoveryModule {}
