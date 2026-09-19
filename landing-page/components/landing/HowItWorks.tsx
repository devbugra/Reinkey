import { useTranslations } from "next-intl";
import { Check, Lock } from "lucide-react";
import { anchors, withName } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spotlight } from "@/components/ui/Spotlight";
import { cn } from "@/lib/utils";

/*
 * ADIM GÖRSELLERİ. Her adımın üstünde, o adımda ekranda ne olduğunu
 * gösteren küçük bir arayüz parçası: politika kaydı, kanal açma işlemi,
 * kupon akışı + tahsilat. Protokol metni (alan adları, tutarlar) çevrilmez;
 * ajanın gördüğü dünya bu. Değerler Playground ve hero simülasyonuyla aynı.
 */
function Row({
  k,
  v,
  tone = "fg",
  className,
}: {
  k: string;
  v: string;
  tone?: "fg" | "accent" | "muted" | "success";
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="truncate text-fg-subtle">{k}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          tone === "fg" && "text-fg",
          tone === "accent" && "text-accent-text",
          tone === "muted" && "text-fg-muted",
          tone === "success" && "text-success",
        )}
      >
        {v}
      </span>
    </div>
  );
}

function PolicyVisual() {
  return (
    <div dir="ltr" className="flex h-full flex-col justify-between font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="text-fg-muted">reinkey.account</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] text-accent-text">
          <Lock className="size-2.5" aria-hidden="true" /> on-chain
        </span>
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2/60 p-3">
        <Row k="daily_cap" v="5.0000 USDC" />
        <Row k="per_tx_cap" v="1.0000 USDC" />
        <Row k="payees" v="[demo-seller]" tone="accent" />
        <Row k="expires" v="+30d" tone="muted" />
      </div>
    </div>
  );
}

function OpenVisual() {
  return (
    <div dir="ltr" className="flex h-full flex-col justify-between font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="text-fg">channel.open</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-accent-text">
          <Check className="size-3" aria-hidden="true" /> ≈5 s · ledger
        </span>
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2/60 p-3">
        <Row k="deposit" v="1.0000 USDC" />
        <Row k="payee" v="demo-seller" tone="accent" />
        <Row k="expires" v="+24h" tone="muted" />
        <div className="mt-1.5 border-t border-line pt-2">
          <Row k="daily_cap" v="1.0000 / 5.0000" tone="muted" />
          <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-1/5 rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamVisual() {
  const vouchers = [
    ["#998", "0.4990"],
    ["#999", "0.4995"],
    ["#1000", "0.5000"],
  ];
  return (
    <div dir="ltr" className="flex h-full flex-col justify-between font-mono text-[11px]">
      <div className="flex flex-col gap-1">
        {vouchers.map(([n, amount]) => (
          <div key={n} className="flex items-center gap-2">
            <span className="rounded bg-success-bg px-1 text-[10px] text-success">OK</span>
            <span className="text-fg">voucher {n}</span>
            <span className="text-fg-muted">{amount}</span>
            <span className="ms-auto text-fg-subtle">~2 ms</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border border-accent/30 bg-accent/8 p-3">
        <Row k="channel.claim" v="1000 → 1 tx" tone="accent" />
        <Row k="refund → agent" v="0.5000 USDC" tone="muted" />
      </div>
    </div>
  );
}

const VISUALS = [PolicyVisual, OpenVisual, StreamVisual];

export function HowItWorks() {
  const t = useTranslations("howItWorks");
  const steps = t.raw("steps") as {
    step: string;
    title: string;
    body: string;
  }[];

  return (
    <section
      id={anchors.howItWorks.slice(1)}
      aria-labelledby="nasil-baslik"
      className="section-rule py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("subtitle")}
          titleId="nasil-baslik"
        />

        <ol className="relative mt-14 grid gap-5 md:grid-cols-3">
          {/* Adımları bağlayan hat: kartların arkasında, yalnızca geniş ekranda. */}
          <span
            aria-hidden="true"
            className="rail-draw absolute inset-x-12 top-8 hidden h-px md:block"
            style={{ backgroundImage: "linear-gradient(90deg, transparent, var(--line-strong) 15%, var(--line-strong) 85%, transparent)" }}
          />
          {steps.map((step, i) => {
            const Visual = VISUALS[i] ?? PolicyVisual;
            return (
              <Reveal key={step.step} as="li" delay={i * 80} className="h-full">
                <Spotlight as="div" className="card card-hover flex h-full flex-col overflow-hidden rounded-lg">
                  <div className="relative h-48 border-b border-line bg-bg p-4">
                    <span
                      aria-hidden="true"
                      className="bg-dots pointer-events-none absolute inset-0 opacity-60"
                    />
                    <div className="relative h-full">
                      <Visual />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <span
                      dir="ltr"
                      className="gradient-text font-display text-3xl font-semibold tracking-tight"
                    >
                      {step.step}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                    <p className="mt-2.5 text-sm text-fg-muted">{withName(step.body)}</p>
                  </div>
                </Spotlight>
              </Reveal>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
