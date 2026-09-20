import { notFound } from "next/navigation";

/**
 * `/docs` altındaki eşleşmeyen adresleri yakalar ve `not-found.tsx`'e düşürür.
 * Bu olmadan Next.js kök 404'üne düşerdi; belgelerin kök düzeni iki taneden biri
 * olduğu için o düzen (başlık, kenar çubuğu) kaybolurdu.
 */
export default function DocsCatchAll() {
  notFound();
}
