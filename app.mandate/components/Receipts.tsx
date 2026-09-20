"use client";

/**
 * İMZALI MAKBUZLAR. Her ödeme "ne için" ödendiğini taşıyan, facilitator'ın
 * anahtarıyla imzalanmış bir belge üretir. Doğrulama tarayıcıda, bu sayfada
 * yapılır: imzalayanın açık anahtarıyla ed25519 kontrolü. Sunucuya "bu doğru mu"
 * diye sorulmaz; sorulsaydı kanıt olmazdı.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, ShieldX } from "lucide-react";
import { getJson } from "@/lib/api";
import { env } from "@/lib/env";
import { clock, shortAddr, usdc } from "@/lib/format";
import { useReceipts } from "@/lib/useReceipts";
import type { Receipt } from "@/lib/types";
import { Empty, Panel, cn } from "./ui";

const FIELDS = ["v", "network", "signer", "channelId", "payer", "payee", "resource", "method", "unit", "amount", "cumulative", "requestHash", "ts"] as const;

/** backend/src/audit/receipt.ts ile birebir aynı kanonik biçim. */
function canonical(r: Receipt): Uint8Array {
  const body = FIELDS.map((f) => `${f}=${r[f] ?? ""}`).join("\n");
  return new TextEncoder().encode(`reinkey-receipt/1\n${body}\n`);
}

/** WebCrypto ArrayBuffer ister; Uint8Array görünümünü kopyalayarak veririz. */
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

/**
 * Stellar G-adresi (strkey) → ham ed25519 açık anahtarı. Base32 çözülür, sürüm
 * baytı ve CRC16 atılır; WebCrypto ham 32 bayt ister.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function publicKeyBytes(address: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of address) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out.slice(1, 33));
}

/**
 * Ed25519 her tarayıcıda yok (Safari). Desteklenmiyorsa sunucunun doğrulama ucuna
 * düşülür ve bunun "sunucunun sözü" olduğu ekranda söylenir.
 */
async function verify(r: Receipt): Promise<"ok" | "bad" | "server-ok" | "server-bad"> {
  try {
    const key = await crypto.subtle.importKey("raw", buf(publicKeyBytes(r.signer)), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, buf(hex(r.signature)), buf(canonical(r)));
    return ok ? "ok" : "bad";
  } catch {
    const res = await getJson<{ valid: boolean }>(`/receipts/${r.id}/verify`);
    return res?.valid ? "server-ok" : "server-bad";
  }
}

function Row({ r }: { r: Receipt }) {
  const t = useTranslations("receipts");
  const [state, setState] = useState<"idle" | "checking" | "ok" | "bad" | "server-ok" | "server-bad">("idle");
  const path = (() => {
    try {
      return new URL(r.resource).pathname;
    } catch {
      return r.resource;
    }
  })();

  return (
    <li className="grid gap-2 px-5 py-3.5">
      <p className="tabular flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{usdc(r.amount)} USDC</span>
        <span className="font-mono text-xs text-fg-muted">
          {r.method} {path}
        </span>
        <span className="ml-auto text-[11px] text-fg-subtle">{clock(r.ts)}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
        <span title={t("idTitle")}>#{r.id.slice(0, 10)}…</span>
        <span title={t("requestTitle")}>{t("request", { hash: r.requestHash?.slice(0, 8) ?? "—" })}</span>
        <span title={t("responseTitle")}>
          {r.responseHash ? t("response", { hash: r.responseHash.slice(0, 8) }) : t("noCommit")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setState("checking");
              void verify(r).then(setState, () => setState("bad"));
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-sans text-[11px] transition-colors",
              (state === "ok" || state === "server-ok") && "border-success/40 bg-success-bg text-success",
              (state === "bad" || state === "server-bad") && "border-danger/40 bg-danger-bg text-danger",
              (state === "idle" || state === "checking") && "border-line-strong text-fg-muted hover:text-fg",
            )}
          >
            {state === "ok" || state === "server-ok" ? (
              <BadgeCheck className="size-3.5" aria-hidden="true" />
            ) : state === "bad" || state === "server-bad" ? (
              <ShieldX className="size-3.5" aria-hidden="true" />
            ) : null}
            {state === "ok"
              ? t("valid")
              : state === "server-ok"
                ? t("validServer")
                : state === "bad" || state === "server-bad"
                  ? t("invalid")
                  : state === "checking"
                    ? t("checking")
                    : t("verify")}
          </button>
          <a href={`${env.apiUrl}/receipts/${r.id}`} target="_blank" rel="noreferrer" className="font-sans text-[11px] hover:text-fg">
            {t("raw")}
          </a>
        </span>
      </p>
    </li>
  );
}

export function Receipts({ payee, active }: { payee: string | null; active: boolean }) {
  const t = useTranslations("receipts");
  const data = useReceipts(payee, active);

  return (
    <Panel
      title={t("title")}
      hint={t("hint")}
      action={
        data?.signer ? (
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle" title={t("signerTitle")}>
            {t("signer", { address: shortAddr(data.signer, 4, 4) })}
          </span>
        ) : null
      }
    >
      {!data ? (
        <Empty>{t("loading")}</Empty>
      ) : data.receipts.length === 0 ? (
        <Empty>{t("empty")}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.receipts.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-fg-subtle">{t("note")}</p>
        </>
      )}
    </Panel>
  );
}
