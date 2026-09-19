import { useTranslations } from "next-intl";
import { ArrowRight, Check, Minus } from "lucide-react";
import { products, routes, site, type ProductKey } from "@/content/site";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { Button } from "@/components/ui/Button";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Container } from "@/components/ui/Container";
import { GradientText } from "@/components/ui/GradientText";
import { Reveal } from "@/components/ui/Reveal";
import { RiseIn } from "@/components/ui/RiseIn";
import { ProductMark } from "./ProductMark";

/**
 * ÜRÜN SAYFASI (Meter ve Reins aynı iskeleti paylaşır).
 *
 * Sıra ana sayfayla aynı argümanı küçük ölçekte kurar: ne (hero) → kanıt
 * (çalışan kod ve gerçek yanıt) → neler var (özellikler) → neler yok (dürüst
 * sınırlar) → başla. Metin `messages/*.json` → `products.<key>` altındadır;
 * kod örnekleri dil bağımsızdır ve sayfadan verilir.
 */
export function ProductPage({
  product,
  code,
  response,
  quickstart,
}: {
  product: ProductKey;
  code: { title: string; body: string; install: string };
  response: { title: string; body: string };
  quickstart: string;
}) {
  const t = useTranslations(`products.${product}`);
  const bullets = t.raw("bullets") as string[];
  const features = t.raw("features") as { title: string; body: string }[];
  const limits = t.raw("limits") as string[];
  const name = products[product].name;

  return (
    <>
      <section className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
        <AuroraBackground />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <RiseIn>
              <p
                dir="ltr"
                className="flex items-center justify-center gap-2.5 text-xs font-medium tracking-[0.18em] text-fg-subtle uppercase"
              >
                <ProductMark product={product} className="size-5 text-accent-text" />
                {site.name} {name}
              </p>
            </RiseIn>
            <RiseIn delay={60}>
              <h1 className="mt-7 text-5xl leading-[1.02] font-semibold tracking-tight">
                <GradientText>{t("title")}</GradientText>
              </h1>
            </RiseIn>
            <RiseIn delay={120}>
              <p className="mx-auto mt-7 max-w-[60ch] text-lg text-fg-muted">{t("subtitle")}</p>
            </RiseIn>
            <RiseIn delay={180}>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                <Button href={quickstart} size="lg">
                  {t("ctaPrimary")}
                  <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </Button>
                <Button href={routes.panel} variant="secondary" size="lg">
                  {t("ctaSecondary")}
                </Button>
              </div>
              <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-fg-muted">
                    <Check className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </RiseIn>
          </div>
        </Container>
      </section>

      <section aria-labelledby="kod-baslik" className="border-t border-line bg-bg-alt py-20 sm:py-28">
        <Container>
          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
            <Reveal className="lg:col-span-5">
              <h2 id="kod-baslik" className="text-3xl font-semibold">
                {t("codeTitle")}
              </h2>
              <p className="mt-5 text-fg-muted">{t("codeLead")}</p>
              <CodeBlock code={code.install} title="bash" className="mt-8" />
              <h3 className="mt-12 text-xl font-semibold">{t("responseTitle")}</h3>
              <p className="mt-3 text-fg-muted">{t("responseLead")}</p>
            </Reveal>
            <Reveal delay={60} className="flex flex-col gap-4 lg:col-span-7">
              <CodeBlock code={code.body} title={code.title} />
              <CodeBlock code={response.body} title={response.title} />
            </Reveal>
          </div>
        </Container>
      </section>

      <section aria-label={name} className="border-t border-line py-20 sm:py-28">
        <Container>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} as="li" delay={(i % 3) * 60} className="h-full">
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-[var(--card-shadow)]">
                  <h3 className="px-5 py-4 text-base font-semibold">{f.title}</h3>
                  <p className="flex-1 border-t border-line px-5 py-4 text-sm text-fg-muted">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="sinir-baslik" className="border-t border-line bg-bg-alt py-20 sm:py-24">
        <Container>
          <Reveal className="mx-auto max-w-3xl">
            <h2 id="sinir-baslik" className="text-3xl font-semibold">
              {t("limitsTitle")}
            </h2>
            <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line">
              {limits.map((l) => (
                <li key={l} className="flex items-start gap-3 py-4 text-fg-muted">
                  <Minus className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="basla-baslik" className="relative overflow-hidden border-t border-line py-24 sm:py-28">
        <AuroraBackground />
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="basla-baslik" className="text-4xl font-semibold">
              {t("ctaTitle")}
            </h2>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={quickstart} size="lg">
                {t("ctaPrimary")}
                <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
              <Button href={routes.panel} variant="secondary" size="lg">
                {t("ctaSecondary")}
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
