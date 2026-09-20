"use client";

/**
 * Panelin veri kaynağı: YALNIZCA gerçek backend.
 *
 * Panelde üretilmiş ya da örnek veri yoktur. Backend'e ulaşılamıyorsa panel
 * boş kalır ve bunu açıkça söyler; hiçbir sayı uydurulmaz.
 *
 *  - GET /events          SSE; bağlanınca son 200 olay, sonra canlı akış
 *  - GET /stats           2 sn'de bir; sayaçların kaynağı
 *  - GET /demo/info       demo hesabı, satıcı, fiyatlar, explorer adresi
 *  - GET /channels        açılışta bilinen kanallar (yayın penceresinden eskiler dahil)
 *  - GET /accounts/:addr  3 sn'de bir; zincirdeki politika, harcama, bakiye
 *  - GET /demo/agent      ajan süreci çalışıyor mu
 *
 * Olaylar tampona alınır ve 100 ms'de bir tek paket olarak işlenir. Yeniden
 * bağlanınca tekrar gelen olaylar kimliklerinden ayıklanır.
 *
 * "Ekranı temizle" bir kesim noktası koyar: o andan eski olaylar gösterilmez ve
 * sayaçlar o anki /stats değerinden farkla hesaplanır. Veri silinmez; "Tümünü
 * göster" kesimi kaldırır ve akışa yeniden bağlanır.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getJson, postJson } from "./api";
import { env } from "./env";
import { big } from "./format";
import { t } from "./t";
import { initialState, median, reducer, type Local } from "./store";
import {
  EVENT_TYPES,
  type AccountSnapshot,
  type AgentStatus,
  type ChannelSnapshot,
  type ClaimResult,
  type DemoInfo,
  type FeedEvent,
  type Scenario,
  type Stats,
} from "./types";

export type Connection = "connecting" | "live" | "offline";

/** Hesabın okunma durumu: "yok" ile "okunamadı" aynı şey değildir. */
export type AccountStatus = "loading" | "found" | "missing" | "error";

const FLUSH_MS = 100;
const STATS_MS = 2000;
const ACCOUNT_MS = 3000;
// Ücretsiz katmanda uyuyan bir servis 4 sn'de uyanmaz: erken "ulaşılamıyor" demeyelim.
const OFFLINE_AFTER_MS = 20_000;
// Yeniden bağlanmada son 200 olay tekrar gelir; küme bundan çok daha geniş
// tutulur ki uzun oturumda eski kimlikler düşüp olaylar iki kez sayılmasın.
const MAX_SEEN = 50_000;
const CUT_KEY = "reinkey.cut";

/** Kesim noktası: bu andan (sunucu saatiyle) eski olaylar gösterilmez. */
type Cut = { ts: string; base: Stats };

/** /stats yanıtı ve o yanıt geldiği andaki yerel sayaçlar (aradaki farkı anlık göstermek için). */
type StatsAt = { data: Stats; at: Pick<Local, "vouchersAccepted" | "vouchersRejected" | "chainTxCount" | "volume"> };

const ZERO_AT: StatsAt["at"] = { vouchersAccepted: 0, vouchersRejected: 0, chainTxCount: 0, volume: 0n };

/** Panelin gösterdiği sayaçlar: /stats + son sorgudan beri akıştan gelenler − kesim anındaki değer. */
export type Totals = {
  payments: number;
  rejected: number;
  txs: number;
  volume: bigint;
  exactTx: number;
  exactSeconds: number;
  latencyMs: number;
  /** true: sayaçlar yalnızca "Ekranı temizle"den sonrasını kapsıyor. */
  scoped: boolean;
};

function readCut(): Cut | null {
  try {
    const raw = sessionStorage.getItem(CUT_KEY);
    return raw ? (JSON.parse(raw) as Cut) : null;
  } catch {
    return null;
  }
}

function writeCut(cut: Cut | null) {
  try {
    if (cut) sessionStorage.setItem(CUT_KEY, JSON.stringify(cut));
    else sessionStorage.removeItem(CUT_KEY);
  } catch {
    /* depolama kapalı: kesim yalnızca bu sayfa açıkken geçerli */
  }
}

/**
 * @param accountOverride Konsolda başka bir Reinkey hesabına bakılıyorsa adresi;
 *   `null` ise backend'in demo hesabı (`GET /demo/info`) izlenir.
 */
