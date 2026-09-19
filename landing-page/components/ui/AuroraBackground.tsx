import { cn } from "@/lib/utils";

/**
 * Kapanis bolumunun arkasindaki isik katmani. Tamamen dekoratif: DOM'da `aria-hidden`,
 * tiklama almaz ve icerigin altinda (-z-10) durur.
 *
 * Hero videosunun renklerini (marka rampasi) tasiyan, cok yavas suruklenen
 * iki yumusak isik halkasi ve ince tane dokusu. Kapanis bolumunde kullanilir;
 * hero'nun kendisi video kullanir (bkz. HeroVideo.tsx).
 */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden grain",
        className,
      )}
    >
      <div className="aurora absolute inset-0" />
    </div>
  );
}
