#!/usr/bin/env node
/**
 * @reinkey/mcp — ücretli araç çağrıları (stdio MCP sunucusu).
 *
 * MCP'de ödeme yoktur; x402'de ise her ödeme ayrı bir zincir işlemidir. Bu
 * sunucu ikisini bir OTURUMLA birleştirir: asistan bir satıcıyla ilk kez
 * konuştuğunda tek zincir işlemiyle oturum (kanal) açılır, sonraki her araç
 * çağrısı imzalı bir kuponla HTTP hızında ödenir. Bütçe sunucuda değil,
 * ajanın Reinkey hesabında, zincirde yazılıdır: asistan ne isterse istesin
 * hesabın politikası dışına çıkamaz.
 *
 * Ortam: REINKEY_API (facilitator), REINKEY_ACCOUNT (C…), AGENT_SECRET (S…),
 * RELAYER_SECRET (S…, işlem ücretini ödeyen hesap). İsteğe bağlı:
 * REINKEY_SESSION_DEPOSIT (taban birim, varsayılan 100000 = 0,01 USDC).
 *
 * stdout MCP'nin kanalıdır: günlükler yalnızca stderr'e yazılır.
 */
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Keypair } from "@stellar/stellar-sdk";
import { z } from "zod";
import { ChannelSigner, ReinkeyAccount, chainReason, pickChannelRequirement, streamPaid, x402Fetch } from "@reinkey/sdk";

const API = (process.env.REINKEY_API ?? "http://localhost:3000").replace(/\/$/, "");
const DEPOSIT = BigInt(process.env.REINKEY_SESSION_DEPOSIT ?? 100_000);
const SCALE = 10_000_000n;

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) {
    console.error(`[reinkey-mcp] ${name} is required`);
    process.exit(1);
  }
  return v;
};