export function useFeed(accountOverride: string | null = null) {
  const [connection, setConnection] = useState<Connection>("connecting");
  const [stats, setStats] = useState<StatsAt | null>(null);
  const [cut, setCut] = useState<Cut | null>(readCut);
  const [epoch, setEpoch] = useState(0);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Durum, ait olduğu adresle birlikte tutulur: adres değişince etki içinde setState
  // çağırmadan kendiliğinden "loading"e düşer.
  const [accountRead, setAccountRead] = useState<{ key: string; status: AccountStatus }>({ key: "", status: "loading" });
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const demoControls = useRef(false);

  const buffer = useRef<FeedEvent[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  const accountAddr = useRef<string | null>(null);
  const cutRef = useRef(cut);
  const localRef = useRef(state.local);
  const lastTs = useRef<string | null>(null);

  useEffect(() => {
    localRef.current = state.local;
    lastTs.current = state.lastEventAt ?? lastTs.current;
  }, [state.local, state.lastEventAt]);

  const push = useCallback((e: FeedEvent) => {
    if (seen.current.has(e.id)) return;
    if (cutRef.current && e.ts <= cutRef.current.ts) return;
    seen.current.add(e.id);
    if (seen.current.size > MAX_SEEN) {
      const first = seen.current.values().next().value;
      if (first !== undefined) seen.current.delete(first);
    }
    buffer.current.push(e);
  }, []);

  // Tamponu boşalt; yayın penceresinden eski kanalların durumunu tamamla.
  useEffect(() => {
    const t = setInterval(() => {
      if (buffer.current.length === 0) return;
      const events = buffer.current;
      buffer.current = [];
      dispatch({ type: "events", events });
      // Olaylar tutarı yalnızca fark olarak taşır; yeniden bağlanınca tekrar gelen
      // tahsilatlar, açılışta yüklenen güncel durumun üstüne bir daha eklenirdi.
      // Bu yüzden kanalın zincirdeki durumunu değiştiren her olaydan sonra gerçek
      // durum backend'den okunur (paket başına kanal başına tek istek).
      const refresh = new Set<string>();
      for (const e of events) {
        if (!("channelId" in e) || !e.channelId) continue;
        const firstSeen = !requested.current.has(e.channelId);
        requested.current.add(e.channelId);
        if (
          (firstSeen && e.type !== "channel.opened") ||
          e.type === "channel.claimed" ||
          e.type === "channel.closed" ||
          e.type === "channel.topped_up"
        ) {
          refresh.add(e.channelId);
        }
      }
      for (const id of refresh) {
        void getJson<ChannelSnapshot>(`/channels/${id}`).then(
          (c) => c && dispatch({ type: "channel.snapshot", channel: c }),
        );
      }
    }, FLUSH_MS);
    return () => clearInterval(t);
  }, []);

  // SSE.
  useEffect(() => {
    const es = new EventSource(`${env.apiUrl}/events`);
    let opened = false;
    const offlineTimer = setTimeout(() => !opened && setConnection("offline"), OFFLINE_AFTER_MS);

    const onEvent = (msg: MessageEvent<string>) => {
      try {
        const e = JSON.parse(msg.data) as FeedEvent;
        if (!e.type && msg.type !== "message") (e as { type: string }).type = msg.type;
        if (e.id && e.type) push(e);
      } catch {
        /* bozuk satır: atla */
      }
    };
    es.onopen = () => {
      opened = true;
      setConnection("live");
    };
    es.onerror = () => {
      // EventSource kendisi yeniden bağlanır; yalnızca durumu gösteriyoruz.
      setConnection(opened && es.readyState !== EventSource.CLOSED ? "connecting" : "offline");
    };
    es.onmessage = onEvent;
    for (const t of EVENT_TYPES) es.addEventListener(t, onEvent as EventListener);

    return () => {
      clearTimeout(offlineTimer);
      es.close();
    };
  }, [push, epoch]);

  // Açılış verisi ve periyodik sorgular.
  useEffect(() => {
    const ctrl = new AbortController();
    let stopped = false;

    const loadInfo = async () => {
      const info = await getJson<DemoInfo>("/demo/info", ctrl.signal);
      if (!info || stopped) return false;
      accountAddr.current = info.account;
      demoControls.current = !!info.demoControls;
      dispatch({ type: "info", info });
      return true;
    };
    const loadChannels = async () => {
      const list = await getJson<ChannelSnapshot[]>("/channels", ctrl.signal);
      if (!list || stopped) return;
      setChannelsLoaded(true);
      for (const c of list) {
        // Temizlenmiş ekranda eski (kapanmış) kanallar geri gelmesin.
        if (cutRef.current && !c.open) continue;
        requested.current.add(c.id);
        dispatch({ type: "channel.snapshot", channel: c });
      }
    };
    const pollStats = async () => {
      const s = await getJson<Stats>("/stats", ctrl.signal);
      if (s && !stopped) setStats({ data: s, at: { ...localRef.current } });
    };
    const pollAccount = async () => {
      if (!accountAddr.current && !(await loadInfo())) return;
      const addr = accountOverride ?? accountAddr.current;
      const key = `${epoch}:${accountOverride ?? ""}`;
      // "Yok" (404) ile "okunamadı" (ağ, 5xx) ayrılır: geçici bir hata hesabı yok saydırmasın.
      const res = await fetch(`${env.apiUrl}/accounts/${addr}`, { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
      if (stopped) return;
      const a = res?.ok ? ((await res.json().catch(() => null)) as (AccountSnapshot & { found?: boolean }) | null) : null;
      if (a && a.found !== false) {
        dispatch({ type: "account", account: a });
        setAccountRead({ key, status: "found" });
      } else if (res && (res.status === 404 || a?.found === false)) {
        // Başka bir adrese bakılırken bulunamayan hesap, örnek hesabın verisiyle karışmasın.
        dispatch({ type: "account", account: null });
        setAccountRead({ key, status: "missing" });
      } else {
        setAccountRead((r) => (r.key === key && r.status === "found" ? r : { key, status: "error" }));
      }
      // Örnek akış kontrolleri kapalıysa bu uç yoktur: 3 sn'de bir 404 üretmeyelim.
      if (!demoControls.current) return;
      const ag = await getJson<AgentStatus>("/demo/agent", ctrl.signal);
      if (ag && !stopped) dispatch({ type: "agent", agent: ag });
    };

    dispatch({ type: "account", account: null });
    void loadInfo().then(() => pollAccount());
    void loadChannels();
    void pollStats();
    const s = setInterval(pollStats, STATS_MS);
    const a = setInterval(pollAccount, ACCOUNT_MS);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(s);
      clearInterval(a);
    };
  }, [epoch, accountOverride]);

  /** Demo kontrolleri: gerçek ajan sürecini başlatır / hesabı zincirde dondurur. */
  const act = useCallback(async (name: string, path: string, body: unknown) => {
    setPending(name);
    setActionError(null);
    const res = await postJson<{ runId?: string; tx?: string } & ClaimResult>(path, body);
    setPending(null);
    if (!res.ok) setActionError(res.error);
    else if (res.data.claimed === false) setActionError(res.data.reason ?? t()("errors.nothingToClaim"));
    return res.ok;
  }, []);

  const runAgent = useCallback(
    (scenario: Scenario) => act(scenario, "/demo/agent/run", { scenario }),
    [act],
  );
  const setFrozen = useCallback(
    (frozen: boolean) => act(frozen ? "freeze" : "unfreeze", "/demo/owner/freeze", { frozen }),
    [act],
  );

  /** Borsa adına elle tahsilat: biriken kuponlar tek zincir işlemiyle tahsil edilir. */
  const claim = useCallback(
    async (channelId: string) => {
      setPendingId(channelId);
      try {
        return await act("claim", `/channels/${channelId}/claim`, {});
      } finally {
        setPendingId(null);
      }
    },
    [act],
  );

  /** Ekranı temizle: şu andan eski olayları gizle, sayaçları bu andan başlat. */
  const clear = useCallback(async () => {
    const base = await getJson<Stats>("/stats");
    if (!base) {
      setActionError(t()("errors.backend"));
      return;
    }
    const next: Cut = { ts: lastTs.current ?? new Date().toISOString(), base };
    cutRef.current = next;
    writeCut(next);
    buffer.current = [];
    requested.current.clear();
    setCut(next);
    setStats({ data: base, at: ZERO_AT });
    dispatch({ type: "reset" });
  }, []);

  /** Kesimi kaldır ve akışa yeniden bağlan: son 200 olay ve tüm kanallar geri gelir. */
  const showAll = useCallback(() => {
    cutRef.current = null;
    writeCut(null);
    buffer.current = [];
    seen.current.clear();
    requested.current.clear();
    setCut(null);
    setStats(null);
    dispatch({ type: "reset" });
    setEpoch((n) => n + 1);
  }, []);

  const d = stats?.data;
  const live = (k: "vouchersAccepted" | "vouchersRejected" | "chainTxCount") =>
    Math.max(0, state.local[k] - (stats?.at[k] ?? 0));
  const livePayments = live("vouchersAccepted");
  const liveVolume = stats && state.local.volume > stats.at.volume ? state.local.volume - stats.at.volume : 0n;
  const base = cut?.base;
  const totals: Totals | null = d
    ? {
        payments: Math.max(0, d.vouchersAccepted - (base?.vouchersAccepted ?? 0)) + livePayments,
        rejected: Math.max(0, d.vouchersRejected - (base?.vouchersRejected ?? 0)) + live("vouchersRejected"),
        txs: Math.max(0, d.chainTxCount - (base?.chainTxCount ?? 0)) + live("chainTxCount"),
        volume: big(d.volume) - big(base?.volume) + liveVolume,
        exactTx: Math.max(0, d.exactEquivalent.txCount - (base?.exactEquivalent.txCount ?? 0)) + livePayments,
        exactSeconds:
          Math.max(0, d.exactEquivalent.seconds - (base?.exactEquivalent.seconds ?? 0)) + livePayments * 5,
        latencyMs: (cut ? 0 : d.medianVoucherLatencyMs) || median(state.local.latencies),
        scoped: Boolean(cut),
      }
    : null;

  return {
    connection,
    state,
    totals,
    runAgent,
    setFrozen,
    claim,
    clear,
    showAll,
    pending,
    pendingId,
    accountStatus: accountRead.key === `${epoch}:${accountOverride ?? ""}` ? accountRead.status : ("loading" as AccountStatus),
    channelsLoaded,
    actionError,
    clearError: () => setActionError(null),
  } as const;
}
