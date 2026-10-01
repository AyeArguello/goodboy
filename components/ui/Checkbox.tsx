"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export interface CheckboxRowProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "role"
> {
  checked: boolean;
  invalid?: boolean;
  children: ReactNode;
}

/** A checkbox rendered as an accessible button (role="checkbox"), matching the design's tap-target rows. */
export function CheckboxRow({
  checked,
  invalid,
  className,
  children,
  ...rest
}: CheckboxRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={cn(
        "text-charcoal flex min-h-12 items-center gap-3 text-left font-sans text-[17px]",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-sm border-2",
          invalid
            ? "border-error"
            : checked
              ? "border-purple bg-purple"
              : "border-ink-soft",
        )}
      >
        {checked ? <CheckIcon /> : null}
      </span>
      {children}
    </button>
  );
}
