import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { verifyVoucher, voucherPublicKey, hexToBytes } from "@reinkey/core";
import {
  ChannelSigner,
  VoucherLimitError,
  encodePaymentHeader,
  parseSse,
  pickChannelRequirement,
} from "../src/x402.ts";

const NET = "Test SDF Network ; September 2015";
const CONTRACT = "CD2GXK3IYEWRPZAJKQEHO7XO5CVZDKVEK7W2TIGDR6LSEYD52V7EGGHL";

const makeSigner = (deposit = 1000n, claimed = 0n) => {
  const secret = randomBytes(32);
  return {
    secret,
    signer: new ChannelSigner({
      networkPassphrase: NET,
      channelContract: CONTRACT,
      channelId: 7n,
      secret,
      deposit,
      claimed,
    }),
  };
};

describe("ChannelSigner", () => {
  it("kümülatif sayaç artar ve imza doğrulanır", () => {
    const { secret, signer } = makeSigner();
    const pub = voucherPublicKey(secret);
    const v1 = signer.next(100n);
    expect(v1.cumulative).toBe("100");
    const v2 = signer.next(50n);
    expect(v2.cumulative).toBe("150");
    expect(signer.current).toBe(150n);
    expect(signer.remaining).toBe(850n);
    for (const v of [v1, v2]) {
      expect(
        verifyVoucher(
          { networkPassphrase: NET, channelContract: CONTRACT, channelId: 7n, cumulative: BigInt(v.cumulative) },
          hexToBytes(v.signature),
          pub,
        ),
      ).toBe(true);
    }
  });

  it("zincirde tahsil edilmiş tutardan devam eder", () => {
    const { signer } = makeSigner(1000n, 400n);
    expect(signer.next(10n).cumulative).toBe("410");
  });

  it("depozitoyu aşan kupon üretilmez", () => {
    const { signer } = makeSigner(100n);
    expect(() => signer.next(101n)).toThrow(VoucherLimitError);
    // sayaç bozulmadı
    expect(signer.current).toBe(0n);
  });

  it("kümülatif tutar geriye gidemez", () => {
    const { signer } = makeSigner();
    signer.next(100n);
    expect(() => signer.at(50n)).toThrow();
  });
});

describe("x402 başlıkları", () => {
  it("v1 ve v2 başlık adlarının ikisi de gönderilir", () => {
    const { signer } = makeSigner();
    const h = encodePaymentHeader(signer.payload(signer.next(10n), "stellar:testnet"));
    expect(Object.keys(h).sort()).toEqual(["PAYMENT-SIGNATURE", "X-PAYMENT"]);
    const decoded = JSON.parse(Buffer.from(h["PAYMENT-SIGNATURE"], "base64").toString());
    expect(decoded).toMatchObject({ x402Version: 2, scheme: "channel", network: "stellar:testnet" });
    expect(decoded.payload.channelId).toBe("7");
  });

  it("402 gövdesinden channel şartı seçilir", () => {
    const body = {
      x402Version: 2,
      accepts: [
        { scheme: "exact", network: "n", asset: "a", payTo: "p", maxAmountRequired: "1" },
        { scheme: "channel", network: "n", asset: "a", payTo: "p", amount: "5", unit: "request", extra: { channelContract: CONTRACT } },
      ],
    } as const;
    expect(pickChannelRequirement(body as never)?.scheme).toBe("channel");
    expect(pickChannelRequirement({ x402Version: 2, accepts: [body.accepts[0]] } as never)).toBeNull();
  });
});

describe("SSE ayrıştırma", () => {
  const sse = (s: string) =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(s)); c.close(); } }));

  it("olay adlarını ve JSON verisini çıkarır", async () => {
    const res = sse(
      ": ping\n\n" +
        'event: session\ndata: {"streamId":"s1","unit":"second"}\n\n' +
        'event: tick\ndata: {"price":"0.12","index":0}\n\n' +
        'event: payment-required\ndata: {"streamId":"s1","requiredCumulative":"400"}\n\n' +
        'event: done\ndata: {"seconds":10}\n\n',
    );
    const seen: string[] = [];
    for await (const e of parseSse(res)) seen.push(e.type);
    expect(seen).toEqual(["session", "tick", "payment-required", "done"]);
  });

  it("bozuk olayları atlar, akışı kesmez", async () => {
    const res = sse('event: tick\ndata: {bozuk\n\nevent: done\ndata: {}\n\n');
    const seen: string[] = [];
    for await (const e of parseSse(res)) seen.push(e.type);
    expect(seen).toEqual(["done"]);
  });
});
