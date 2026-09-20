import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PrismaService } from './prisma.service';
import { canonical, receiptId, sha256Hex, type ReceiptBody, type SignedReceipt } from './receipt';

/**
 * Makbuz üretimi, saklama ve doğrulama.
 *
 * Yazımlar 250 ms'lik paketler hâlinde toplanır (olay defteriyle aynı desen):
 * saniyede yüzlerce ödeme olabilir, her biri için ayrı INSERT beklemek kupon
 * doğrulamasının ölçülen 0,2 ms'sini anlamsız kılardı.
 */
const FLUSH_MS = 250;
const MAX_PAGE = 200;
/** Taahhüt penceresi: satıcı yanıtı gönderdikten hemen sonra çağırır. */
const ATTEST_WINDOW_MS = 60_000;

export interface ReceiptInput {
  channelId: bigint;
  payer: string;
  payee: string;
  resource: string;
  method: string;
  unit: string;
  amount: bigint;
  cumulative: bigint;
  requestHash?: string | null;
}

@Injectable()
export class ReceiptsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('Receipts');
  private pending: SignedReceipt[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.flush();
  }

  get signer(): string {
    return this.chain.signerAddress;
  }

  /** Makbuzu üretir ve imzalar; yazım arka planda kuyruğa alınır. */
  issue(input: ReceiptInput): SignedReceipt {
    const body: ReceiptBody = {
      v: 1,
      network: this.cfg.network,
      signer: this.signer,
      channelId: input.channelId.toString(),
      payer: input.payer,
      payee: input.payee,
      resource: input.resource,
      method: input.method.toUpperCase(),
      unit: input.unit,
      amount: input.amount.toString(),
      cumulative: input.cumulative.toString(),
      requestHash: input.requestHash ?? null,
      ts: new Date().toISOString(),
    };
    const receipt: SignedReceipt = {
      ...body,
      id: receiptId(body),
      signature: this.chain.signMessage(canonical(body)).toString('hex'),
    };
    this.pending.push(receipt);
    return receipt;
  }

  /** İmzayı imzalayanın açık anahtarıyla doğrular (çevrimdışı yapılabilir). */
  static verify(receipt: SignedReceipt): { valid: boolean; reason?: string } {
    const { id, signature, responseHash: _r, attestedAt: _a, ...body } = receipt;
    const expectedId = receiptId(body as ReceiptBody);
    if (id !== expectedId) return { valid: false, reason: 'ID gövdeyle uyuşmuyor' };
    try {
      const ok = Keypair.fromPublicKey(body.signer).verify(
        canonical(body as ReceiptBody),
        Buffer.from(signature, 'hex'),
      );
      return ok ? { valid: true } : { valid: false, reason: 'İmza geçersiz' };
    } catch (e) {
      return { valid: false, reason: `İmza çözülemedi: ${(e as Error).message}` };
    }
  }

  async flush(): Promise<void> {
    if (!this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    try {
      await this.prisma.receipt.createMany({
        data: batch.map((r) => ({
          id: r.id,
          channelId: BigInt(r.channelId),
          payer: r.payer,
          payee: r.payee,
          resource: r.resource,
          method: r.method,
          unit: r.unit,
          amount: BigInt(r.amount),
          cumulative: BigInt(r.cumulative),
          requestHash: r.requestHash,
          signer: r.signer,
          signature: r.signature,
        })),
        skipDuplicates: true,
      });
    } catch (e) {
      this.log.error(`makbuzlar yazılamadı (${batch.length}): ${(e as Error).message}`);
    }
  }

  private toReceipt(r: {
    id: string;
    channelId: bigint;
    payer: string;
    payee: string;
    resource: string;
    method: string;
    unit: string;
    amount: bigint;
    cumulative: bigint;
    requestHash: string | null;
    responseHash: string | null;
    attestedAt: Date | null;
    signer: string;
    signature: string;
    createdAt: Date;
  }): SignedReceipt {
    return {
      v: 1,
      network: this.cfg.network,
      signer: r.signer,
      channelId: r.channelId.toString(),
      payer: r.payer,
      payee: r.payee,
      resource: r.resource,
      method: r.method,
      unit: r.unit,
      amount: r.amount.toString(),
      cumulative: r.cumulative.toString(),
      requestHash: r.requestHash,
      ts: r.createdAt.toISOString(),
      id: r.id,
      signature: r.signature,
      responseHash: r.responseHash,
      attestedAt: r.attestedAt ? r.attestedAt.toISOString() : null,
    };
  }

  async get(id: string): Promise<SignedReceipt> {
    await this.flush();
    const row = await this.prisma.receipt.findUnique({ where: { id } });
    if (!row) throw new ReinkeyError('NOT_FOUND', `Makbuz ${id} bulunamadı`);
    return this.toReceipt(row);
  }

  async list(q: { payee?: string; channelId?: string; limit?: number }) {
    await this.flush();
    const take = Math.min(Math.max(q.limit ?? 50, 1), MAX_PAGE);
    const rows = await this.prisma.receipt.findMany({
      where: {
        ...(q.payee ? { payee: q.payee } : {}),
        ...(q.channelId && /^\d+$/.test(q.channelId) ? { channelId: BigInt(q.channelId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { signer: this.signer, receipts: rows.map((r) => this.toReceipt(r)) };
  }

  /**
   * Satıcı teslim ettiği yanıtı taahhüt eder. Facilitator yanıtı görmediği için
   * bunu DOĞRULAYAMAZ; kaydeder. Bir kez yazılır, sonra değiştirilemez.
   */
  async attest(id: string, responseHash: string): Promise<SignedReceipt> {
    if (!/^[0-9a-f]{64}$/.test(responseHash))
      throw new ReinkeyError('BAD_REQUEST', 'responseHash 64 karakter hex olmalı');
    const current = await this.get(id);
    // SINIR: taahhüt kimliksizdir (@reinkey/meter yanıtı gönderir göndermez, imzasız
    // çağırır). Makbuz kimliği alıcıya da gittiği için pencereyi dar tutuyoruz: yalnızca
    // makbuz kesildikten kısa süre sonra ve bir kez. Satıcı imzası bir sonraki sürümde.
    if (!current.responseHash && Date.now() - Date.parse(current.ts) > ATTEST_WINDOW_MS)
      throw new ReinkeyError('BAD_REQUEST', 'Taahhüt penceresi kapandı (makbuz kesildikten sonra 60 sn)');
    if (current.responseHash && current.responseHash !== responseHash)
      throw new ReinkeyError('BAD_REQUEST', 'Bu makbuz için farklı bir yanıt özeti zaten taahhüt edilmiş');
    if (current.responseHash) return current;
    const row = await this.prisma.receipt.update({
      where: { id },
      data: { responseHash, attestedAt: new Date() },
    });
    return this.toReceipt(row);
  }

  /** Verilen yanıt gövdesi makbuzdaki taahhütle uyuşuyor mu? */
  static matchesResponse(receipt: SignedReceipt, body: string | Buffer): boolean {
    return !!receipt.responseHash && receipt.responseHash === sha256Hex(body);
  }
}
