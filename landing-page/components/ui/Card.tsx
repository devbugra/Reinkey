import { cn } from "@/lib/utils";
import { Spotlight } from "./Spotlight";

type Tag = "div" | "li" | "article" | "section";

/**
 * KART.
 *
 * Tek yüzey dili (bkz. globals.css `.card`): gece mavisi zemin, üstten
 * sönen ince ışık, 1px üst highlight, altta yumuşak karanlık. `interactive`
 * kartlar fareyle hafifçe kalkar ve imleci izleyen bir ışık alır.
 */
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
  as?: Tag;
  interactive?: boolean;
  bare?: boolean;
}) {
  const classes = cn(
    "card rounded-lg",
    !bare && "p-6",
    interactive && "card-hover",
    className,
  );
  if (interactive) {
    return (
      <Spotlight as={Tag} className={classes}>
        {children}
      </Spotlight>
    );
  }
  return <Tag className={classes}>{children}</Tag>;
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
  as?: Tag;
  interactive?: boolean;
}) {
  const classes = cn(
    "card flex flex-col overflow-hidden rounded-lg",
    interactive && "card-hover",
    className,
  );
  const body = (
    <>
      <div className="px-5 py-4">{head}</div>
      <div className="flex-1 border-t border-line px-5 py-4">{children}</div>
    </>
  );
  if (interactive) {
    return (
      <Spotlight as={Tag} className={classes}>
        {body}
      </Spotlight>
    );
  }
  return <Tag className={classes}>{body}</Tag>;
}