const usdc = (v: bigint | string): string => {
  const n = BigInt(v);
  const frac = (n % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${n / SCALE}${frac ? `.${frac}` : ""}`;
};

type Info = {
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  explorerTxBase: string;
  channelContract: string;
  usdc: string;
  xlm: string | null;
  dexRouter: string | null;
};

/** Bir satıcıyla açık oturum: kanal + kupon imzalayıcı + sayaçlar. */
type Session = { payee: string; channelId: bigint; signer: ChannelSigner; deposit: bigint; openTx: string; payments: number };

const info = (await (await fetch(`${API}/demo/info`)).json()) as Info;
const account = new ReinkeyAccount({
  rpcUrl: info.rpcUrl,
  networkPassphrase: info.networkPassphrase,
  accountId: need("REINKEY_ACCOUNT"),
  channelContractId: info.channelContract,
  usdcContractId: info.usdc,
  agent: Keypair.fromSecret(need("AGENT_SECRET")),
  relayer: Keypair.fromSecret(need("RELAYER_SECRET")),
  dexRouterId: info.dexRouter ?? undefined,
  xlmContractId: info.xlm ?? undefined,
});

const sessions = new Map<string, Session>();
const totals = { payments: 0, chainTx: 0, paid: 0n };

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/** Zincir ya da facilitator reddini asistanın açıklayabileceği biçime çevirir; istisna fırlatmaz. */
const rejected = (e: unknown, action: string) => {
  const code = chainReason(e) ?? (e as { code?: string })?.code ?? null;
  return text({
    ok: false,
    action,
    rejectedBy: code ? "stellar (the account's on-chain policy)" : "error",
    code,
    detail: code ? undefined : String((e as Error)?.message ?? e).slice(0, 300),
    note: code ? "The account owner set this limit on-chain. It cannot be bypassed from here; tell the user." : undefined,
  });
};

/** 402 şartlarını okur; ücretli değilse null. */
async function requirement(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status !== 402) return { free: res };
  const req = pickChannelRequirement((await res.json()) as Parameters<typeof pickChannelRequirement>[0]);
  if (!req) throw new Error("The resource does not offer the x402 `channel` scheme");
  return { req };
}

/** Satıcıyla oturum yoksa ya da depozito yetmiyorsa tek zincir işlemiyle açar. */
async function sessionFor(payee: string, price: bigint): Promise<Session> {
  const existing = sessions.get(payee);
  if (existing && existing.deposit - existing.signer.current >= price) return existing;
  const deposit = price * 20n > DEPOSIT ? price * 20n : DEPOSIT;
  const secret = randomBytes(32);
  const opened = await account.openChannel({ payee, deposit, voucherSecret: secret, ttlLedgers: 720 });
  totals.chainTx += 1;
  const s: Session = {
    payee,
    channelId: opened.channelId,
    deposit,
    openTx: opened.tx,
    payments: 0,
    signer: new ChannelSigner({
      networkPassphrase: info.networkPassphrase,
      channelContract: info.channelContract,
      channelId: opened.channelId,
      secret,
      deposit,
    }),
  };
  sessions.set(payee, s);
  console.error(`[reinkey-mcp] session #${s.channelId} → ${payee.slice(0, 6)}… deposit ${usdc(deposit)} USDC`);
  return s;
}

const server = new McpServer({ name: "reinkey", version: "0.1.0" });

server.registerTool(
  "reinkey_discover",
  {
    title: "Discover paid resources",
    description:
      "List paid HTTP resources (APIs, data streams) that can be bought with reinkey_call or reinkey_stream. Prices are in USDC; unit is request, second or token.",
    inputSchema: { query: z.string().optional().describe("Filter by text in the URL or description") },
  },
  async ({ query }) => {
    const cat = (await (await fetch(`${API}/discovery/resources?limit=100`)).json()) as {
      items: { resource: string; metadata: { description?: string; unit?: string; price?: string; method?: string; payments?: number } }[];
    };
    const q = query?.toLowerCase();
    const items = cat.items
      .filter((i) => !q || i.resource.toLowerCase().includes(q) || (i.metadata.description ?? "").toLowerCase().includes(q))
      .map((i) => ({
        url: i.resource,
        method: i.metadata.method ?? "GET",
        description: i.metadata.description ?? "",
        price: `${usdc(i.metadata.price ?? "0")} USDC per ${i.metadata.unit ?? "request"}`,
        tool: i.metadata.unit === "request" ? "reinkey_call" : "reinkey_stream",
        timesPaid: i.metadata.payments ?? 0,
      }));
    return text({ resources: items });
  },
);

server.registerTool(
  "reinkey_call",
  {
    title: "Paid request",
    description:
      "Call a paid HTTP resource once and pay for it from the session with its seller. Opens the session (one Stellar transaction) on first use; later calls are paid off-chain with a signed voucher. Returns the response and what was paid.",
    inputSchema: {
      url: z.string().url(),
      method: z.enum(["GET", "POST"]).default("GET"),
      body: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async ({ url, method, body }) => {
    try {
      const probe = await requirement(url, method, body);
      if ("free" in probe && probe.free) return text({ ok: true, paid: "0", note: "not a paid resource", status: probe.free.status, body: (await probe.free.text()).slice(0, 4000) });
      const req = probe.req!;
      const s = await sessionFor(req.payTo, BigInt(req.amount));
      const { res, receipt, paid } = await x402Fetch(url, {
        signer: s.signer,
        network: info.network,
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        s.payments += 1;
        totals.payments += 1;
        totals.paid += paid;
      }
      const receiptId = (receipt as unknown as { receipt?: { id?: string } } | null)?.receipt?.id;
      return text({
        ok: res.ok,
        status: res.status,
        body: (await res.text()).slice(0, 4000),
        paid: `${usdc(paid)} USDC`,
        session: { id: s.channelId.toString(), spent: `${usdc(s.signer.current)} / ${usdc(s.deposit)} USDC`, payments: s.payments },
        receipt: receiptId ? `${API}/receipts/${receiptId}/verify` : null,
      });
    } catch (e) {
      return rejected(e, "reinkey_call");
    }
  },
);

server.registerTool(
  "reinkey_stream",
  {
    title: "Paid stream",
    description:
      "Consume a per-second or per-token paid stream for a bounded time and pay only for what was delivered. Returns the last events and the amount paid.",
    inputSchema: {
      url: z.string().url(),
      seconds: z.number().int().min(1).max(60).default(5).describe("Stop after this many seconds"),
      method: z.enum(["GET", "POST"]).default("GET"),
      body: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async ({ url, seconds, method, body }) => {
    try {
      const probe = await requirement(url, method, body);
      if ("free" in probe && probe.free) return text({ ok: false, note: "not a paid stream", status: probe.free.status });
      const req = probe.req!;
      const slice = BigInt((req.extra as { sliceAmount?: string } | undefined)?.sliceAmount ?? req.amount);
      const s = await sessionFor(req.payTo, slice * BigInt(seconds));
      const events: unknown[] = [];
      const ctrl = new AbortController();
      const stop = setTimeout(() => ctrl.abort(), seconds * 1000);
      const before = s.signer.current;
      const result = await streamPaid({
        url,
        signer: s.signer,
        network: info.network,
        method,
        body,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (e.type === "tick" || e.type === "token") events.push(e.data);
        },
      });
      clearTimeout(stop);
      const paid = s.signer.current - before;
      const vouchers = result.vouchers;
      s.payments += vouchers;
      totals.payments += vouchers;
      totals.paid += paid;
      return text({
        ok: true,
        events: events.length,
        last: events.slice(-5),
        paid: `${usdc(paid)} USDC`,
        payments: vouchers,
        session: { id: s.channelId.toString(), spent: `${usdc(s.signer.current)} / ${usdc(s.deposit)} USDC` },
      });
    } catch (e) {
      return rejected(e, "reinkey_stream");
    }
  },
);

server.registerTool(
  "reinkey_quote",
  {
    title: "Exchange quote",
    description:
      "Free. Quote a USDC/XLM trade on Stellar liquidity: output, price impact, suggested minimum, and whether this account's on-chain policy would accept the trade.",
    inputSchema: { side: z.enum(["USDC_XLM", "XLM_USDC"]), amount: z.string().regex(/^\d+(\.\d{1,7})?$/).describe("Amount to sell, e.g. 0.5") },
  },
  async ({ side, amount }) => {
    const base = toBase(amount);
    const q = await (await fetch(`${API}/dex/quote?side=${side}&amountIn=${base}&account=${account.o.accountId}`)).json();
    return text(q);
  },
);

server.registerTool(
  "reinkey_swap",
  {
    title: "Trade on the exchange",
    description:
      "Execute a USDC/XLM trade from the account, with mandatory slippage protection. One Stellar transaction. The account's on-chain policy decides; a rejection returns its reason code.",
    inputSchema: { side: z.enum(["USDC_XLM", "XLM_USDC"]), amount: z.string().regex(/^\d+(\.\d{1,7})?$/) },
  },
  async ({ side, amount }) => {
    try {
      if (!info.xlm) return text({ ok: false, note: "exchange is not configured on this facilitator" });
      const base = toBase(amount);
      const q = (await (await fetch(`${API}/dex/quote?side=${side}&amountIn=${base}&account=${account.o.accountId}`)).json()) as {
        minOut?: string;
        policy?: { allowed: boolean; code: string | null; message: string | null };
      };
      if (q.policy && !q.policy.allowed) return text({ ok: false, rejectedBy: "policy pre-check (no fee spent)", code: q.policy.code, detail: q.policy.message });
      const path: [string, string] = side === "USDC_XLM" ? [info.usdc, info.xlm] : [info.xlm, info.usdc];
      const r = await account.swap({ amountIn: base, minOut: BigInt(q.minOut ?? "1"), path });
      totals.chainTx += 1;
      return text({ ok: true, sold: amount, received: usdc(r.amounts[r.amounts.length - 1] ?? 0n), tx: `${info.explorerTxBase}${r.tx}` });
    } catch (e) {
      return rejected(e, "reinkey_swap");
    }
  },
);

server.registerTool(
  "reinkey_budget",
  {
    title: "Budget and sessions",
    description: "Free. The account's on-chain limits, what is left today, open sessions, and this conversation's totals (payments vs. chain transactions).",
    inputSchema: {},
  },
  async () => {
    const [policy, spent, frozen, balance] = await Promise.all([account.getPolicy(), account.getSpent(), account.isFrozen(), account.usdcBalance()]);
    return text({
      account: account.o.accountId,
      frozen,
      balance: `${usdc(balance)} USDC`,
      perTransactionCap: `${usdc(policy.perTxCap)} USDC`,
      dailyCap: `${usdc(policy.dailyCap)} USDC`,
      spentToday: `${usdc(spent.amount)} USDC`,
      allowedPayees: policy.payees,
      sessions: [...sessions.values()].map((s) => ({
        id: s.channelId.toString(),
        seller: s.payee,
        spent: `${usdc(s.signer.current)} / ${usdc(s.deposit)} USDC`,
        payments: s.payments,
        opened: `${info.explorerTxBase}${s.openTx}`,
      })),
      thisConversation: { payments: totals.payments, chainTransactions: totals.chainTx, paid: `${usdc(totals.paid)} USDC` },
    });
  },
);

function toBase(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(7, "0"));
}

await server.connect(new StdioServerTransport());
console.error(`[reinkey-mcp] ready · ${info.network} · account ${account.o.accountId.slice(0, 6)}… · facilitator ${API}`);
