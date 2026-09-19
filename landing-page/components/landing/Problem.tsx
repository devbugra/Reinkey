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
      className="border-t border-line bg-bg-alt py-20 sm:py-28"
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
                <Card className="h-full">
                  <span className="flex size-10 items-center justify-center rounded-md border border-line bg-surface-2">
                    <Icon
                      className="size-5 text-accent-text"
                      aria-hidden="true"
                    />
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
