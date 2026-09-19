import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 " +
  "px-3 py-1 text-xs text-fg-muted";

/** `href` verilirse bağlantı, verilmezse düz etiket olarak render edilir. */
export function Badge({
  className,
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  if (href) {
    return (
      <a
        href={href}
        className={cn(
          base,
          "transition-colors duration-150 hover:border-line-strong hover:text-fg",
          className,
        )}
      >
        {children}
      </a>
    );
  }

  return <span className={cn(base, className)}>{children}</span>;
}
