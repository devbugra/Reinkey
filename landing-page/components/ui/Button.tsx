import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "whitespace-nowrap transition-[background-color,border-color,color,opacity] " +
  "duration-150 ease-(--ease-out-expo) disabled:pointer-events-none disabled:opacity-50";

/**
 * Birincil eylem marka renginde (hero videosunun paletinden): gök mavisi
 * zemin + gece mavisi yazı.
 * Renkler globals.css'teki --primary token'larından gelir.
 */
const variants: Record<Variant, string> = {
  primary: "btn-primary bg-primary text-primary-fg",
  secondary:
    "btn-secondary border border-line-strong bg-surface-1 text-fg hover:border-fg/30 hover:bg-surface-2",
  ghost: "text-fg-muted hover:text-fg",
  danger: "border border-danger/40 bg-danger-bg text-danger hover:opacity-85",
  accent: "bg-accent text-accent-contrast hover:opacity-85",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  loading?: boolean;
  children: React.ReactNode;
};

/** `href` verilirse `<Link>`, verilmezse `<button>` render edilir. */
type AnchorProps = BaseProps &
  Omit<React.ComponentPropsWithoutRef<typeof Link>, keyof BaseProps>;

type NativeButtonProps = BaseProps &
  Omit<React.ComponentPropsWithoutRef<"button">, keyof BaseProps> & {
    href?: never;
  };

export function Button(props: AnchorProps | NativeButtonProps) {
  const {
    variant = "primary",
    size = "md",
    className,
    children,
    loading,
    ...rest
  } = props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if (rest.href !== undefined) {
    return (
      <Link
        {...(rest as React.ComponentPropsWithoutRef<typeof Link>)}
        className={classes}
      >
        {children}
      </Link>
    );
  }

  const native = rest as React.ComponentPropsWithoutRef<"button">;
  return (
    <button
      type="button"
      {...native}
      disabled={native.disabled || loading}
      className={classes}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
