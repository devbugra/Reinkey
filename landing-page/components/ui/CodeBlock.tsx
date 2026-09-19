import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

/**
 * KOD BLOĞU. Ürün sayfaları ve belgeler aynısını kullanır.
 *
 * Sözdizimi renklendirmesi yok: bir renklendirici kitaplık yalnızca birkaç
 * kısa örnek için sayfaya yüzlerce kB ekler. Okunurluğu yazı tipi, satır
 * aralığı ve üstteki dosya adı taşır. Kod her zaman soldan sağa akar.
 */
export function CodeBlock({
  code,
  title,
  className,
}: {
  code: string;
  /** Dosya adı ya da kabuk ("server.ts", "bash"). */
  title?: string;
  className?: string;
}) {
  return (
    <figure
      dir="ltr"
      className={cn(
        "overflow-hidden rounded-lg border border-line bg-bg text-start",
        className,
      )}
    >
      <figcaption className="flex h-10 items-center justify-between border-b border-line ps-4 pe-1.5">
        <span className="font-mono text-xs text-fg-subtle">{title ?? ""}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
