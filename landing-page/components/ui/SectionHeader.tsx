import { cn } from "@/lib/utils";

/**
 * Bolum baslik bloğu. Masaustunde baslik solda, destek metni sagda ve
 * baslikla ayni taban cizgisinde durur; boylece genis ekranda saginda
 * bosluk kalmaz. Ustteki kucuk etiket bolumleri taranabilir kiliyor.
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
        <p className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">
          {eyebrow}
        </p>
        <h2 id={titleId} className="mt-4 text-4xl font-semibold">
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
