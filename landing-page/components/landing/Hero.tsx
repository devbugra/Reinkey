import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { docs, routes, site } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { GradientText } from "@/components/ui/GradientText";
import { HeroVideo } from "@/components/ui/HeroVideo";
import { RiseIn } from "@/components/ui/RiseIn";
import { Words } from "@/components/ui/Words";
import { HeroVisual } from "./HeroVisual";
import { Mark } from "./Wordmark";

/** Üzerine kurulu olduğu şeyler; ad olarak yazılır, logo indirilmez. */
const BUILT_ON = ["Stellar", "Soroban", "x402", "USDC"];

export function Hero() {
  const t = useTranslations("hero");
  const trust = t.raw("trust") as string[];

  return (
    // Üstten dolgu, akış dışı yüzen menünün yüksekliğini karşılar.
    // `isolate`: videonun -z-10'u bu bölümün içinde kalır, sayfa zemininin
    // arkasına düşmez.
    <section id="top" className="relative isolate overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-20">
      <HeroVideo />
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          {/* ÜST ETİKET. Bir iddia veya rozet değil, KATEGORİ: ziyaretçi
              başlığı okumadan önce bunun ne tür bir ürün olduğunu bilir. */}
          <RiseIn>
            <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface-1/50 py-1.5 ps-2 pe-4 text-xs font-medium tracking-[0.16em] text-fg-muted uppercase backdrop-blur-md">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent/15 text-accent-text">
                <Mark className="size-3.5" />
              </span>
              {t("eyebrow")}
            </p>
          </RiseIn>

          {/* Başlık kelime kelime yükselerek gelir; vurgu kelimesi en sonda
              ve italik. RiseIn ile sarılmaz — iki animasyon üst üste binerdi. */}
          <h1 className="text-glow mt-8 text-5xl leading-[0.98] font-semibold tracking-tight">
            <Words text={t("titleLead")} delay={120} />
            {/* İki Words arasında gerçek boşluk düğümü gerekir; JSX satır
                sonlarındaki boşluğu kaldırır ve kelimeler bitişik çıkardı. */}{" "}
            <GradientText>
              <Words
                text={t("titleAccent")}
                delay={120 + t("titleLead").split(/\s+/).length * 70}
              />
            </GradientText>
          </h1>

          <RiseIn delay={120}>
            <p className="mx-auto mt-8 max-w-[58ch] text-lg text-fg-muted">
              {t("subtitle", { name: site.name })}
            </p>
          </RiseIn>

          <RiseIn delay={180}>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={routes.panel} size="lg">
                {t("ctaPrimary")}
                <ArrowRight
                  className="size-4 rtl:-scale-x-100"
                  aria-hidden="true"
                />
              </Button>
              <Button href={docs.home} variant="secondary" size="lg">
                {t("ctaSecondary")}
              </Button>
            </div>
            <p className="mt-4 text-sm text-fg-subtle">{t("note")}</p>
          </RiseIn>

          <RiseIn delay={240}>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
              {trust.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-fg-muted"
                >
                  <Check
                    className="size-4 shrink-0 text-accent-text"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </RiseIn>
        </div>

        {/* KANIT. Sayfa açılır açılmaz iddia sayıyla görünür: bin kupon,
            iki işlem. Metin okunmadan önce göz bunu görür. */}
        <RiseIn delay={360} className="mx-auto mt-16 max-w-5xl sm:mt-20">
          <HeroVisual />
        </RiseIn>

        <RiseIn delay={480}>
          <div className="mt-14 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
            <p className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">
              {t("builtOn")}
            </p>
            <ul dir="ltr" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              {BUILT_ON.map((name) => (
                <li
                  key={name}
                  className="font-display text-lg font-semibold tracking-[-0.02em] text-fg-subtle transition-colors duration-200 hover:text-fg"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </RiseIn>
      </Container>
    </section>
  );
}
