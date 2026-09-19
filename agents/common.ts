/**
 * Demo ajanlarının ortak kurulumu ve sahne çıktısı.
 *
 * Terminal sunumda ekrana yansıyacak: her adım numaralı, renkli ve kısa.
 * Tutarlar USDC taban biriminde (7 ondalık) tamsayıdır.
 */
import { Keypair } from "@stellar/stellar-sdk";
import pc from "picocolors";
import { ReinkeyAccount, chainReason } from "../packages/sdk/src/account.ts";
import { loadDeployment, loadSecrets } from "../packages/sdk/src/config.ts";
import { SorobanCallError } from "../packages/sdk/src/soroban.ts";
import { loadRelayer } from "./relayer.ts";

export const API = process.env.API_URL ?? "http://localhost:3000";

export const usdc = (v: bigint | string, digits = 4): string => {
  const n = typeof v === "bigint" ? v : BigInt(v);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0").slice(0, digits);
  return `${neg ? "-" : ""}${abs / 10_000_000n}.${frac}`;
};

let stepNo = 0;
export const step = (title: string) => {
  stepNo++;
  console.log(`\n${pc.bold(pc.cyan(`${stepNo}. ${title}`))}`);
};
export const info = (k: string, v: string) => console.log(`   ${pc.dim(k.padEnd(18))} ${v}`);
export const good = (msg: string) => console.log(`   ${pc.green("✓")} ${msg}`);
export const bad = (msg: string) => console.log(`   ${pc.red("✗")} ${msg}`);
export const chain = (msg: string) => console.log(`   ${pc.magenta("⛓")} ${msg}`);
export const note = (msg: string) => console.log(`   ${pc.dim(msg)}`);
export const banner = (title: string, sub: string) => {
  console.log(`\n${pc.bold(pc.bgBlue(` ${title} `))} ${pc.dim(sub)}`);
};
export const tx = (hash: string) =>
  `${pc.dim("tx")} ${hash.slice(0, 8)}… ${pc.dim(`https://stellar.expert/explorer/testnet/tx/${hash}`)}`;

export type Health = { ok: boolean; chainMode: "mock" | "stellar"; latestLedger: number };

export async function apiHealth(): Promise<Health | null> {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as Health) : null;
  } catch {
    return null;
  }
}

/** 402 yanıtından channel şartlarını okur (satıcının ilan ettiği fiyat ve kanal kontratı). */
export async function requirementsFor(url: string) {
  const res = await fetch(url, { method: url.endsWith("/chat") ? "POST" : "GET" });
  if (res.status !== 402) return null;
  const body = (await res.json()) as { accepts?: Array<Record<string, unknown>> };
  const r = body.accepts?.find((a) => a.scheme === "channel");
  return r
    ? {
        amount: BigInt(String(r.amount)),
        unit: String(r.unit),
        network: String(r.network),
        payTo: String(r.payTo),
        channelContract: String((r.extra as Record<string, unknown>).channelContract),
        sliceSeconds: Number((r.extra as Record<string, unknown>).sliceSeconds ?? 0),
        sliceTokens: Number((r.extra as Record<string, unknown>).sliceTokens ?? 0),
      }
    : null;
}

export function setup() {
  const d = loadDeployment();
  const s = loadSecrets();
  return { deployment: d, secrets: s, agentKey: Keypair.fromSecret(s.AGENT_SECRET) };
}

export async function makeAccount() {
  const { deployment: d, agentKey } = setup();
  const relayer = await loadRelayer();
  const account = new ReinkeyAccount({
    rpcUrl: d.rpcUrl,
    networkPassphrase: d.networkPassphrase,
    accountId: d.demoAccountId,
    channelContractId: d.channelContractId,
    usdcContractId: d.usdcContractId,
    agent: agentKey,
    relayer,
    dexRouterId: d.dexRouterId,
    xlmContractId: d.xlmContractId,
  });
  return { account, deployment: d, relayer };
}

/**
 * Zincirden gelen reddi panele bildirir. Kod ajandan gönderilir: RPC,
 * başarısız bir işlemin sonucunda kontrat kodunu vermiyor (yalnızca
 * simülasyonda görünüyor), backend de tanı olaylarını taramak zorunda kalmasın.
 */
export async function report(body: Record<string, unknown>) {
  try {
    const r = await fetch(`${API}/v1/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Zincir reddini yakalar, ekrana ve panele yazar. */
export async function expectRejection(
  label: string,
  fn: () => Promise<unknown>,
  ctx: { account: string },
): Promise<string | null> {
  try {
    await fn();
    bad(`${label}: BEKLENMEDİK ŞEKİLDE KABUL EDİLDİ`);
    return null;
  } catch (e) {
    const code = chainReason(e);
    const hash = e instanceof SorobanCallError ? e.txHash : undefined;
    if (!code) {
      bad(`${label}: ${(e as Error).message.slice(0, 160)}`);
      return null;
    }
    chain(`${label} → ${pc.bold(pc.red(code))} ${pc.dim("(red sunucudan değil, zincirden)")}`);
    if (hash) {
      note(`   ${tx(hash)}`);
      await report({ account: ctx.account, tx: hash, code });
    }
    return code;
  }
}
