import { notFound } from "next/navigation";

/**
 * Dil önekinin altındaki eşleşmeyen adresleri yakalar ve `not-found.tsx`'e
 * düşürür. Kök düzen iki taneden biri olduğu için Next.js'in kendi kök 404'ü
 * bu düzeni (menü, altbilgi) render edemez.
 */
export default function LocaleCatchAll() {
  notFound();
}
