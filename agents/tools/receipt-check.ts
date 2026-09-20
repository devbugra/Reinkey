/**
 * İMZALI MAKBUZ DOĞRULAMASI: "ne için ödendi" kanıtı çevrimdışı tutuyor mu?
 *
 *   1. Ücretli bir çağrı yapılır; yanıtla birlikte PAYMENT-RESPONSE içinde makbuz gelir.
 *   2. Makbuzun imzası, facilitator'a HİÇ SORULMADAN doğrulanır: imzalayan anahtar
 *      /supported'daki `receiptSigner`, doğrulama yerelde ed25519 ile yapılır.
 *   3. Makbuzdaki istek özeti, gönderdiğimiz isteğin özetiyle karşılaştırılır.
 *   4. Satıcının taahhüt ettiği yanıt özeti, elimize geçen gövdenin özetiyle karşılaştırılır.
 *   5. Kurcalanmış bir makbuzun doğrulamayı geçmediği gösterilir.
 *
 * Gerçek testnet işlemi yapar (kanal açılışı, 0.01 USDC).
 * Çalıştırma: pnpm --filter @reinkey/agents exec tsx tools/receipt-check.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { ChannelSigner, x402Fetch } from "../../packages/sdk/src/x402.ts";
import { API, apiHealth, bad, good, info, makeAccount, requirementsFor, step, tx, usdc } from "../common.ts";

const DEPOSIT = 100_000n;
let failures = 0;
const check = (ok: boolean, msg: string) => (ok ? good(msg) : (failures++, bad(msg)));
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Makbuzun kanonik biçimi (backend/src/audit/receipt.ts ile birebir). */
type Receipt = Record<string, string | number | null | undefined> & { id: string; signature: string; signer: string };
const FIELDS = ["v", "network", "signer", "channelId", "payer", "payee", "resource", "method", "unit", "amount", "cumulative", "requestHash", "ts"];
const canonical = (r: Receipt) => Buffer.from(`reinkey-receipt/1\n${FIELDS.map((f) => `${f}=${r[f] ?? ""}`).join("\n")}\n`, "utf8");

const health = await apiHealth();
if (!health?.ok) throw new Error(`facilitator hazır değil: ${API}`);
const book = await requirementsFor(`${API}/demo/book`);
if (!book) throw new Error("/demo/book 402 dönmedi");

step("İmzalayan anahtar (facilitator'ın kendi beyanı, bir kez okunur)");
const supported = (await (await fetch(`${API}/supported`)).json()) as { kinds: { extra?: { receiptSigner?: string } }[] };
const signer = supported.kinds[0]?.extra?.receiptSigner;
check(!!signer, `receiptSigner: ${signer ?? "YOK"}`);

step("Kanal ve ücretli çağrı");
const { account, deployment } = await makeAccount();
const voucherSecret = randomBytes(32);
const opened = await account.openChannel({ payee: book.payTo, deposit: DEPOSIT, voucherSecret, ttlLedgers: 720 });
good(`kanal #${opened.channelId} · ${tx(opened.tx)}`);
const signerCh = new ChannelSigner({
  networkPassphrase: deployment.networkPassphrase,
  channelContract: book.channelContract,
  channelId: opened.channelId,
  secret: voucherSecret,
  deposit: DEPOSIT,
});
const url = `${API}/demo/book?pair=USDC_XLM`;
const { res, receipt: paid } = await x402Fetch(url, { signer: signerCh, network: book.network });
const bodyText = await res.text();
const receipt = (paid as unknown as { receipt?: Receipt })?.receipt;
check(res.status === 200 && !!receipt, `çağrı ${res.status} · makbuz ${receipt ? receipt.id.slice(0, 12) + "…" : "YOK"}`);
if (!receipt) process.exit(1);
info("ödenen", `${usdc(String(receipt.amount))} USDC · kaynak ${String(receipt.resource).split("/").slice(-1)[0]}`);

step("İmza çevrimdışı doğrulanıyor (facilitator'a sorulmadan)");
check(receipt.signer === signer, `makbuzu imzalayan, ilan edilen anahtar: ${String(receipt.signer).slice(0, 8)}…`);
check(receipt.id === sha256(canonical(receipt)), "kimlik gövdenin özetiyle uyuşuyor");
check(
  Keypair.fromPublicKey(String(receipt.signer)).verify(canonical(receipt), Buffer.from(String(receipt.signature), "hex")),
  "ed25519 imzası geçerli",
);

step("Makbuz ne için ödendiğini sabitliyor mu");
const expectedRequest = sha256(`GET\n${url}\n`);
check(receipt.requestHash === expectedRequest, `istek özeti eşleşti (${String(receipt.requestHash).slice(0, 12)}…)`);
// Yanıt özeti satıcı tarafından sonradan taahhüt edilir; kısa bir bekleme yeter.
await new Promise((r) => setTimeout(r, 800));
const stored = (await (await fetch(`${API}/receipts/${receipt.id}`)).json()) as Receipt & { responseHash?: string };
check(!!stored.responseHash, `satıcı yanıtı taahhüt etti: ${String(stored.responseHash).slice(0, 12)}…`);
check(stored.responseHash === sha256(bodyText), "taahhüt edilen özet, elimize geçen yanıtla aynı");

step("Kurcalanmış makbuz reddedilmeli");
const forged = { ...receipt, amount: "1" };
check(
  !Keypair.fromPublicKey(String(receipt.signer)).verify(canonical(forged), Buffer.from(String(receipt.signature), "hex")),
  "tutarı değiştirilmiş makbuz imzayı geçemedi",
);

console.log(failures === 0 ? "\n✓ makbuzlar çevrimdışı doğrulanabiliyor" : `\n✗ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
