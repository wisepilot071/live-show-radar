import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "onInk";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none " +
  "transition-[background-color,color,border-color,transform,box-shadow] duration-[var(--duration-fast)] " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-signal text-on-signal shadow-[inset_0_-1px_0_rgb(32_40_32/0.12)] hover:bg-signal-hover hover:shadow-signal",
  secondary: "border border-line-strong bg-surface text-fg hover:border-fg hover:bg-surface",
  ghost: "text-fg-secondary hover:text-fg hover:bg-surface-2",
  /** Outline button for dark ink panels. */
  onInk: "border border-on-ink/35 text-on-ink hover:border-on-ink hover:bg-on-ink/10",
  quiet: "text-fg-secondary underline underline-offset-4 decoration-line-strong hover:text-fg hover:decoration-signal-ink",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-sm rounded-full",
  lg: "min-h-13 px-6 text-base rounded-full",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], variant === "quiet" ? "min-h-11 px-1 text-sm" : sizes[size], className);
}

export function Button({
  variant,
  size,
  leadingIcon,
  trailingIcon,
  className,
  children,
  loading,
  type = "button",
  ...rest
}: CommonProps & ComponentPropsWithoutRef<"button"> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

/** Navigation that looks like a button. Always a real <a> for routing and middle-click. */
export function ButtonLink({
  variant,
  size,
  leadingIcon,
  trailingIcon,
  className,
  children,
  href,
  ...rest
}: CommonProps & { href: string } & Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
