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
      className="border-t border-line py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="sss-baslik"
        />

        <div className="mt-12 grid gap-x-10 md:grid-cols-2">
          {items.map((item, i) => (
            <Reveal key={item.q} delay={(i % 2) * 60}>
              {/* <details> native açılır kapanır; JavaScript kapalıyken de çalışır. */}
              <details className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-medium text-fg marker:content-['']">
                  {item.q}
                  <Plus
                    className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform duration-150 ease-(--ease-out-expo) group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 max-w-[65ch] text-sm text-fg-muted">
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
