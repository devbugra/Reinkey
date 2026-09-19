"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 1200;
/** globals.css'teki --ease-out-expo ile ayni egri. */
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Gorunur olunca 0'dan hedefe sayar. `prefers-reduced-motion` altinda
 * animasyon yok, deger dogrudan yazilir. `value` null ise gercek metrik
 * henuz tanimlanmamis demektir; yer tutucu gosterilir.
 */
export function Counter({
  value,
  suffix = "",
  className,
}: {
  value: number | null;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || value === null) return;

    let frame = 0;
    let settle = 0;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        if (reduceMotion) {
          setShown(value);
          return;
        }

        // rAF arka plan sekmede duraklarsa deger hedefe ulasmadan kalmasin.
        settle = window.setTimeout(() => setShown(value), DURATION + 100);

        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / DURATION, 1);
          setShown(value * easeOutExpo(progress));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [value]);

  if (value === null) {
    return (
      <span ref={ref} className={className}>
        {/* Gercek rakam girilene kadar bilincli bir yer tutucu gibi gorunsun. */}
        <span className="align-middle text-[0.55em] font-normal text-fg-subtle underline decoration-dotted underline-offset-[6px]">
          [metrik]
        </span>
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {Math.round(shown).toLocaleString("tr-TR")}
      {suffix}
    </span>
  );
}
