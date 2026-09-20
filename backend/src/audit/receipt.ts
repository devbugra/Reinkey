/**
 * İMZALI MAKBUZ — "ne için ödendi" kanıtı.
 *
 * Her x402 ödemesi bir makbuz üretir: alıcının imzalı kuponunu, çağrılan kaynağı
 * ve istek gövdesinin özetini bir arada tutan, facilitator'ın ed25519 anahtarıyla
 * imzalanmış küçük bir belge. İmzalayan, zincirde `claim` işlemini gönderen
 * anahtarın aynısıdır; yani makbuzu doğrulamak için bize güvenmek gerekmez,
 * herkes çevrimdışı doğrulayabilir.
 *
 * Yanıtın özeti (`responseHash`) makbuza SONRADAN eklenir: yanıtı facilitator
 * değil satıcı üretir, dolayısıyla imzalanan belgenin parçası olamaz. Satıcı
 * teslim ettiği yanıtı `POST /receipts/:id/attest` ile taahhüt eder; anlaşmazlıkta
 * alıcı aldığı yanıtın özetiyle karşılaştırır.
 *
 * Ödeme başına ZİNCİR OLAYI YAZILMAZ: ürünün tezi "binlerce ödeme, birkaç zincir
 * işlemi". Zincire giden kanıt tahsilattır; makbuz onun altındaki ayrıntıyı taşır.
 */
import { createHash } from 'node:crypto';

/** İmzalanan alanlar. Sıra ÖNEMLİ: kanonik biçim bu sırayla üretilir. */
export interface ReceiptBody {
  v: 1;
  network: string;
  signer: string;
  channelId: string;
  payer: string;
  payee: string;
  resource: string;
  method: string;
  unit: string;
  amount: string;
  cumulative: string;
  requestHash: string | null;
  ts: string;
}

export interface SignedReceipt extends ReceiptBody {
  id: string;
  signature: string;
  /** Satıcının sonradan taahhüt ettiği yanıt özeti. İmzanın parçası DEĞİLDİR. */
  responseHash?: string | null;
  attestedAt?: string | null;
}

/**
 * Kanonik biçim: alanlar sabit sırayla, ayırıcı `\n`, boş değer boş dize.
 * JSON kullanılmaz; anahtar sırası ve boşluk farkları imzayı bozar.
 */
export function canonical(b: ReceiptBody): Buffer {
  const fields: (keyof ReceiptBody)[] = [
    'v',
    'network',
    'signer',
    'channelId',
    'payer',
    'payee',
    'resource',
    'method',
    'unit',
    'amount',
    'cumulative',
    'requestHash',
    'ts',
  ];
  return Buffer.from(
    `reinkey-receipt/1\n${fields.map((f) => `${f}=${b[f] ?? ''}`).join('\n')}\n`,
    'utf8',
  );
}

export function receiptId(b: ReceiptBody): string {
  return createHash('sha256').update(canonical(b)).digest('hex');
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
