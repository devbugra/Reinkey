import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { anchors, docs } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { GradientText } from "@/components/ui/GradientText";
import { HeroVideo } from "@/components/ui/HeroVideo";
import { RiseIn } from "@/components/ui/RiseIn";
import { Words } from "@/components/ui/Words";
import { Mark } from "./Wordmark";

export function Hero() {
  const t = useTranslations("hero");
  const trust = t.raw("trust") as string[];

  return (
    // Üstten dolgu, akış dışı yüzen menünün yüksekliğini karşılar.
    // `isolate`: videonun -z-10'u bu bölümün içinde kalır, sayfa zemininin
    // arkasına düşmez.
    <section id="top" className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      <HeroVideo />
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          {/* ÜST ETİKET. Bir iddia veya rozet değil, KATEGORİ: ziyaretçi
              başlığı okumadan önce bunun ne tür bir ürün olduğunu bilir.
              Kenarlık ve dolgu yok — çerçeve, etiketi olduğundan önemli
              gösterir ve başlığın önüne geçer. */}
          <RiseIn>
            <p className="flex items-center justify-center gap-2.5 text-xs font-medium tracking-[0.18em] text-fg-subtle uppercase">
              <Mark className="size-5" />
              {t("eyebrow")}
            </p>
          </RiseIn>

          {/* Başlık kelime kelime yükselerek gelir; vurgu kelimesi en sonda
              ve italik. RiseIn ile sarılmaz — iki animasyon üst üste binerdi. */}
          <h1 className="mt-7 text-5xl leading-[0.98] font-semibold tracking-tight">
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
            <p className="mx-auto mt-7 max-w-[58ch] text-lg text-fg-muted">
              {t("subtitle")}
            </p>
          </RiseIn>

          <RiseIn delay={180}>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={anchors.playground} size="lg">
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
            <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2">
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
      </Container>

    </section>
  );
}
