"use client";

/** Bir satıcının son makbuzları: GET /receipts?payee=…, görünüm açıkken 10 sn'de bir. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { Receipt } from "./types";

export function useReceipts(payee: string | null, active: boolean, limit = 8) {
  const [data, setData] = useState<{ signer: string; receipts: Receipt[] } | null>(null);

  useEffect(() => {
    if (!active || !payee) return;
    const ctrl = new AbortController();
    let stopped = false;
    const load = async () => {
      const d = await getJson<{ signer: string; receipts: Receipt[] }>(
        `/receipts?payee=${payee}&limit=${limit}`,
        ctrl.signal,
      );
      if (d && !stopped) setData(d);
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [payee, active, limit]);

  return data;
}
