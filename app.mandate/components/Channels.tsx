/** Kanal geçmişi: açılan her kanalın depozitosu nereye gitti (borsaya tahsilat / ajana iade). */
import { int, usdc } from "@/lib/format";
import type { ChannelView } from "@/lib/store";
import { Panel, TxLink, cn } from "./ui";

export function Channels({ channels }: { channels: Record<string, ChannelView> }) {
  const list = Object.values(channels).sort((a, b) => Number(b.id) - Number(a.id));
  if (list.length < 2) return null;

  return (
    <Panel title="Kanal geçmişi" hint="Kapanan kanalda kullanılmayan depozito ajana iade edilir; borsa yalnızca kuponla kanıtlananı alır">
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-fg-subtle">
              {["Kanal", "Durum", "Depozito", "Ödenen", "Tahsil edilen", "İade", "Kupon", ""].map((h, i) => (
                <th key={i} scope="col" className={cn("px-5 py-2 font-normal", i > 1 && i < 7 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.slice(0, 8).map((c) => (
              <tr key={c.id}>
                <th scope="row" className="px-5 py-2.5 text-left font-mono text-xs font-normal">#{c.id}</th>
                <td className="px-5 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", c.open ? "bg-success-bg text-success" : "bg-surface-3 text-fg-subtle")}>
                    {c.open ? "açık" : "kapalı"}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right">{usdc(c.deposit)}</td>
                <td className="px-5 py-2.5 text-right">{usdc(c.accepted)}</td>
                <td className="px-5 py-2.5 text-right">{usdc(c.claimed)}</td>
                <td className="px-5 py-2.5 text-right text-fg-muted">{c.refunded !== null ? usdc(c.refunded) : "—"}</td>
                <td className="px-5 py-2.5 text-right text-fg-muted">{c.vouchers ? int(c.vouchers) : "—"}</td>
                <td className="px-5 py-2.5 text-right">
                  <TxLink hash={c.openedTx} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
