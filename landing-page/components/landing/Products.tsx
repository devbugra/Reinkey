import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { anchors, docs, products, site, type ProductKey } from "@/content/site";
import { snippets } from "@/content/snippets";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProductMark } from "./ProductMark";

const INSTALL: Record<ProductKey, string> = {
  meter: snippets.meterInstall,
  reins: snippets.reinsInstall,
};
const QUICKSTART: Record<ProductKey, string> = {
  meter: docs.quickstartMeter,
  reins: docs.quickstartReins,
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
      className="border-t border-line bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          titleId="urunler-baslik"
          lead={t("lead", { name: site.name })}
        />

        <ul className="mt-14 grid gap-4 lg:grid-cols-2">
          {(Object.keys(products) as ProductKey[]).map((key, i) => {
            const product = products[key];
            const bullets = tp.raw(`${key}.bullets`) as string[];
            return (
              <Reveal key={key} as="li" delay={i * 60} className="h-full">
                <article className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]">
                  <div className="flex-1 px-6 pt-6 pb-5 sm:px-7 sm:pt-7">
                    <p className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">
                      {t(`for.${key}`)}
                    </p>
                    <h3 className="mt-4 flex items-center gap-3 text-2xl font-semibold">
                      <span className="flex size-10 items-center justify-center rounded-md border border-line bg-surface-2 text-accent-text">
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

                  <div className="border-t border-line px-6 py-5 sm:px-7">
                    <CodeBlock code={INSTALL[key]} title="bash" />
                    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                      <a
                        href={`/${locale}${product.path}`}
                        className="inline-flex items-center gap-1.5 font-medium text-fg transition-colors duration-150 hover:text-accent-text"
                      >
                        {t("learnMore", { product: product.name })}
                        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                      </a>
                      <a
                        href={QUICKSTART[key]}
                        className="text-fg-muted transition-colors duration-150 hover:text-fg"
                      >
                        {t("docs")}
                      </a>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
