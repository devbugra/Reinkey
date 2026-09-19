import { useTranslations } from "next-intl";
import { anchors } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { Playground } from "./Playground";

export function PlaygroundSection() {
  const t = useTranslations("playground");
  return (
    <section
      id={anchors.playground.slice(1)}
      aria-labelledby="deneme-baslik"
      className="section-rule relative bg-bg-alt py-20 sm:py-28"
    >
      <div aria-hidden="true" className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[40rem]" />
      <Container>
        <Reveal>
          <div className="grid gap-x-12 gap-y-5 md:grid-cols-12">
            <div className="md:col-span-7">
              <p className="eyebrow text-accent-text">{t("eyebrow")}</p>
              <h2 id="deneme-baslik" className="mt-5 text-4xl font-semibold">
                {t("title")}
              </h2>
            </div>
            <p className="max-w-[65ch] text-fg-muted md:col-span-5 md:self-end">
              {t("lead")}
            </p>
          </div>
        </Reveal>

        <Reveal delay={80} className="mt-14">
          <Playground />
        </Reveal>
      </Container>
    </section>
  );
}
