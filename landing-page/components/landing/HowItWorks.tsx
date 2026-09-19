import { useTranslations } from "next-intl";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function HowItWorks() {
  const t = useTranslations("howItWorks");
  const steps = t.raw("steps") as {
    step: string;
    title: string;
    body: string;
  }[];

  return (
    <section
      id={anchors.howItWorks.slice(1)}
      aria-labelledby="nasil-baslik"
      className="border-t border-line py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="nasil-baslik"
        />

        <ol className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-3">
          {steps.map((step, i) => (
            <Reveal key={step.step} as="li" delay={i * 60} className="relative">
              <>
                {/* Adımlar arası bağlantı çizgisi — yalnızca geniş ekranda ve son adımda yok. */}
                {/* Bağlantı çizgisi adım göründüğünde soldan sağa çizilir;
                    sıra gözle izlenir hâle gelir. Bilgi taşımaz. */}
                {i < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="rail-draw absolute top-5 -end-8 start-14 hidden h-px bg-line-strong md:block"
                    style={{ animationDelay: `${i * 120 + 200}ms` }}
                  />
                ) : null}
                <span className="relative flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface-1 text-sm font-semibold text-fg shadow-[var(--card-shadow)]">
                  {step.step}
                  <span
                    aria-hidden="true"
                    className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-accent"
                  />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2.5 text-sm text-fg-muted">{withName(step.body)}</p>
              </>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
