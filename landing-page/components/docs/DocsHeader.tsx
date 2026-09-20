"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { external, routes } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/landing/Wordmark";
import { DocsSidebar } from "./DocsSidebar";

export function DocsHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-6">
        <Wordmark href="/en" />
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-muted">Docs</span>
        <nav aria-label="Products" className="ms-auto hidden items-center gap-1 text-sm md:flex">
          <Link href="/en/meter" className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:text-fg">Meter</Link>
          <Link href="/en/reins" className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:text-fg">Reins</Link>
          <Link href="/en/float" className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:text-fg">Float</Link>
          <a href={external.repo} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:text-fg">GitHub</a>
          <a href={routes.openapi} className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:text-fg">OpenAPI</a>
        </nav>
        <Button href={routes.panel} size="sm" variant="secondary" className="ms-auto md:ms-2">
          Console
        </Button>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-9 items-center justify-center rounded-full border border-line text-fg lg:hidden"
        >
          {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {open ? (
        <div className="fixed inset-x-0 top-14 bottom-0 overflow-y-auto border-t border-line bg-bg px-6 py-8 lg:hidden">
          <DocsSidebar onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </header>
  );
}
