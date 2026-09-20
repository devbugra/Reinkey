import type { Metadata } from "next";
import Link from "next/link";
import { docsNav } from "@/content/docs";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/** `/docs` altındaki eşleşmeyen adresler. Düzen (başlık, kenar çubuğu) korunur. */
export default function DocsNotFound() {
  return (
    <div className="docs">
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-5 leading-relaxed text-fg-muted">
        This documentation page doesn&apos;t exist. It may have been renamed. Start from the{" "}
        <Link
          href="/docs"
          className="text-accent-text underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          introduction
        </Link>
        , or pick a page:
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {docsNav.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">{group.title}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-fg-muted transition-colors hover:text-fg">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
