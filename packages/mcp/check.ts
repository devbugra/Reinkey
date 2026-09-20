/**
 * UÇTAN UCA DOĞRULAMA: gerçek bir MCP istemcisi sunucuyu stdio üzerinden başlatır,
 * testnet'te oturum açtırır, ücretli çağrı/akış yapar ve politikanın reddini görür.
 * Çalıştırma: pnpm --filter @reinkey/mcp exec tsx check.ts
 */
const API = process.env.API_URL ?? "http://localhost:3000";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = (f: string) => Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const sec = env(`${root}/deployments/.secrets.env`), rel = env(`${root}/agents/.relayer.env`);
const dep = JSON.parse(readFileSync(`${root}/deployments/testnet.json`, "utf8"));
const t = new StdioClientTransport({ command: "npx", args: ["tsx", `${root}/packages/mcp/src/index.ts`], env: { ...process.env as Record<string,string>, REINKEY_API: API, REINKEY_ACCOUNT: dep.demoAccountId, AGENT_SECRET: sec.AGENT_SECRET, RELAYER_SECRET: rel.RELAYER_SECRET }, stderr: "inherit" });
const c = new Client({ name: "check", version: "0" }); await c.connect(t);
console.log("tools:", (await c.listTools()).tools.map((x) => x.name).join(", "));
const call = async (name: string, args: Record<string, unknown>) => { const r = await c.callTool({ name, arguments: args }, undefined, { timeout: 120000 }); const txt = (r.content as { text: string }[])[0].text; console.log(`\n## ${name}`, JSON.stringify(args), "\n" + txt.slice(0, 700)); return JSON.parse(txt); };
await call("reinkey_discover", {});
for (let i = 0; i < 3; i++) await call("reinkey_call", { url: `${API}/demo/book` });
await call("reinkey_swap", { side: "USDC_XLM", amount: "10" }); // tavanın üstünde: reddedilmeli
await call("reinkey_stream", { url: `${API}/demo/ticker/stream`, seconds: 6 });
await call("reinkey_budget", {});
await c.close();
