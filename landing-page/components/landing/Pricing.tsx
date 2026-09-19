import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { anchors, routes, withName } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  badge?: string;
  cta: string;
  trial: string;
  features: string[];
};

/** Plan sırasıyla eşleşir: testnet entegrasyona, satıcı canlı panele, kendi facilitator'ın şemaya. */
const PLAN_HREF = [routes.llms, routes.panel, routes.openapi];

/**
 * DEMO SATICININ FİYATLARI.
 *
 * Yol ve tutar protokol metnidir, çevrilmez. Değerler backend'deki demo
 * satıcıyla aynıdır (meter: 5000 taban birim / çağrı, 200 taban birim /
 * token; 1 USDC = 10^7 taban birim). Uydurma değil, canlı demonun fiyatı.
 */
const ENDPOINTS = [
  { method: "GET", path: "/demo/book", price: "0.0005", unit: "/ call" },
  { method: "POST", path: "/demo/chat", price: "0.00002", unit: "/ token" },
];

export function Pricing() {
  const t = useTranslations("pricing");
  const plans = t.raw("plans") as Plan[];

  return (
    <section
      id={anchors.pricing.slice(1)}
      aria-labelledby="fiyat-baslik"
      className="border-t border-line bg-bg-alt py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="fiyat-baslik"
        />

        <ul className="mt-14 grid items-start gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const featured = Boolean(plan.badge);
            return (
              <Reveal key={plan.name} as="li" delay={i * 60} className="h-full">
                <div
                  className={cn(
                    "flex h-full flex-col rounded-lg border bg-surface-1 p-6 shadow-[var(--card-shadow)]",
                    featured ? "border-accent/40 bg-surface-2" : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {plan.badge ? (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-contrast">
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm text-fg-muted">
                    {plan.description}
                  </p>

                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span
                      dir="ltr"
                      className="text-4xl font-semibold tracking-tight"
                    >
                      {plan.price}
                    </span>
                    <span className="text-sm text-fg-subtle">
                      {plan.period}
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm text-fg-muted">{plan.trial}</p>

                  <Button
                    href={PLAN_HREF[i] ?? anchors.closing}
                    variant={featured ? "primary" : "secondary"}
                    size="md"
                    className="mt-6 w-full"
                  >
                    {plan.cta}
                  </Button>

                  <ul className="mt-7 flex flex-1 flex-col gap-2.5 border-t border-line pt-6">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-fg-muted"
                      >
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-accent-text"
                          aria-hidden="true"
                        />
                        {withName(feature)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </ul>

        <p className="mt-8 max-w-[65ch] text-sm text-fg-subtle">{t("note")}</p>

        {/* Uç tablosu: plan kartlarının altında, ayrı ve daha sakin bir blok.
            Planlarla aynı görsel ağırlığı almamalı — bu bir seçenek değil,
            ajanın ağda göreceği fiyat listesi. */}
        <Reveal
          as="div"
          delay={200}
          className="mt-10 rounded-lg border border-line bg-surface-1 p-6"
        >
          <h3 className="text-base font-semibold">{t("endpoints.title")}</h3>
          <p className="mt-1.5 max-w-[70ch] text-sm text-fg-muted">
            {t("endpoints.lead")}
          </p>
          <ul dir="ltr" className="mt-5 grid gap-3 sm:grid-cols-2">
            {ENDPOINTS.map((item) => (
              <li
                key={`${item.method} ${item.path}`}
                className="flex items-baseline justify-between gap-3 rounded-md border border-line bg-surface-2 px-4 py-3 font-mono text-sm"
              >
                <span className="truncate text-fg-muted">
                  <span className="text-accent-text">{item.method}</span>{" "}
                  {item.path}
                </span>
                <span className="shrink-0 text-fg tabular-nums">
                  <span className="font-medium">{item.price}</span>{" "}
                  <span className="text-xs text-fg-subtle">USDC {item.unit}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[70ch] text-xs text-fg-subtle">
            {t("endpoints.note")}
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
