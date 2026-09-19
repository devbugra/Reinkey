/*
 * GEÇİCİ İŞARET: anahtar + dizgin.
 *
 * Halka anahtarın başı, sağa uzanan çizgi anahtarın gövdesi (ajana verilen
 * yetki). Halkadan aşağı kıvrılan ince çizgi dizgin: yetkinin ucu sahibin
 * elinde kalır. Kesin logo landing tarafında çiziliyor; o gelince bu
 * dosya aynı geometriyle güncellenmeli. Tek renk, `currentColor`.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <circle cx="7.5" cy="9" r="4.25" stroke="currentColor" strokeWidth="2.2" />
      <path d="M11.75 9H21M17.5 9v3.25M20.25 9v2.25" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M5 12.6c-1.6 2.8-.4 6.4 3.4 7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}
