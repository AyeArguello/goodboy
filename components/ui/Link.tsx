import type { ComponentProps } from "react";
import NextLink from "next/link";
import { cn } from "@/lib/ui/cn";
import {
  buttonSizeClasses,
  buttonVariantClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";

export interface CtaLinkProps extends ComponentProps<typeof NextLink> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onDark?: boolean;
  className?: string;
}

/** An <a> styled like Button — for navigational CTAs (e.g. "Solicitar turno"). */
export function CtaLink({
  variant = "primary",
  size = "lg",
  onDark = false,
  className,
  ...rest
}: CtaLinkProps) {
  const isTextVariant = variant === "text";
  return (
    <NextLink
      className={cn(
        "font-heading inline-flex items-center justify-center gap-2 font-semibold no-underline transition-colors",
        !isTextVariant && "rounded-full",
        buttonSizeClasses[size],
        buttonVariantClasses(variant, onDark),
        variant === "text" && "underline",
        className,
      )}
      {...rest}
    />
  );
}
