import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  chainCodeName,
  codeFromChainError,
  contractIdToBytes,
  encodeVoucherMessage,
  hashVoucher,
  hexToBytes,
  i128be,
  networkId,
  signVoucher,
  u64be,
  verifyVoucher,
  voucherPublicKey,
} from "../src/index.ts";

/** docs/BACKEND.md §3.2 — Rust birim testiyle AYNI vektör. */
const V = {
  networkPassphrase: "Test SDF Network ; September 2015",
  contractIdRawHex: "0202020202020202020202020202020202020202020202020202020202020202",
  channelId: 42n,
  cumulative: 135000n,
  secretHex: "0101010101010101010101010101010101010101010101010101010101010101",
  expected: {
    networkIdHex: "cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472",
    messageHex:
      "7265696e6b65793a766f75636865723a7631cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd4720202020202020202020202020202020202020202020202020202020202020202000000000000002a00000000000000000000000000020f58",
    hashHex: "09e5987e1dd2a9bc88f7547fe9b9f63f93904814dbc9a0736bc80e9e1c94fcff",
    publicKeyHex: "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
    signatureHex:
      "07d349e172fba846b558b11d69aac42df4a6acdf09ed0c63a00f3f1dc86c911cd5118cfe983abb8e41e0bdddd118f31aa70b7a0d0639246188ee312192607e0d",
  },
};

const input = {
  networkPassphrase: V.networkPassphrase,
  channelContract: hexToBytes(V.contractIdRawHex),
  channelId: V.channelId,
  cumulative: V.cumulative,
};

describe("kupon test vektörü", () => {
  it("network id", () => {
    expect(bytesToHex(networkId(V.networkPassphrase))).toBe(V.expected.networkIdHex);
  });

  it("mesaj baytları", () => {
    expect(bytesToHex(encodeVoucherMessage(input))).toBe(V.expected.messageHex);
  });

  it("hash", () => {
    expect(bytesToHex(hashVoucher(input))).toBe(V.expected.hashHex);
  });

  it("açık anahtar ve imza", () => {
    const secret = hexToBytes(V.secretHex);
    expect(bytesToHex(voucherPublicKey(secret))).toBe(V.expected.publicKeyHex);
    expect(bytesToHex(signVoucher(input, secret))).toBe(V.expected.signatureHex);
  });

  it("doğrulama", () => {
    const pub = hexToBytes(V.expected.publicKeyHex);
    expect(verifyVoucher(input, hexToBytes(V.expected.signatureHex), pub)).toBe(true);
    // farklı tutar → imza tutmaz
    expect(verifyVoucher({ ...input, cumulative: 135001n }, hexToBytes(V.expected.signatureHex), pub)).toBe(false);
  });
});

describe("kodlama", () => {
  it("u64 ve i128 big-endian", () => {
    expect(bytesToHex(u64be(42n))).toBe("000000000000002a");
    expect(bytesToHex(i128be(135000n))).toBe("00000000000000000000000000020f58");
    expect(bytesToHex(i128be(-1n))).toBe("ffffffffffffffffffffffffffffffff");
  });

  it("C-adresi ham 32 bayta çevrilir", () => {
    const raw = contractIdToBytes("CD2GXK3IYEWRPZAJKQEHO7XO5CVZDKVEK7W2TIGDR6LSEYD52V7EGGHL");
    expect(raw).toHaveLength(32);
    expect(() => contractIdToBytes("GAI76J3PSOKJT6DCRDQITR7DVQQPUZS2IMAVRYFZ45H523LFKH2BES7P")).toThrow();
  });

  it("aralık dışı değerler reddedilir", () => {
    expect(() => u64be(-1n)).toThrow();
    expect(() => i128be(1n << 127n)).toThrow();
  });
});

describe("sebep kodları", () => {
  it("zincir hatasından kod adı", () => {
    expect(codeFromChainError("HostError: Error(Contract, #7)")).toBe("DAILY_CAP_EXCEEDED");
    expect(codeFromChainError("Error(Contract, #24)")).toBe("EXCEEDS_DEPOSIT");
    expect(codeFromChainError("Error(Crypto, InvalidInput)")).toBe("BAD_SIGNATURE");
    expect(codeFromChainError("başka bir şey")).toBeNull();
  });

  it("bilinmeyen kod ham kalır", () => {
    expect(chainCodeName(99)).toBe("CONTRACT_99");
  });
});
