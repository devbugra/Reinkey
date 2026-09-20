import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { intParam } from '../common/params';

/** x402 Bazaar: bu facilitator üzerinden ödeme alan kaynakların kataloğu. */
@ApiTags('discovery')
@Controller('discovery')
export class BazaarController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('resources')
  @ApiOperation({
    summary:
      'Ücretli kaynak kataloğu (Bazaar). Yalnızca en az bir ödemesi doğrulanmış kaynaklar listelenir.',
  })
  @ApiQuery({ name: 'type', required: false, description: 'yalnızca "http"' })
  @ApiQuery({ name: 'payTo', required: false, description: 'tek bir satıcının kaynakları' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  list(
    @Query('type') type?: string,
    @Query('payTo') payTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (type && type !== 'http')
      return { x402Version: 2, items: [], pagination: { limit: 0, offset: 0, total: 0 } };
    return this.catalog.list({
      payTo: payTo || undefined,
      limit: intParam(limit, 50, 1, 200, 'limit'),
      offset: intParam(offset, 0, 0, 100_000, 'offset'),
    });
  }
}
