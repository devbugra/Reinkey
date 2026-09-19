/** Ajanın DEX (Soroswap) işlemleri: hepsi zincirdeki politika içinde gerçekleşti. */
import { clock, usdc } from "@/lib/format";
import type { SwapView } from "@/lib/store";
import { Empty, Panel, TxLink } from "./ui";

export function Trades({ items }: { items: SwapView[] }) {
  return (
    <Panel title="Alım-satım (Soroswap)" hint="İşlem çifti, işlem başı tutar ve günlük tavan zincirde denetlenir">
      {items.length === 0 ? (
        <Empty>Henüz alım-satım yok.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 5).map((s) => (
            <li key={s.key} className="row-in flex items-center gap-3 px-5 py-3">
              <p className="tabular text-sm">
                <span className="font-semibold">{usdc(s.sold)} {s.soldAsset}</span>
                <span className="text-fg-subtle"> → </span>
                <span className="font-semibold text-success">{usdc(s.bought, 2)} {s.boughtAsset}</span>
              </p>
              <span className="ml-auto flex flex-col items-end gap-0.5">
                <TxLink hash={s.tx} />
                <span className="tabular text-[11px] text-fg-subtle">{clock(s.ts)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
