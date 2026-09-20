"use client";

/** Borsa kotasyonu: tutar değişince 400 ms bekleyip GET /dex/quote çağırır. */
import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { DexQuote, DexSide } from "./types";

export function useQuote(params: { side: DexSide; amountIn: bigint | null; account: string | null; slippageBps: number }) {
  const [quote, setQuote] = useState<DexQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const { side, amountIn, account, slippageBps } = params;

  const active = !!amountIn && amountIn > 0n;

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    let stopped = false;
    // Yazarken her tuşta zincire gitmemek için kısa bir bekleme.
    const t = setTimeout(async () => {
      setLoading(true);
      const q = new URLSearchParams({ side, amountIn: amountIn.toString(), slippageBps: String(slippageBps) });
      if (account) q.set("account", account);
      const d = await getJson<DexQuote>(`/dex/quote?${q}`, ctrl.signal);
      if (stopped) return;
      setQuote(d);
      setError(!d);
      setLoading(false);
    }, 400);
    return () => {
      stopped = true;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [active, side, amountIn, account, slippageBps]);

  // Tutar silindiğinde eski kotasyon gösterilmez; durum etkide değil burada türetilir.
  return active ? { quote, loading, error } : { quote: null, loading: false, error: false };
}
