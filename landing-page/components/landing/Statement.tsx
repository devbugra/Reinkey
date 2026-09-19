import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { Words } from "@/components/ui/Words";

/**
 * Tek cümlelik tam genişlik bölüm. Sayfanın ortasında nefes açar ve ritmi
 * kırar: her bölümün kart ızgarası olduğu bir sayfada, hiçbir şeyi olmayan
 * bir bölüm en çok dikkat çeken bölümdür.
 *
 * Zemin bilerek ters çevrilir (koyu sayfada açık blok); böylece bölüm
 * sayfadan ayrışır.
 */
export function Statement() {
  const t = useTranslations("statement");
  return (
    <section className="bg-fg py-24 text-bg sm:py-36">
      <Container>
        <Reveal>
          {/* Reveal görünürlüğü, Words ise kelime sırasını yönetir: bölüm
              ekrana girdiğinde cümle tek blok hâlinde değil, okunacak hızda
              kurulur. */}
          <p className="mx-auto max-w-[20ch] text-center text-4xl font-semibold tracking-tight sm:text-5xl">
            <Words text={t("text")} step={90} />
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
