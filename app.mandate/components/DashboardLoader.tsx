"use client";

/*
 * Panel yalnızca tarayıcıda çalışır: EventSource ve canlı
 * sayaçlar sunucuda anlamsız. Sunucuda boş iskelet render edilir; böylece
 * hidrasyon uyuşmazlığı da olmaz.
 */
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("./Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-fg-subtle">
      Panel yükleniyor…
    </div>
  ),
});

export function DashboardLoader() {
  return <Dashboard />;
}
