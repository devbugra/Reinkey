"use client";

/** Reinkey Float verisi: GET /float, görünüm açıkken 5 sn'de bir. Zincire yazılmaz. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { FloatOverview } from "./types";

const POLL_MS = 5000;

export function useFloat(active: boolean) {
  const [data, setData] = useState<FloatOverview | null>(null);
  const [failed, setFailed] = useState(false);
  /** Zincire yazan bir işlemden sonra elle tazeleme. */
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    let stopped = false;
    const load = async () => {
      const d = await getJson<FloatOverview>("/float", ctrl.signal);
      if (stopped) return;
      if (d) setData(d);
      setFailed(!d);
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [active, nonce]);

  return { data, failed, refresh: () => setNonce((n) => n + 1) };
}
