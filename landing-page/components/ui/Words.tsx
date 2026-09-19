import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * KELİME KELİME BELİREN METİN.
 *
 * Metni kelimelere böler ve her birini kendi maskesinin içinden yukarı
 * kaydırır. Saf CSS: animasyon gecikmesi satır içi stille verilir, JavaScript
 * durumu yoktur — bu yüzden sunucu bileşeni olarak çalışır ve ilk boyamada
 * hazırdır.
 *
 * Kelime bütünlüğü korunur (harf harf bölünmez): harf animasyonu uzun
 * başlıklarda okumayı zorlaştırır ve ekran okuyucuya parçalı metin verir.
 * DOM'daki metin bozulmadan kalır; kelimeler arasında gerçek boşluk düğümü
 * bulunur, böylece kopyalanan metin de doğru çıkar.
 *
 * MASKE PAYI. Maskenin görevi kelimeyi YUKARIDAN aşağı gizlemektir, yanlardan
 * değil. Yatay pay verilmezse italik harflerin sağa taşan kısmı kesilir —
 * "cancel" kelimesinin son "l" harfi tam olarak böyle kırpılıyordu. Pay
 * kadar negatif kenar boşluğu, düzendeki yeri değiştirmeden kırpma alanını
 * genişletir.
 */
const CLIP_PAD = "0.16em";

export function Words({
  text,
  delay = 0,
  step = 70,
  className,
  wordClassName,
}: {
  text: string;
  /** İlk kelimenin gecikmesi (ms). */
  delay?: number;
  /** Kelimeler arası artış (ms). */
  step?: number;
  className?: string;
  wordClassName?: string;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span
            className="inline-block overflow-hidden align-bottom"
            style={{
              paddingInline: CLIP_PAD,
              marginInline: `-${CLIP_PAD}`,
              // Alt pay: "y", "ğ", "ş" gibi alt uzantılar da kesilmesin.
              paddingBottom: CLIP_PAD,
              marginBottom: `-${CLIP_PAD}`,
            }}
          >
            <span
              className={cn("word-rise", wordClassName)}
              style={{ animationDelay: `${delay + i * step}ms` }}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}
