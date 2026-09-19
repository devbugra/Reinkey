import { cn } from "@/lib/utils";
import { highlight, langFromTitle, type Lang } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

/**
 * KOD BLOĞU. Ürün sayfaları ve belgeler aynısını kullanır.
 *
 * Renklendirme kütüphanesiz ve sunucuda (lib/highlight.tsx): dört kısa dil,
 * tek geçişli bir eşleyici. Üstteki dosya adı dili de söyler. Kod her zaman
 * soldan sağa akar.
 */
export function CodeBlock({
  code,
  title,
  lang,
  className,
}: {
  code: string;
  /** Dosya adı ya da kabuk ("server.ts", "bash"). */
  title?: string;
  /** Verilmezse başlıktan tahmin edilir. */
  lang?: Lang;
  className?: string;
}) {
  const language = lang ?? langFromTitle(title);
  return (
    <figure
      dir="ltr"
      className={cn(
        "card overflow-hidden rounded-lg bg-bg text-start",
        className,
      )}
    >
      <figcaption className="flex h-10 items-center justify-between border-b border-line bg-surface-1/60 ps-4 pe-1.5">
        <span className="flex items-center gap-2.5 font-mono text-xs text-fg-subtle">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2 rounded-full bg-fg-subtle/25" />
            <span className="size-2 rounded-full bg-fg-subtle/18" />
            <span className="size-2 rounded-full bg-fg-subtle/12" />
          </span>
          {title ?? ""}
        </span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        <code>{highlight(code, language)}</code>
      </pre>
    </figure>
  );
}
