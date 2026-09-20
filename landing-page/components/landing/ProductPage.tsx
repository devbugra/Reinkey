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
import { Spotlight } from "@/components/ui/Spotlight";
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
  // Konsol ürünün kendi görünümünde açılır (Canlı varsayılan).
  const consoleHref = product === "float" ? `${routes.panel}/?view=float` : product === "reins" ? `${routes.panel}/?view=reins` : routes.panel;

  return (
    <>
      <section className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
        <AuroraBackground />
        <span aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <RiseIn>
              <p
                dir="ltr"
                className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface-1/50 py-1.5 ps-2 pe-4 text-xs font-medium tracking-[0.16em] text-fg-muted uppercase backdrop-blur-md"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-accent/15 text-accent-text">
                  <ProductMark product={product} className="size-3.5" />
                </span>
                {site.name} {name}
              </p>
            </RiseIn>
            <RiseIn delay={60}>
              <h1 className="text-glow mt-8 text-5xl leading-[1.02] font-semibold tracking-tight">
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
                <Button href={consoleHref} variant="secondary" size="lg">
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

      <section aria-labelledby="kod-baslik" className="section-rule bg-bg-alt py-20 sm:py-28">
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

      <section aria-label={name} className="section-rule py-20 sm:py-28">
        <Container>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} as="li" delay={(i % 3) * 60} className="h-full">
                <Spotlight as="div" className="card card-hover flex h-full flex-col overflow-hidden rounded-lg">
                  <h3 className="flex items-center gap-3 px-5 py-4 text-base font-semibold">
                    <span dir="ltr" className="font-mono text-xs text-accent-text">0{i + 1}</span>
                    {f.title}
                  </h3>
                  <p className="flex-1 border-t border-line px-5 py-4 text-sm text-fg-muted">{f.body}</p>
                </Spotlight>
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="sinir-baslik" className="section-rule bg-bg-alt py-20 sm:py-24">
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

      <section aria-labelledby="basla-baslik" className="section-rule relative overflow-hidden py-24 sm:py-28">
        <AuroraBackground />
        <span aria-hidden="true" className="bg-grid bg-grid-bottom pointer-events-none absolute inset-0 -z-10 opacity-70" />
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="basla-baslik" className="text-glow text-4xl font-semibold">
              {t("ctaTitle")}
            </h2>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={quickstart} size="lg">
                {t("ctaPrimary")}
                <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
              <Button href={consoleHref} variant="secondary" size="lg">
                {t("ctaSecondary")}
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
