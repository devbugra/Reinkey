import { useTranslations } from "next-intl";
import { Minus } from "lucide-react";
import { anchors } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

/**
 * DÜRÜST SINIRLAR.
 *
 * Gecikme ve kapsam soruları jüriden de müşteriden de ilk gelen sorulardır.
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
      className="border-t border-line bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-xl border border-line bg-surface-1 p-8 shadow-[var(--card-shadow)] sm:p-12">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-line-strong"
            />
            <div className="grid gap-10 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-7">
                <p className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">
                  {t("eyebrow")}
                </p>
                <h2 id="sinir-baslik" className="mt-4 text-4xl font-semibold">
                  {t("title")}
                </h2>
                <p className="mt-5 max-w-[65ch] text-fg-muted">{t("body")}</p>
              </div>

              <ul className="flex flex-col gap-3 md:col-span-5 md:self-center">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 rounded-md border border-line bg-surface-2 px-4 py-3 text-sm text-fg"
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
