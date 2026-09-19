"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Hero arkasındaki video. Tamamen dekoratif: `aria-hidden`, tıklama almaz ve
 * içeriğin altında (-z-10) durur.
 *
 * hero-gradient.* bir 3 saniyelik ham klipten türetildi (ham dosya depoda yok): orijinal
 * 3 saniyelik ve başı ile sonu tutmadığı için döngüde sıçrıyordu. Yarı hızda
 * ileri + geri oynatılarak 12 saniyelik dikişsiz bir döngüye çevrildi.
 * WebM (~0.3 MB) önce denenir, desteklemeyen tarayıcı MP4'e düşer.
 *
 * Renk dönüşümü ve okunurluk perdesi globals.css'te
 * (.hero-video, .hero-scrim).
 */
export function HeroVideo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  // "Hareketi azalt" açıksa video durur, yalnızca poster (ilk kare) kalır.
  // CSS'teki prefers-reduced-motion kuralı videoyu durduramaz.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (query.matches) video.pause();
      else void video.play().catch(() => {});
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      <video
        ref={ref}
        className="hero-video absolute inset-0 size-full object-cover"
        poster="/hero-gradient-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
      >
        <source src="/hero-gradient.webm" type="video/webm" />
        <source src="/hero-gradient.mp4" type="video/mp4" />
      </video>
      <div className="hero-scrim absolute inset-0" />
    </div>
  );
}
