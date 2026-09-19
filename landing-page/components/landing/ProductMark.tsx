import type { ProductKey } from "@/content/site";
import { cn } from "@/lib/utils";
import { MARK_STROKE } from "./Wordmark";

/**
 * ÜRÜN İŞARETLERİ. İkisi de ana işaretle (anahtar + dizgin) aynı çizgi
 * kalınlığında ve aynı 24'lük ızgarada; yan yana durduklarında bir aile gibi
 * okunurlar.
 *
 *  - Meter: sayaç kadranı ve ibre (kullanım ölçülür).
 *  - Reins: bir halkadan çıkan iki dizgin (yön sahibinde kalır).
 */
export function ProductMark({ product, className }: { product: ProductKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      {product === "meter" ? (
        <>
          <path d="M4 17a8 8 0 1 1 16 0" />
          <path d="M12 17l4-6" />
          <path d="M4 17h16" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7" r="3" />
          <path d="M9.6 8.8C6 11 4.5 14.5 4.5 20" />
          <path d="M14.4 8.8C18 11 19.5 14.5 19.5 20" />
        </>
      )}
    </svg>
  );
}
