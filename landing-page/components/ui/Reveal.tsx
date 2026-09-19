"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Viewport'a girince bir kez: 16px aşağıdan yukarı, opaklık ve hafif bir
 * netleşme (blur → keskin). IntersectionObserver mount anında zaten görünür
 * olan öğeler için de tetiklenir. `prefers-reduced-motion` altında geçiş
 * globals.css tarafından kapatılır, öğe doğrudan son hâlinde belirir.
 * JavaScript çalışmazsa layout'taki <noscript> stili içeriği görünür tutar.
 *
 * Blur yalnızca görünmezken satır içi stille verilir; görünür olunca
 * özellik tamamen kaldırılır. `filter: blur(0)` bile bir kapsayıcı blok
 * oluşturur ve içteki `position: fixed` öğeleri bozardı.
 *
 * `as` gereklidir: sarmalayıcı bir <ul> içindeyse <div> render etmek
 * ul > div > li nesting'i üretir ve ekran okuyucuda liste semantiği kaybolur.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Kardeş elemanlarda 60ms stagger için: delay={i * 60} */
  delay?: number;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      data-reveal=""
      style={{
        transitionDelay: visible ? `${delay}ms` : undefined,
        filter: visible ? undefined : "blur(6px)",
      }}
      className={cn(
        "transition-[opacity,translate,filter] duration-700 ease-(--ease-out-expo)",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
