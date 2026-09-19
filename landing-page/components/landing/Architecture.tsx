import { useTranslations } from "next-intl";
import { Code2, Info, KeyRound, RadioTower, Waypoints } from "lucide-react";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

const icons = [KeyRound, Waypoints, RadioTower, Code2];

/**
 * Dört parça: iki kontrat (zincirde, güvenilmesi gereken), facilitator ve
 * middleware (zincir dışında, hızlı olması gereken). Kart altındaki not,
 * parçanın sınırını ya da nasıl çağrıldığını söyler. En altta tek satır:
 * bu yapının neden Stellar'a bağlı olduğu.
 */
export function Architecture() {
  const t = useTranslations("architecture");
  const items = t.raw("items") as {
    name: string;
    summary: string;
    body: string;
    note: string;
  }[];

  return (
    <section
      id={anchors.architecture.slice(1)}
      aria-labelledby="mimari-baslik"
      className="border-t border-line bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="mimari-baslik"
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2">
          {items.map((item, i) => {
            const Icon = icons[i] ?? KeyRound;
            return (
              <Reveal key={item.name} as="li" delay={(i % 2) * 60} className="h-full">
                <div className="flex h-full flex-col rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]">
                  <div className="flex-1 p-6">
                    <span className="flex size-10 items-center justify-center rounded-md bg-accent/15">
                      <Icon
                        className="size-5 text-accent-text"
                        aria-hidden="true"
                      />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">
                      {withName(item.name)}
                    </h3>
                    <p dir="ltr" className="mt-1.5 text-sm text-accent-text rtl:text-end">
                      {item.summary}
                    </p>
                    <p className="mt-4 text-sm text-fg-muted">{item.body}</p>
                  </div>
                  <p className="flex items-start gap-2 border-t border-line px-6 py-4 text-xs text-fg-subtle">
                    <Info
                      className="mt-px size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {item.note}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>

        <Reveal delay={120}>
          <p className="mt-8 max-w-[70ch] text-sm text-fg-muted">
            {t("whyStellar")}
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
