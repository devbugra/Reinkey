import { useTranslations } from "next-intl";
import { Minus } from "lucide-react";
import { anchors } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

/**
 * DÜRÜST SINIRLAR.
 *
 * Gecikme ve kapsam, entegrasyondan önce sorulan ilk iki sorudur.
 * Gizlenirse ilk soruda yakalanır; baştan yazılırsa güven kurar. Liste
 * işareti bu yüzden onay değil eksi: bunlar ürünün YAPMADIKLARI.
 */
export function Limits() {
  const t = useTranslations("limits");
  const points = t.raw("points") as string[];

  return (
    <section
      id={anchors.limits.slice(1)}
      aria-labelledby="sinir-baslik"
      className="section-rule bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <Reveal>
          <div className="card relative overflow-hidden rounded-xl p-8 sm:p-12">
            <span aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative grid gap-10 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-7">
                <p className="eyebrow text-accent-text">{t("eyebrow")}</p>
                <h2 id="sinir-baslik" className="mt-5 text-4xl font-semibold">
                  {t("title")}
                </h2>
                <p className="mt-5 max-w-[65ch] text-fg-muted">{t("body")}</p>
              </div>

              <ul className="flex flex-col gap-3 md:col-span-5 md:self-center">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 rounded-md border border-line bg-surface-2/70 px-4 py-3 text-sm text-fg shadow-[inset_0_1px_0_0_var(--highlight)]"
                  >
                    <Minus
                      className="mt-0.5 size-4 shrink-0 text-fg-subtle"
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
