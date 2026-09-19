import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { anchors, docs, products, site, type ProductKey } from "@/content/site";
import { snippets } from "@/content/snippets";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spotlight } from "@/components/ui/Spotlight";
import { cn } from "@/lib/utils";
import { ProductMark } from "./ProductMark";

const INSTALL: Record<ProductKey, string> = {
  meter: snippets.meterInstall,
  reins: snippets.reinsInstall,
};
const QUICKSTART: Record<ProductKey, string> = {
  meter: docs.quickstartMeter,
  reins: docs.quickstartReins,
};

/** Her ürünün kartın üst kenarında kendi ışığı: Meter gök mavisi, Reins lavanta. */
const TINT: Record<ProductKey, string> = {
  meter: "var(--brand-sky)",
  reins: "var(--brand-lavender)",
};

/**
 * İKİ ÜRÜN.
 *
 * Hero "ne" olduğunu söyler; bu bölüm "hangisi benim için" sorusunu cevaplar.
 * Ziyaretçi ya satıcıdır ya ajan sahibi: iki kart yan yana durur ve her biri
 * kendi sayfasına, kendi kurulum satırına ve kendi hızlı başlangıcına gider.
 * Kartlar eşittir; ürünlerden biri ötekinin eklentisi değildir.
 */
export function Products() {
  const t = useTranslations("productsSection");
  const tp = useTranslations("products");
  const locale = useLocale();

  return (
    <section
      id={anchors.products.slice(1)}
      aria-labelledby="urunler-baslik"
      className="section-rule bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="urunler-baslik"
          lead={t("lead", { name: site.name })}
        />

        <ul className="mt-14 grid gap-5 lg:grid-cols-2">
          {(Object.keys(products) as ProductKey[]).map((key, i) => {
            const product = products[key];
            const bullets = tp.raw(`${key}.bullets`) as string[];
            return (
              <Reveal key={key} as="li" delay={i * 80} className="h-full">
                <Spotlight as="article" className="card card-hover flex h-full flex-col overflow-hidden rounded-xl">
                  {/* Üst kenar ışığı ve köşeden sönen renk lekesi */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px"
                    style={{ backgroundImage: `linear-gradient(90deg, transparent, ${TINT[key]} 50%, transparent)` }}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 -end-24 size-72 rounded-full opacity-40 blur-3xl"
                    style={{ background: `radial-gradient(circle, color-mix(in srgb, ${TINT[key]} 40%, transparent), transparent 70%)` }}
                  />
                  <div className="flex-1 px-6 pt-6 pb-5 sm:px-7 sm:pt-7">
                    <p className="eyebrow text-fg-subtle">{t(`for.${key}`)}</p>
                    <h3 className="mt-5 flex items-center gap-3 text-2xl font-semibold">
                      <span
                        className={cn(
                          "flex size-11 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)]",
                        )}
                        style={{
                          borderColor: `color-mix(in srgb, ${TINT[key]} 35%, transparent)`,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${TINT[key]} 22%, transparent), color-mix(in srgb, ${TINT[key]} 8%, transparent))`,
                          color: TINT[key],
                        }}
                      >
                        <ProductMark product={key} className="size-5" />
                      </span>
                      <span dir="ltr">
                        <span className="text-fg-muted">{site.name}</span> {product.name}
                      </span>
                    </h3>
                    <p className="mt-4 text-lg text-fg">{tp(`${key}.tagline`)}</p>
                    <ul className="mt-5 flex flex-col gap-2.5">
                      {bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-fg-muted">
                          <Check className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-t border-line bg-bg/40 px-6 py-5 sm:px-7">
                    <CodeBlock code={INSTALL[key]} title="bash" />
                    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                      <a
                        href={`/${locale}${product.path}`}
                        className="group inline-flex items-center gap-1.5 font-medium text-fg transition-colors duration-150 hover:text-accent-text"
                      >
                        {t("learnMore", { product: product.name })}
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                      </a>
                      <a
                        href={QUICKSTART[key]}
                        className="text-fg-muted transition-colors duration-150 hover:text-fg"
                      >
                        {t("docs")}
                      </a>
                    </div>
                  </div>
                </Spotlight>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
