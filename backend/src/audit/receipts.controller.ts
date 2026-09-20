import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ReinkeyError } from '../common/errors';
import { ReceiptsService } from './receipts.service';
import { intParam } from '../common/params';

const AttestBody = z.object({ responseHash: z.string().regex(/^[0-9a-f]{64}$/) });

/** İmzalı makbuzlar: bir ödemenin ne için yapıldığının kanıtı. */
@ApiTags('audit')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @ApiOperation({ summary: 'Makbuzlar, yeniden eskiye' })
  @ApiQuery({ name: 'payee', required: false })
  @ApiQuery({ name: 'channelId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('payee') payee?: string,
    @Query('channelId') channelId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.receipts.list({ payee, channelId, limit: intParam(limit, 50, 1, 200, 'limit') });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tek makbuz (imzasıyla birlikte)' })
  get(@Param('id') id: string) {
    return this.receipts.get(id);
  }

  @Get(':id/verify')
  @ApiOperation({
    summary:
      'İmzayı doğrular. Aynı doğrulama imzalayanın açık anahtarıyla çevrimdışı da yapılabilir; bu uç yalnızca kolaylık.',
  })
  async verify(@Param('id') id: string) {
    const receipt = await this.receipts.get(id);
    return { ...ReceiptsService.verify(receipt), signer: receipt.signer, receipt };
  }

  @Post(':id/attest')
  @ApiOperation({
    summary:
      'Satıcı teslim ettiği yanıtın özetini taahhüt eder. Facilitator yanıtı görmez; yalnızca kaydeder ve değiştirilmesine izin vermez.',
  })
  @ApiBody({ schema: { example: { responseHash: '64 karakter hex (sha256)' } } })
  attest(@Param('id') id: string, @Body() body: unknown) {
    const p = AttestBody.safeParse(body);
    if (!p.success) throw new ReinkeyError('BAD_REQUEST', p.error.issues[0].message);
    return this.receipts.attest(id, p.data.responseHash);
  }
}
