import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  as: Tag = "div",
  interactive = false,
  /** İç boşluğu kaldırır: bölünmüş kart kendi bölgelerini kendi doldurur. */
  bare = false,
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li" | "article" | "section";
  interactive?: boolean;
  bare?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]",
        !bare && "p-6",
        interactive &&
          "transition-[color,background-color,border-color,translate] duration-200 ease-(--ease-out-expo) hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2",
        className,
      )}
    >
      {Tag === "li" && bare ? children : children}
    </Tag>
  );
}

/**
 * BÖLÜNMÜŞ KART — referans dilin imzası.
 *
 * Kart tek bir kutu değil, ince bir çizgiyle ayrılmış iki bölgedir: üstte
 * durağan bir etiket veya simge, altta değişen içerik. Ayraç bilgi hiyerarşisini
 * gölge veya punto farkı olmadan kurar; renk durum ve vurguya saklanır.
 */
export function SplitCard({
  head,
  children,
  className,
  as: Tag = "div",
  interactive = false,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article" | "section";
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]",
        interactive &&
          "transition-[border-color,translate] duration-200 ease-(--ease-out-expo) hover:-translate-y-0.5 hover:border-line-strong",
        className,
      )}
    >
      <div className="px-5 py-4">{head}</div>
      <div className="flex-1 border-t border-line px-5 py-4">{children}</div>
    </Tag>
  );
}
