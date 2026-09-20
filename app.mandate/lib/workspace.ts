"use client";

/**
 * ÇALIŞMA ALANLARI — "bu konsolda kimim?"
 *
 * Kayıt yok, parola yok, sunucu tarafında hesap yok: ürünün tezi bu. Konsol bir
 * ADRES İZLEYİCİSİDİR. Kullanıcı kendi adresini ekler, tarayıcısında saklanır
 * (localStorage) ve bir daha sormayız. Hiçbir şey sunucuya gitmez.
 *
 * Tek gerçek kaynak URL'dir: seçilen alan adrese yazılır, böylece her görünüm
 * paylaşılabilir bir bağlantıdır. localStorage yalnızca "kayıtlı adreslerim" ve
 * "en son hangisindeydim" bilgisini tutar.
 */
import { useCallback, useState } from "react";

export type Role = "seller" | "agent";

export type Profile = {
  id: string;
  role: Role;
  address: string;
  label: string;
};

const KEY = "reinkey.profiles";
const ONBOARDED = "reinkey.onboarded";

function read(): Profile[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Profile[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && p.address && p.role) : [];
  } catch {
    return [];
  }
}

function write(list: Profile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* depolama kapalı: alanlar yalnızca bu sekmede yaşar */
  }
}

/** localStorage yalnızca tarayıcıda var; ilk render'da tek seferde okunur. */
function initial(): { profiles: Profile[]; onboarded: boolean } {
  if (typeof window === "undefined") return { profiles: [], onboarded: true };
  const profiles = read();
  let seen = false;
  try {
    seen = localStorage.getItem(ONBOARDED) === "1";
  } catch {
    /* depolama kapalı: karşılama her açılışta gösterilir */
  }
  return { profiles, onboarded: seen || profiles.length > 0 };
}

export function useWorkspaces() {
  const [{ profiles, onboarded }, setState] = useState(initial);
  const setProfiles = useCallback(
    (fn: (prev: Profile[]) => Profile[]) => setState((s) => ({ ...s, profiles: fn(s.profiles) })),
    [],
  );
  const setOnboarded = useCallback((v: boolean) => setState((s) => ({ ...s, onboarded: v })), []);

  const add = useCallback((p: Omit<Profile, "id">) => {
    const profile: Profile = { ...p, id: `${p.role}:${p.address}` };
    setProfiles((prev) => {
      const next = [profile, ...prev.filter((x) => x.id !== profile.id)];
      write(next);
      return next;
    });
    try {
      localStorage.setItem(ONBOARDED, "1");
    } catch {
      /* yoksay */
    }
    setOnboarded(true);
    return profile;
  }, [setOnboarded, setProfiles]);

  const remove = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((x) => x.id !== id);
      write(next);
      return next;
    });
  }, [setProfiles]);

  /** Karşılama ekranını bir daha gösterme (demoya bakmayı seçtiyse de). */
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED, "1");
    } catch {
      /* yoksay */
    }
    setOnboarded(true);
  }, [setOnboarded]);

  return { profiles, add, remove, onboarded, dismiss };
}
