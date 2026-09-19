import Link from "next/link";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";

/*
 * İŞARET: ANAHTAR + DİZGİN.
 *
 * Ürünün sloganını çizer: anahtar ajana verilir (halka + gövde + tek diş),
 * halkadan çıkan kavisli kayış ise sahibin elinde kalan dizgindir — yetki
 * zincirde, sahipte kalır. Ad `site.name`den okunur.
 *
 * Tek renktir ve `currentColor` ile çizilir; 24×24 viewBox. 16 px'te
 * okunması için yalnızca dört çizgi: halka, gövde, diş, dizgin. OG görseli,
 * apple-icon ve icon.svg aynı geometriyi kullanır (icon.svg elle kopyalanır,
 * bir değişiklikte dördü birlikte güncellenmeli). Orada dizgin aksan rengi
 * alır; sitede işaret tek renktir.
 */
export const MARK_VIEWBOX = "0 0 24 24";
/** Anahtar: halka (merkez 7.5,8.5 · r 3.75), gövde ve tek diş. */
export const MARK_KEY =
  "M11.25 8.5a3.75 3.75 0 1 1-7.5 0a3.75 3.75 0 1 1 7.5 0M11.25 8.5H20.5M18 8.5v3";
/** Dizgin: halkanın altından çıkıp sağ alta kavis yapan kayış. */
export const MARK_REIN = "M7.5 12.25c0 5.5 3.5 8.75 9.5 8.75";
export const MARK_STROKE = 2.2;

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      className={cn("size-6", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={MARK_KEY} />
      <path d={MARK_REIN} />
    </svg>
  );
}

/**
 * İşaret + ad. Yükseklik sınıfla verilir. Ad her dilde Latin harflerle
 * kalır; ekran okuyucu adı metnin kendisinden okur.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]",
        className,
      )}
    >
      <Mark className="size-[1.15em]" />
      {site.name}
    </span>
  );
}

export function Wordmark({
  href = "#top",
  onNavigate,
}: {
  href?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      dir="ltr"
      className="flex items-center text-fg"
    >
      <Logo />
    </Link>
  );
}
