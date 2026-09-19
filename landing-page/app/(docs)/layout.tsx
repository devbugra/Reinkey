import type { Metadata } from "next";
import { DocsHeader } from "@/components/docs/DocsHeader";
import { DocsPager } from "@/components/docs/DocsPager";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { site } from "@/content/site";
import { env } from "@/lib/env";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

/**
 * BELGELER: ayrı bir kök düzen.
 *
 * Tanıtım sitesi iki dillidir ve dil önekiyle yaşar (`(landing)/[locale]`).
 * Belgeler tek dildedir (İngilizce): kod, paket adları ve hata kodları zaten
 * İngilizce ve iki dilde bakımı yapılmayan belge, eskimiş belgedir. Bu yüzden
 * `/docs` dil önekinin dışındadır ve `proxy.ts` ona dokunmaz.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${site.name} Docs`, template: `%s — ${site.name} Docs` },
  description:
    "Build with Reinkey: usage-based billing over x402 (Meter) and on-chain spending authority for agents (Reins), on Stellar.",
  robots: { index: true, follow: true },
};

export default function DocsLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${fontVariables} h-full scroll-smooth antialiased`}>
      <body className="flex min-h-full flex-col">
        <DocsHeader />
        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-12 px-6">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
            <DocsSidebar />
          </aside>
          <main id="main-content" className="min-w-0 flex-1 py-10 lg:py-12">
            <article className="docs mx-auto max-w-3xl">{children}</article>
            <div className="mx-auto max-w-3xl">
              <DocsPager />
              <p className="mt-10 text-xs text-fg-subtle">
                {site.name} runs on {site.network}. The contracts are unaudited. Don&apos;t send mainnet funds.
              </p>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
