"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";

type Tag = "div" | "li" | "article" | "section";

/**
 * FAREYİ İZLEYEN IŞIK.
 *
 * Kartın üstünde imlecin bulunduğu noktadan yayılan yumuşak bir leke ve
 * aynı noktadan aydınlanan kenarlık (bkz. globals.css `.spotlight`). Yalnızca
 * iki CSS değişkeni yazılır; çizim tamamen CSS'tedir, React yeniden
 * render etmez. Dokunmatikte hover olmadığı için hiç görünmez.
 */
export function Spotlight({
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  as?: Tag;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  // Etiket çalışma anında seçilir; tip sistemi için hepsi bir <div> gibi
  // ele alınır. Kullanılan öznitelikler (className, onPointerMove, aria-*)
  // dört etikette de aynı.
  const Component = Tag as "div";
  return (
    <Component
      {...(rest as React.HTMLAttributes<HTMLDivElement>)}
      onPointerMove={onPointerMove}
      className={cn("spotlight", className)}
    >
      {children}
    </Component>
  );
}
