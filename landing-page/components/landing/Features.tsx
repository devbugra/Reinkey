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
import { Spotlight } from "@/components/ui/Spotlight";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

const icons = [Code2, Gauge, Lock, ShieldCheck, Fuel, FileCode2];

/**
 * BENTO IZGARA.
 *
 * Altı kutunun hepsi eşit değildir. Üç sıra, her biri altı sütunu tam
 * doldurur: 4+2, 2+4, 3+3. Geniş kutular ürünün iki asıl iddiasıdır (tek
 * satır entegrasyon, tavan zincirde); çapraz dizilim ızgaranın tekdüze
 * okunmasını kırar. Geniş kutuların içinde iddianın kendisi durur: kod
 * satırı ve zincirdeki politika; eşit kutulardan oluşan bir ızgara her
 * maddeyi aynı önemde gösterir ve okuyucuya hiçbir şey söylemez.
 */
const SPAN = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-3",
];

const ONE_LINE = `app.get("/book", rk.meter({ price: 5000n, unit: "request" }), handler);`;

function OneLineVisual() {
  return (
    <div dir="ltr" className="mt-5 max-w-full overflow-x-auto rounded-md border border-line bg-bg px-4 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre text-fg-muted">
      <code>{highlight(ONE_LINE, "ts")}</code>
    </div>
  );
}

function PolicyVisual() {
  const chips = [
    ["daily_cap", "5.0000"],
    ["per_tx_cap", "1.0000"],
    ["payees", "[demo-seller]"],
    ["__check_auth", "✓"],
  ];
  return (
    <ul dir="ltr" className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
      {chips.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5">
          <span className="text-fg-subtle">{k}</span>
          <span className={cn(v === "✓" ? "text-success" : "text-fg")}>{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function Features() {
  const t = useTranslations("features");
  const items = t.raw("items") as { title: string; body: string }[];

  return (
    <section
      id={anchors.features.slice(1)}
      aria-labelledby="urun-baslik"
      className="section-rule py-20 sm:py-28"
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
            const wide = i === 0 || i === 3;
            return (
              <Reveal
                key={item.title}
                as="li"
                delay={(i % 3) * 60}
                className={cn("h-full min-w-0", SPAN[i])}
              >
                <Spotlight as="div" className="card card-hover flex h-full min-w-0 flex-col overflow-hidden rounded-lg">
                  {wide ? (
                    <span aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-50" />
                  ) : null}
                  <div className="px-5 pt-5 pb-4">
                    <span className="flex size-9 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent-text shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)]">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">
                      {item.title}
                    </h3>
                    {i === 0 ? <OneLineVisual /> : null}
                    {i === 3 ? <PolicyVisual /> : null}
                  </div>
                  <p className="flex-1 border-t border-line px-5 py-4 text-sm text-fg-muted">
                    {withName(item.body)}
                  </p>
                </Spotlight>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
