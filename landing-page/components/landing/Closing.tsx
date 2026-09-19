import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { anchors, routes } from "@/content/site";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { highlight } from "@/lib/highlight";

/**
 * KAPANIŞ.
 *
 * Kayıt düğmesi yok, çünkü kayıt yok. Onun yerine ziyaretçinin kopyalayıp
 * terminalde çalıştırabileceği tek satır: demo satıcının `meter()` ile
 * korunan ucu. Yanıt 402 ise ürün çalışıyordur.
 * Adres ortam değişkeninden gelir, canlı URL'yle kendiliğinden güncellenir.
 */
export function Closing() {
  const t = useTranslations("closing");
  const command = `curl -i "${routes.api}/demo/book"`;

  return (
    <section
      id={anchors.closing.slice(1)}
      aria-labelledby="basla-baslik"
      className="section-rule relative overflow-hidden bg-bg-alt py-24 sm:py-32"
    >
      <AuroraBackground />
      <span aria-hidden="true" className="bg-grid bg-grid-bottom pointer-events-none absolute inset-0 -z-10 opacity-70" />
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="basla-baslik" className="text-glow text-4xl font-semibold">
            {t("title")}
          </h2>
          <p className="mx-auto mt-5 max-w-[55ch] text-fg-muted">
            {t("subtitle")}
          </p>

          <div
            dir="ltr"
            className="card mx-auto mt-9 max-w-xl overflow-hidden rounded-lg bg-bg/90 text-start font-mono text-[13px] backdrop-blur-md"
          >
            <p className="overflow-x-auto px-4 py-3 whitespace-pre text-fg">
              <span aria-hidden="true" className="tok-prompt select-none">
                ${" "}
              </span>
              {highlight(command, "bash")}
            </p>
            <p className="border-t border-line px-4 py-3 whitespace-pre text-warning">
              HTTP/1.1 402 Payment Required
            </p>
          </div>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href={routes.llms} size="lg">
              {t("cta")}
              <ArrowRight
                className="size-4 rtl:-scale-x-100"
                aria-hidden="true"
              />
            </Button>
            <Button href={routes.openapi} variant="secondary" size="lg">
              {t("ctaSecondary")}
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
