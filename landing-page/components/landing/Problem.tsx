import { useTranslations } from "next-intl";
import { Coins, KeyRound, Timer } from "lucide-react";
import { anchors } from "@/content/site";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

const icons = [Timer, Coins, KeyRound];

export function Problem() {
  const t = useTranslations("problem");
  const items = t.raw("items") as { title: string; body: string }[];

  return (
    <section
      id={anchors.problem.slice(1)}
      aria-labelledby="sorun-baslik"
      className="section-rule bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="sorun-baslik"
        />

        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {items.map((item, i) => {
            const Icon = icons[i] ?? KeyRound;
            return (
              <Reveal
                key={item.title}
                as="li"
                delay={i * 60}
                className="h-full"
              >
                <Card className="h-full" interactive>
                  <span className="flex size-10 items-center justify-center rounded-md border border-danger/25 bg-danger-bg text-danger shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2.5 text-sm text-fg-muted">{item.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
