import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { isValidElement } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";

/**
 * MDX → tasarım sistemi. Belgeler düz markdown yazılır; tipografi ve kod
 * blokları buradan gelir, sayfalarda sınıf adı yazılmaz.
 */
const LANG_TITLE: Record<string, string> = { ts: "TypeScript", bash: "bash", http: "HTTP", json: "JSON", rust: "Rust" };

function Pre({ children }: { children?: React.ReactNode }) {
  if (isValidElement<{ className?: string; children?: string }>(children)) {
    const lang = children.props.className?.replace("language-", "") ?? "";
    return <CodeBlock code={String(children.props.children ?? "").trimEnd()} title={LANG_TITLE[lang] ?? lang} className="my-6" />;
  }
  return <pre>{children}</pre>;
}

const components: MDXComponents = {
  h1: (p) => <h1 className="text-4xl font-semibold tracking-tight" {...p} />,
  h2: (p) => <h2 className="mt-14 scroll-mt-24 border-t border-line pt-10 text-2xl font-semibold" {...p} />,
  h3: (p) => <h3 className="mt-10 scroll-mt-24 text-lg font-semibold" {...p} />,
  p: (p) => <p className="mt-5 leading-relaxed text-fg-muted" {...p} />,
  a: ({ href = "", ...p }) =>
    href.startsWith("/") ? (
      <Link href={href} className="text-accent-text underline decoration-accent/40 underline-offset-4 hover:decoration-accent" {...p} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text underline decoration-accent/40 underline-offset-4 hover:decoration-accent" {...p} />
    ),
  ul: (p) => <ul className="mt-5 flex list-disc flex-col gap-2 ps-5 text-fg-muted marker:text-fg-subtle" {...p} />,
  ol: (p) => <ol className="mt-5 flex list-decimal flex-col gap-2 ps-5 text-fg-muted marker:text-fg-subtle" {...p} />,
  li: (p) => <li className="leading-relaxed" {...p} />,
  strong: (p) => <strong className="font-semibold text-fg" {...p} />,
  code: (p) => <code className="rounded-sm border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[0.85em] text-fg" {...p} />,
  pre: Pre,
  blockquote: (p) => (
    <blockquote className="mt-6 rounded-lg border border-line bg-surface-1 px-5 py-1 pb-5 text-sm [&_p]:text-fg-muted" {...p} />
  ),
  hr: () => <hr className="my-12 border-line" />,
  table: (p) => (
    <div className="mt-6 overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] text-start text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border-b border-line bg-surface-1 px-4 py-2.5 text-start text-xs font-medium text-fg-subtle" {...p} />,
  td: (p) => <td className="border-b border-line px-4 py-2.5 align-top text-fg-muted [tr:last-child_&]:border-b-0" {...p} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
