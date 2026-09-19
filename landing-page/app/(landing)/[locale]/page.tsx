import { setRequestLocale } from "next-intl/server";
import { Architecture } from "@/components/landing/Architecture";
import { Audience } from "@/components/landing/Audience";
import { Closing } from "@/components/landing/Closing";
import { Compare } from "@/components/landing/Compare";
import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Limits } from "@/components/landing/Limits";
import { Nav } from "@/components/landing/Nav";
import { PlaygroundSection } from "@/components/landing/PlaygroundSection";
import { Pricing } from "@/components/landing/Pricing";
import { Products } from "@/components/landing/Products";
import { Problem } from "@/components/landing/Problem";
import { Statement } from "@/components/landing/Statement";

/**
 * Bölüm sırası bir argümandır:
 * 1) ne olduğunu söyle (Hero), hangisinin kimin için olduğunu göster (Products)
 * 2) HEMEN kanıtla — ziyaretçi ajan olup sınıra kendisi çarpsın (Playground)
 * 3) neden önemli olduğunu göster (Compare, Problem)
 * 4) nefes aldır (Statement)
 * 5) nasıl çalıştığını ve neyin nerede durduğunu anlat (HowItWorks, Architecture, Features)
 * 6) sınırları dürüstçe koy (Limits)
 * 7) kime uygun, ne kadar, ne merak ediliyor (Audience, Pricing, Faq)
 * 8) kapat — kayıt değil, çağrılabilir bir URL (Closing)
 *
 * Zemin dönüşümlüdür: bg → bg-alt → bg … Bölümleri ayıran çizgi değil, zeminin
 * kendisidir; sayfa böylece bölümlerden değil bloklardan oluşur.
 */
export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Nav />
      <main id="main-content" className="flex-1">
        <Hero />
        <Products />
        <PlaygroundSection />
        <Compare />
        <Problem />
        <Statement />
        <HowItWorks />
        <Architecture />
        <Features />
        <Limits />
        <Audience />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
