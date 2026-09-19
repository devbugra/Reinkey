import { cn } from "@/lib/utils";

/**
 * Bölüm başlık bloğu. Masaüstünde başlık solda, destek metni sağda ve
 * başlıkla aynı taban çizgisinde durur; böylece geniş ekranda sağında
 * boşluk kalmaz. Üstteki kısa aksan çizgili etiket bölümleri taranabilir
 * kılıyor (bkz. globals.css `.eyebrow`).
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  titleId,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  titleId?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-x-12 gap-y-5 md:grid-cols-12", className)}>
      <div className="md:col-span-7">
        <p className="eyebrow text-accent-text">{eyebrow}</p>
        <h2 id={titleId} className="mt-5 text-4xl font-semibold">
          {title}
        </h2>
      </div>

      {lead ? (
        <p className="max-w-[65ch] text-fg-muted md:col-span-5 md:self-end">
          {lead}
        </p>
      ) : null}
    </div>
  );
}
