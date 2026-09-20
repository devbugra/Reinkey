"use client";

/** Satıcı gelir raporu: GET /sellers/:payTo/revenue, görünüm açıkken 10 sn'de bir. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { RevenueReport } from "./types";

export function useRevenue(payTo: string | null, active: boolean, bucket: "hour" | "day") {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active || !payTo) return;
    const ctrl = new AbortController();
    let stopped = false;
    const load = async () => {
      const d = await getJson<RevenueReport>(`/sellers/${payTo}/revenue?bucket=${bucket}`, ctrl.signal);
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
  }, [payTo, active, bucket, nonce]);

  // Başka bir satıcıya geçildiğinde eski satıcının raporu gösterilmesin.
  const mine = data && data.payTo === payTo ? data : null;
  return { data: mine, failed: failed && !mine, retry: () => setNonce((n) => n + 1) };
}
