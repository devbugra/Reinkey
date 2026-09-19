/**
 * Deploy bilgileri: `deployments/testnet.json` (açık) ve
 * `deployments/.secrets.env` (gizli). Yalnızca Node'da kullanılır.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Deployment = {
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  channelContractId: string;
  usdcContractId: string;
  usdcDecimals: number;
  demoAccountId: string;
  facilitatorPublicKey: string;
  sellerPublicKey: string;
  agentOwnerPublicKey: string;
  agentPublicKey: string;
  dexRouterId?: string;
  xlmContractId?: string;
  [k: string]: unknown;
};

export type Secrets = Record<string, string>;

/** Bulunduğu dizinden yukarı çıkarak `deployments/testnet.json` dosyasını arar. */
export function findDeploymentsDir(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "deployments", "testnet.json");
    if (existsSync(candidate)) return join(dir, "deployments");
    const up = dirname(dir);
    if (up === dir) throw new Error("deployments/testnet.json bulunamadı");
    dir = up;
  }
}

export function loadDeployment(dir = findDeploymentsDir()): Deployment {
  return JSON.parse(readFileSync(join(dir, "testnet.json"), "utf8")) as Deployment;
}

export function loadSecrets(dir = findDeploymentsDir()): Secrets {
  const path = join(dir, ".secrets.env");
  if (!existsSync(path)) return {};
  const out: Secrets = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
