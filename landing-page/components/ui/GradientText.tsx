import { cn } from "@/lib/utils";

/**
 * Vurgulu metin: hero videosunun renklerinden gelen gradyan
 * (--accent-gradient), gök mavisinden lavantaya; iki uç da zeminde AA'yı
 * geçer.
 *
 * Gradyan `.gradient-text` sınıfıyla globals.css'te uygulanır: içinde
 * <Words> varsa her kelimeye ayrı ayrı (bkz. oradaki not), yoksa metnin
 * kendisine. Ekran okuyucu ve kopyalama için metin olduğu gibi kalır.
 */
export function GradientText({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <em className={cn("gradient-text font-normal italic", className)}>
      {children}
    </em>
  );
}
