import { cn } from "@/lib/utils";

/**
 * Sayfa acilisinda calisan giris animasyonu. Reveal'dan farki: JavaScript
 * beklemez, ilk boyamada CSS keyframe olarak baslar. Bu yuzden yalnizca
 * ekranin ust kismindaki (hero) icerikte kullanilir; asagisi Reveal kullanir.
 */
export function RiseIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** ms cinsinden gecikme; kardeslerde 60'ar artar. */
  delay?: number;
}) {
  return (
    <div
      className={cn("rise-in", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
