"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Viewport'a girince bir kez 16px asagidan yukari + opaklik gecisi.
 * IntersectionObserver mount aninda zaten gorunur olan ogeler icin de
 * tetiklenir. `prefers-reduced-motion` altinda gecis globals.css tarafindan
 * kapatilir, oge dogrudan son halinde belirir. JavaScript calismazsa
 * layout'taki <noscript> stili icerigi gorunur tutar.
 *
 * `as` gereklidir: sarmalayici bir <ul> icindeyse <div> render etmek
 * ul > div > li nesting'i uretir ve ekran okuyucuda liste semantigi kaybolur.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Kardes elemanlarda 60ms stagger icin: delay={i * 60} */
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
      style={{ transitionDelay: visible ? `${delay}ms` : undefined }}
      className={cn(
        "transition-[opacity,translate] duration-500 ease-(--ease-out-expo)",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
