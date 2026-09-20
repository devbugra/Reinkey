"use client";

/** Satıcı gelir raporu: GET /sellers/:payTo/revenue, görünüm açıkken 10 sn'de bir. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { RevenueReport } from "./types";

export function useRevenue(payTo: string | null, active: boolean, bucket: "hour" | "day") {
  const [data, setData] = useState<RevenueReport | null>(null);

  useEffect(() => {
    if (!active || !payTo) return;
    const ctrl = new AbortController();
    let stopped = false;
    const load = async () => {
      const d = await getJson<RevenueReport>(`/sellers/${payTo}/revenue?bucket=${bucket}`, ctrl.signal);
      if (d && !stopped) setData(d);
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [payTo, active, bucket]);

  // Başka bir satıcıya geçildiğinde eski satıcının raporu gösterilmesin.
  return data && data.payTo === payTo ? data : null;
}
