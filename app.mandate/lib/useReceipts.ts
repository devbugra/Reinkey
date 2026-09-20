"use client";

/** Bir satıcının son makbuzları: GET /receipts?payee=…, görünüm açıkken 10 sn'de bir. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { Receipt } from "./types";

export function useReceipts(payee: string | null, active: boolean, limit = 8) {
  const [data, setData] = useState<{ signer: string; receipts: Receipt[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active || !payee) return;
    const ctrl = new AbortController();
    let stopped = false;
    const load = async () => {
      const d = await getJson<{ signer: string; receipts: Receipt[] }>(
        `/receipts?payee=${payee}&limit=${limit}`,
        ctrl.signal,
      );
      if (stopped) return;
      if (d) setData(d);
      setFailed(!d);
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [payee, active, limit, nonce]);

  return { data, failed: failed && !data, retry: () => setNonce((n) => n + 1) };
}
