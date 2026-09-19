import { Keypair } from '@stellar/stellar-sdk';
import {
  encodeVoucherMessage,
  hashVoucher,
  networkId,
  publicKeyFromSeed,
  signVoucher,
  verifyVoucher,
} from './voucher';

// BACKEND.md §3.2: Rust kontratı da aynı vektörle test ediliyor. AYNEN kullan.
const VECTOR = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractIdRawHex:
    '0202020202020202020202020202020202020202020202020202020202020202',
  channelId: '42',
  cumulative: '135000',
  voucherSecretSeedHex:
    '0101010101010101010101010101010101010101010101010101010101010101',
  expected: {
    networkIdHex:
      'cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472',
    messageHex:
      '7265696e6b65793a766f75636865723a7631cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd4720202020202020202020202020202020202020202020202020202020202020202000000000000002a00000000000000000000000000020f58',
    hashHex: '09e5987e1dd2a9bc88f7547fe9b9f63f93904814dbc9a0736bc80e9e1c94fcff',
    publicKeyHex:
      '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c',
    signatureHex:
      '07d349e172fba846b558b11d69aac42df4a6acdf09ed0c63a00f3f1dc86c911cd5118cfe983abb8e41e0bdddd118f31aa70b7a0d0639246188ee312192607e0d',
  },
};

const fields = {
  networkPassphrase: VECTOR.networkPassphrase,
  contractId: Buffer.from(VECTOR.contractIdRawHex, 'hex'),
  channelId: BigInt(VECTOR.channelId),
  cumulative: BigInt(VECTOR.cumulative),
};
const seed = Buffer.from(VECTOR.voucherSecretSeedHex, 'hex');

describe('voucher test vektörü (§3.2)', () => {
  it('network id', () => {
    expect(networkId(VECTOR.networkPassphrase).toString('hex')).toBe(
      VECTOR.expected.networkIdHex,
    );
  });

  it('mesaj baytları', () => {
    expect(encodeVoucherMessage(fields).toString('hex')).toBe(
      VECTOR.expected.messageHex,
    );
  });

  it('hash', () => {
    expect(hashVoucher(fields).toString('hex')).toBe(VECTOR.expected.hashHex);
  });

  it('açık anahtar (Node ve stellar-sdk aynı)', () => {
    expect(publicKeyFromSeed(seed)).toBe(VECTOR.expected.publicKeyHex);
    expect(
      Buffer.from(Keypair.fromRawEd25519Seed(seed).rawPublicKey()).toString(
        'hex',
      ),
    ).toBe(VECTOR.expected.publicKeyHex);
  });

  it('imza', () => {
    expect(signVoucher(fields, seed)).toBe(VECTOR.expected.signatureHex);
    expect(
      Buffer.from(
        Keypair.fromRawEd25519Seed(seed).sign(hashVoucher(fields)),
      ).toString('hex'),
    ).toBe(VECTOR.expected.signatureHex);
  });

  it('doğrulama', () => {
    const pk = VECTOR.expected.publicKeyHex;
    const sig = VECTOR.expected.signatureHex;
    expect(verifyVoucher(fields, pk, sig)).toBe(true);
    expect(verifyVoucher({ ...fields, cumulative: 135001n }, pk, sig)).toBe(
      false,
    );
    expect(verifyVoucher({ ...fields, channelId: 43n }, pk, sig)).toBe(false);
    expect(verifyVoucher(fields, pk, 'ab'.repeat(64))).toBe(false);
    expect(verifyVoucher(fields, 'zz', sig)).toBe(false);
  });

  it('C-strkey kontrat kimliği ham baytlarla aynı mesajı üretir', async () => {
    const { StrKey } = await import('@stellar/stellar-sdk');
    const strkey = StrKey.encodeContract(fields.contractId);
    expect(
      encodeVoucherMessage({ ...fields, contractId: strkey }).toString('hex'),
    ).toBe(VECTOR.expected.messageHex);
  });
});
