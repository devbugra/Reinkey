/*
 * İŞARET: anahtar + dizgin.
 *
 * Anahtar (halka + gövde + tek diş) ajana verilen yetki, halkadan çıkan kavisli
 * kayış ise sahibin elinde kalan dizgindir. Geometri tanıtım sitesindeki
 * `landing-page/components/landing/Wordmark.tsx` ile BİREBİR aynıdır: konsol ve
 * site aynı markanın iki yüzü, iki ayrı çizim değil. Biri değişirse ikisi
 * birlikte güncellenir. Tek renk, `currentColor`.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.25 8.5a3.75 3.75 0 1 1-7.5 0a3.75 3.75 0 1 1 7.5 0M11.25 8.5H20.5M18 8.5v3" />
      <path d="M7.5 12.25c0 5.5 3.5 8.75 9.5 8.75" />
    </svg>
  );
}
