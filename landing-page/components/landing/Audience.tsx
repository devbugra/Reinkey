import { useTranslations } from "next-intl";
import { anchors } from "@/content/site";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function Audience() {
  const t = useTranslations("audience");
  const items = t.raw("items") as { title: string; body: string }[];

  return (
    <section
      id={anchors.audience.slice(1)}
      aria-labelledby="kimler-baslik"
      className="border-t border-line py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="kimler-baslik"
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <Reveal
              key={item.title}
              as="li"
              delay={(i % 4) * 60}
              className="h-full"
            >
              <Card className="h-full" interactive>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{item.body}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
