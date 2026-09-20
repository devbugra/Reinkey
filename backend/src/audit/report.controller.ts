import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ReinkeyError } from '../common/errors';
import { CHAIN_ERRORS, chainCodeFromNumber } from '../common/reason-codes';
import { EventsService } from './events.service';

const digits = z.string().regex(/^\d+$/);
const ReportBody = z.object({
  account: z.string().min(1).max(64),
  tx: z.string().regex(/^[0-9a-fA-F]{64}$/, 'tx 64 karakter hex olmalı'),
  /** Ajanın simülasyonda gördüğü kod; yalnızca zincirden okunamazsa kullanılır. */
  code: z.string().regex(/^[A-Z0-9_]{3,40}$/).optional(),
  kind: z.enum(['swap', 'payment']).optional(),
  details: z
    .object({
      sold: digits,
      soldAsset: z.string().min(1).max(12),
      bought: digits,
      boughtAsset: z.string().min(1).max(12),
    })
    .optional(),
});

const KNOWN_CODES = new Set(Object.values(CHAIN_ERRORS));
// Sunucu isteği uzun tutmaz: bildiren, işlem RPC'ye düşmediyse yeniden dener.
const POLL_ATTEMPTS = 3;
const MAX_REPORTED = 5000;

/**
 * §8.3 / §14.2 / §15: ajanların zincir işlemlerini bildirdiği uç. Her bildirim zincirden
 * doğrulanır: başarısız işlem `chain.rejected`, başarılı takas `dex.swapped` olur.
 */
@ApiTags('audit')
@Controller('v1')
export class ReportController {
  constructor(
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly events: EventsService,
  ) {}

  /** Bildirilmiş (tx, tür) çiftleri: aynı işlem defterde bir kez yer alır. */
  private readonly reported = new Set<string>();

  private once(tx: string, type: string) {
    const key = `${type}:${tx}`;
    if (this.reported.has(key))
      throw new ReinkeyError('BAD_REQUEST', 'Bu işlem zaten bildirildi', 'gateway', 409, tx);
    if (this.reported.size >= MAX_REPORTED)
      this.reported.delete(this.reported.values().next().value as string);
    this.reported.add(key);
  }

  @Post('report')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Zincir işlemi bildirimi: red (FAILED) ya da DEX takası (SUCCESS)',
  })
  @ApiBody({
    schema: {
      example: {
        account: 'C...',
        tx: '64 karakter hex',
        code: 'PER_TX_CAP_EXCEEDED',
        kind: 'swap',
        details: {
          sold: '5000000',
          soldAsset: 'USDC',
          bought: '39800000',
          boughtAsset: 'XLM',
        },
      },
    },
  })
  async report(@Body() body: unknown) {
    const p = ReportBody.safeParse(body);
    if (!p.success)
      throw new ReinkeyError('BAD_REQUEST', p.error.issues[0].message);
    const { account, kind, details } = p.data;
    const tx = p.data.tx.toLowerCase();

    let status: Awaited<ReturnType<ChainPort['getTransactionStatus']>> = {
      status: 'NOT_FOUND',
    };
    try {
      // İşlem RPC'ye birkaç saniye gecikmeyle düşebilir.
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        status = await this.chain.getTransactionStatus(tx, account);
        if (status.status !== 'NOT_FOUND') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (e) {
      throw new ReinkeyError(
        'CHAIN_UNAVAILABLE',
        'İşlem durumu şu an okunamıyor',
        'chain',
      );
    }

    if (status.status === 'NOT_FOUND')
      throw new ReinkeyError(
        'REPORT_NOT_VERIFIED',
        'İşlem zincirde bulunamadı',
        'chain',
        422,
        tx,
      );

    // Zarfta hesabın adresi yoksa işlem o hesaba ait değildir: başkasının defterine yazılmaz.
    if (status.involvesAccount === false)
      throw new ReinkeyError(
        'REPORT_NOT_VERIFIED',
        'İşlem bu hesapla ilişkili değil',
        'chain',
        422,
        tx,
      );

    if (status.status === 'SUCCESS') {
      if (kind !== 'swap' || !details)
        throw new ReinkeyError(
          'REPORT_NOT_VERIFIED',
          'İşlem başarılı; yalnızca kind: "swap" ve details ile bildirilebilir',
          'chain',
          422,
          tx,
        );
      this.once(tx, 'dex.swapped');
      const event = this.events.emit(
        'dex.swapped',
        'chain',
        // Tutarlar bildirenden gelir (zincirden çözülmüyor): `reported` bunu işaretler.
        { account, ...details, tx, reported: true },
        { account, tx },
      );
      return { ok: true, status: 'SUCCESS', event };
    }

    // FAILED: kod önce zincirin tanı olaylarından, bulunamazsa bildirenden.
    let code: string;
    let codeSource: 'chain' | 'reporter' | 'none';
    if (status.contractErrorCode !== undefined) {
      code = chainCodeFromNumber(status.contractErrorCode);
      codeSource = 'chain';
    } else if (p.data.code && KNOWN_CODES.has(p.data.code)) {
      code = p.data.code;
      codeSource = 'reporter';
    } else {
      code = 'UNKNOWN_CHAIN_ERROR';
      codeSource = 'none';
    }
    this.once(tx, 'chain.rejected');
    const event = this.events.emit(
      'chain.rejected',
      'chain',
      { account, code, codeSource, tx },
      { account, code, tx },
    );
    return { ok: true, status: 'FAILED', code, codeSource, event };
  }
}
