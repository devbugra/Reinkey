"use client";

/**
 * Konsolun adres çubuğundaki durumu: hangi görünüm, hangi hesap, hangi satıcı.
 * URL'de durur ki bir görünüm bağlantı olarak paylaşılabilsin:
 *   /?view=meter&seller=G…   /?view=reins&account=C…   /?view=float
 * Adres verilmezse backend'in demo hesabı ve demo satıcısı gösterilir.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type View = "live" | "meter" | "reins" | "float" | "dex";
export type ViewState = { view: View; account: string | null; seller: string | null };

const VIEWS: View[] = ["live", "meter", "reins", "float", "dex"];
/** Stellar adresi: G… (hesap) ya da C… (kontrat), 56 karakter base32. */
export const isAddress = (v: string) => /^[GC][A-Z2-7]{55}$/.test(v);

function read(): ViewState {
  const q = new URLSearchParams(window.location.search);
  const view = q.get("view") as View | null;
  const addr = (k: string) => {
    const v = q.get(k);
    return v && isAddress(v) ? v : null;
  };
  return { view: view && VIEWS.includes(view) ? view : "live", account: addr("account"), seller: addr("seller") };
}

export function useView() {
  const [state, setState] = useState<ViewState>(read);
  const current = useRef(state);

  useEffect(() => {
    const onPop = () => {
      current.current = read();
      setState(current.current);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<ViewState>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    const q = new URLSearchParams();
    if (next.view !== "live") q.set("view", next.view);
    if (next.account) q.set("account", next.account);
    if (next.seller) q.set("seller", next.seller);
    const qs = q.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
    setState(next);
  }, []);

  return [state, update] as const;
}
