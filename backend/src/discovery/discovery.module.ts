import { Global, Module } from '@nestjs/common';
import { BazaarController } from './bazaar.controller';
import { CatalogService } from './catalog.service';
import { LlmsController } from './llms.controller';
import { McpController } from './mcp.controller';

/** Global: FacilitatorController (/verify) kataloğa yazar. */
@Global()
@Module({
  providers: [CatalogService],
  controllers: [LlmsController, McpController, BazaarController],
  exports: [CatalogService],
})
export class DiscoveryModule {}
