"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { docsPages } from "@/content/docs";

export function DocsPager() {
  const pathname = usePathname();
  const i = docsPages.findIndex((p) => p.href === pathname);
  if (i === -1) return null;
  const prev = docsPages[i - 1];
  const next = docsPages[i + 1];
  const cls =
    "flex flex-1 flex-col gap-1 rounded-lg border border-line px-5 py-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-1";
  return (
    <nav aria-label="Pagination" className="mt-16 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row">
      {prev ? (
        <Link href={prev.href} className={cls}>
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Previous
          </span>
          <span className="text-sm font-medium text-fg">{prev.label}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <Link href={next.href} className={`${cls} items-end text-end`}>
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            Next <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-fg">{next.label}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
    </nav>
  );
}
