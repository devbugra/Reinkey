import { useTranslations } from "next-intl";
import { site } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

/**
 * KARŞILAŞTIRMA.
 *
 * İki şerit: solda bugünkü x402 `exact` akışı (her ödeme bir işlem), sağda
 * `channel` akışı (kanal bir kez açılır, kuponlar zincire gitmez). Her
 * şeridin üstünde ritmi gösteren küçük bir "nabız": solda beş blok sırayla
 * ve ağır yanar (işlem başına ~5 sn), sağda ince çubuklar akar (kupon
 * başına milisaniye). Adımlar aynı dikey ölçekte durur; son satır iki
 * tarafın bedelini rakamla koyar. Tek sayısal iddia "1000 ödeme = 2 işlem".
 */
function Pulse({ tone }: { tone: "before" | "after" }) {
  if (tone === "before") {
    return (
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="tick block h-2 w-7 rounded-sm bg-danger"
            style={{ "--tick-dur": "5s", "--tick-delay": `${i * 1}s` } as React.CSSProperties}
          />
        ))}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex items-center gap-[3px]">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="tick block h-2 w-[3px] rounded-full bg-accent"
          style={{ "--tick-dur": "1.4s", "--tick-delay": `${i * 0.05}s` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function Lane({
  title,
  rate,
  steps,
  note,
  tone,
}: {
  title: string;
  rate: string;
  steps: string[];
  note: string;
  tone: "before" | "after";
}) {
  const after = tone === "after";
  const body = steps.slice(0, -1);
  const result = steps[steps.length - 1];
  return (
    <div className={cn("relative flex flex-col p-6 sm:p-8", after && "bg-surface-2/40")}>
      {after ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ backgroundImage: "var(--accent-gradient)" }}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("eyebrow", after ? "text-accent-text" : "text-fg-subtle")}>{title}</p>
        <Pulse tone={tone} />
      </div>
      <p dir="ltr" className="mt-2 font-mono text-xs text-fg-subtle rtl:text-end">{rate}</p>

      <ol className="relative mt-7 flex flex-col gap-4 border-s border-line ps-6">
        {body.map((step, i) => (
          <li key={step} className="relative text-sm text-fg-muted">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1.5 -start-[1.5rem] size-2.5 -translate-x-1/2 rounded-full border-2 border-bg",
                after ? "bg-accent" : "bg-fg-subtle/60",
              )}
            />
            <span className="me-2 font-mono text-xs text-fg-subtle">0{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <p
        dir="ltr"
        className={cn(
          "mt-7 rounded-lg border px-5 py-4 font-display text-xl font-semibold tracking-tight rtl:text-end sm:text-2xl",
          after
            ? "border-transparent bg-accent text-accent-contrast shadow-[var(--glow-accent)]"
            : "border-danger/30 bg-danger-bg text-danger",
        )}
      >
        {result}
      </p>
      <p className="mt-5 max-w-[38ch] text-sm text-fg-muted">{note}</p>
    </div>
  );
}

export function Compare() {
  const t = useTranslations("compare");
  return (
    <section
      aria-labelledby="fark-baslik"
      className="section-rule relative py-20 sm:py-28"
    >
      <div aria-hidden="true" className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[40rem]" />
      <Container>
        <Reveal>
          <p className="eyebrow text-accent-text">{t("eyebrow")}</p>
          <h2
            id="fark-baslik"
            className="mt-5 max-w-[20ch] text-4xl font-semibold"
          >
            {t("title")}
          </h2>
        </Reveal>

        <Reveal delay={80} className="mt-14">
          <div className="card overflow-hidden rounded-xl">
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              <Lane
                tone="before"
                title={t("todayTitle")}
                rate={t("beforeRate")}
                steps={t.raw("todaySteps") as string[]}
                note={t("todayNote")}
              />
              <Lane
                tone="after"
                title={t("withTitle", { name: site.name })}
                rate={t("afterRate")}
                steps={t.raw("withSteps") as string[]}
                note={t("withNote")}
              />
            </div>
          </div>
          <p className="mt-6 text-xs text-fg-subtle">{t("measureNote")}</p>
        </Reveal>
      </Container>
    </section>
  );
}
