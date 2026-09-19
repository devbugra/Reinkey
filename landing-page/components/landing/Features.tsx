import { useTranslations } from "next-intl";
import {
  Code2,
  FileCode2,
  Fuel,
  Gauge,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

const icons = [Code2, Gauge, Lock, ShieldCheck, Fuel, FileCode2];

/**
 * BENTO IZGARA.
 *
 * Altı kutunun hepsi eşit değildir. Üç sıra, her biri altı sütunu tam
 * doldurur: 4+2, 2+4, 3+3. Geniş kutular ürünün iki asıl iddiasıdır (tek
 * satır entegrasyon, tavan zincirde); çapraz dizilim ızgaranın tekdüze okunmasını
 * kırar. Eşit kutulardan oluşan bir ızgara her maddeyi aynı önemde gösterir
 * ve okuyucuya hiçbir şey söylemez.
 */
const SPAN = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-3",
];

export function Features() {
  const t = useTranslations("features");
  const items = t.raw("items") as { title: string; body: string }[];

  return (
    <section
      id={anchors.features.slice(1)}
      aria-labelledby="urun-baslik"
      className="border-t border-line py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="urun-baslik"
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {items.map((item, i) => {
            const Icon = icons[i] ?? Code2;
            return (
              <Reveal
                key={item.title}
                as="li"
                delay={(i % 3) * 60}
                className={cn("h-full", SPAN[i])}
              >
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]">
                  <div className="px-5 pt-5 pb-4">
                    <span className="flex size-9 items-center justify-center rounded-md border border-line bg-surface-2">
                      <Icon
                        className="size-4.5 text-accent-text"
                        aria-hidden="true"
                      />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">
                      {item.title}
                    </h3>
                  </div>
                  <p className="flex-1 border-t border-line px-5 py-4 text-sm text-fg-muted">
                    {withName(item.body)}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
