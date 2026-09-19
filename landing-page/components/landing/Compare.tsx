import { useTranslations } from "next-intl";
import { site } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

/**
 * KARŞILAŞTIRMA.
 *
 * İki sütun: solda bugünkü x402 `exact` akışı (her ödeme bir işlem), sağda
 * `channel` akışı (kanal bir kez açılır, kuponlar zincire gitmez). Adımlar
 * aynı dikey ölçekte durur; son satır iki tarafın bedelini rakamla koyar.
 * Tek sayısal iddia "1000 ödeme = 2 işlem" ve ondan türeyen karşılaştırma.
 */
function Column({
  title,
  steps,
  note,
  tone,
}: {
  title: string;
  steps: string[];
  note: string;
  tone: "before" | "after";
}) {
  const after = tone === "after";
  return (
    <div className="flex flex-col">
      <p
        className={cn(
          "text-xs font-medium tracking-[0.12em] uppercase",
          after ? "text-accent-text" : "text-fg-subtle",
        )}
      >
        {title}
      </p>
      <ol className="mt-5 flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
                after && last
                  ? "border-transparent bg-accent font-medium text-accent-contrast"
                  : !after && last
                    ? "border-danger/40 bg-danger-bg text-danger"
                    : "border-line bg-surface-1 text-fg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  after && last
                    ? "bg-accent-contrast"
                    : !after && last
                      ? "bg-danger"
                      : "bg-fg-subtle/40",
                )}
              />
              {step}
            </li>
          );
        })}
      </ol>
      <p className="mt-5 max-w-[38ch] text-sm text-fg-muted">{note}</p>
    </div>
  );
}

export function Compare() {
  const t = useTranslations("compare");
  return (
    <section
      aria-labelledby="fark-baslik"
      className="border-t border-line py-20 sm:py-28"
    >
      <Container>
        <Reveal>
          <p className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">
            {t("eyebrow")}
          </p>
          <h2
            id="fark-baslik"
            className="mt-4 max-w-[20ch] text-4xl font-semibold"
          >
            {t("title")}
          </h2>
        </Reveal>

        <Reveal delay={80} className="mt-14">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-16">
            <Column
              tone="before"
              title={t("todayTitle")}
              steps={t.raw("todaySteps") as string[]}
              note={t("todayNote")}
            />
            <Column
              tone="after"
              title={t("withTitle", { name: site.name })}
              steps={t.raw("withSteps") as string[]}
              note={t("withNote")}
            />
          </div>
          <p className="mt-8 text-xs text-fg-subtle">{t("measureNote")}</p>
        </Reveal>
      </Container>
    </section>
  );
}
