import { useTranslations } from "next-intl";
import { Code2, Info, KeyRound, RadioTower, Waypoints } from "lucide-react";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spotlight } from "@/components/ui/Spotlight";
import { ArchitectureDiagram, type DiagramLabels } from "./ArchitectureDiagram";

const icons = [KeyRound, Waypoints, RadioTower, Code2];

/**
 * Önce resim, sonra parçalar. Diyagram neyin nerede durduğunu tek bakışta
 * söyler: hızlı olan üstte ve zincir dışında, güvenilmesi gereken altta ve
 * zincirde. Dört kart her parçanın sınırını ya da nasıl çağrıldığını
 * anlatır. En altta tek satır: bu yapının neden Stellar'a bağlı olduğu.
 */
export function Architecture() {
  const t = useTranslations("architecture");
  const items = t.raw("items") as {
    name: string;
    summary: string;
    body: string;
    note: string;
  }[];
  const labels = t.raw("diagram") as DiagramLabels;

  return (
    <section
      id={anchors.architecture.slice(1)}
      aria-labelledby="mimari-baslik"
      className="section-rule bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="mimari-baslik"
        />

        <Reveal delay={60} className="mt-14">
          <div className="card relative overflow-hidden rounded-xl p-4 sm:p-6">
            <span aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative">
              <ArchitectureDiagram labels={{ ...labels, account: withName(labels.account) }} />
            </div>
          </div>
        </Reveal>

        <ul className="mt-6 grid gap-5 sm:grid-cols-2">
          {items.map((item, i) => {
            const Icon = icons[i] ?? KeyRound;
            return (
              <Reveal key={item.name} as="li" delay={(i % 2) * 60} className="h-full">
                <Spotlight as="div" className="card card-hover flex h-full flex-col rounded-lg">
                  <div className="flex-1 p-6">
                    <span className="flex size-10 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent-text shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">
                      {withName(item.name)}
                    </h3>
                    <p dir="ltr" className="mt-1.5 font-mono text-xs text-accent-text rtl:text-end">
                      {item.summary}
                    </p>
                    <p className="mt-4 text-sm text-fg-muted">{item.body}</p>
                  </div>
                  <p className="flex items-start gap-2 border-t border-line bg-bg/40 px-6 py-4 text-xs text-fg-subtle">
                    <Info
                      className="mt-px size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span dir="auto">{item.note}</span>
                  </p>
                </Spotlight>
              </Reveal>
            );
          })}
        </ul>

        <Reveal delay={120}>
          <p className="mt-8 flex max-w-[78ch] items-start gap-3 rounded-lg border border-line bg-surface-1/60 px-5 py-4 text-sm text-fg-muted">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
            {t("whyStellar")}
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
