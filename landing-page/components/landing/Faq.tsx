import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function Faq() {
  const t = useTranslations("faq");
  const items = t.raw("items") as { q: string; a: string }[];

  return (
    <section
      id={anchors.faq.slice(1)}
      aria-labelledby="sss-baslik"
      className="section-rule py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="sss-baslik"
        />

        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {items.map((item, i) => (
            <Reveal key={item.q} delay={(i % 2) * 60}>
              {/* <details> native açılır kapanır; JavaScript kapalıyken de çalışır. */}
              <details className="group card rounded-lg transition-[border-color] duration-200 open:border-line-strong hover:border-line-strong">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 text-base font-medium text-fg marker:content-['']">
                  {item.q}
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-fg-subtle transition-[transform,color,border-color] duration-200 ease-(--ease-out-expo) group-open:rotate-45 group-open:border-accent/40 group-open:text-accent-text">
                    <Plus className="size-3.5" aria-hidden="true" />
                  </span>
                </summary>
                <p className="max-w-[65ch] px-5 pb-5 text-sm text-fg-muted">
                  {withName(item.a)}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
