import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "lg" | "md" | "sm";

export const buttonSizeClasses: Record<ButtonSize, string> = {
  lg: "min-h-13 px-7 text-base", // 52px
  md: "min-h-12 px-6 text-[15px]", // 48px
  sm: "min-h-11 px-4 text-sm", // 44px
};
const sizeClasses = buttonSizeClasses;

export function buttonVariantClasses(
  variant: ButtonVariant,
  onDark = false,
): string {
  if (variant === "text") {
    return "min-h-11 px-3 text-purple underline hover:text-charcoal disabled:no-underline";
  }
  if (variant === "secondary") {
    return "border-[1.5px] border-charcoal bg-white text-charcoal hover:bg-lavender-100";
  }
  // primary
  if (onDark) {
    return "bg-lavender text-charcoal hover:bg-lavender-100";
  }
  return "bg-purple text-white hover:bg-purple-700";
}

export interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the primary variant to lavender/charcoal for use on dark (charcoal) sections. */
  onDark?: boolean;
  loading?: boolean;
  loadingText?: string;
  className?: string;
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 animate-spin rounded-full border-2",
        light
          ? "border-white/40 border-t-white"
          : "border-charcoal/30 border-t-charcoal",
      )}
    />
  );
}

type NativeButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

export function Button({
  variant = "primary",
  size = "lg",
  onDark = false,
  loading = false,
  loadingText,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: NativeButtonProps) {
  const isTextVariant = variant === "text";
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "font-heading inline-flex items-center justify-center gap-2 font-semibold transition-colors",
        "disabled:border-ink-soft disabled:bg-lavender-100 disabled:text-ink-soft disabled:cursor-not-allowed disabled:border-[1.5px] disabled:border-dashed",
        !isTextVariant && "rounded-full",
        sizeClasses[size],
        buttonVariantClasses(variant, onDark),
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner light={variant === "primary" && !onDark} /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
