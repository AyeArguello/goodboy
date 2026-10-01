"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export interface SelectableCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "role"
> {
  role: "radio" | "checkbox";
  selected: boolean;
  invalid?: boolean;
  children: ReactNode;
}

/**
 * Low-level selectable card used by the day picker, slot list, size/coat
 * choices and logistics mode in the turnero. Handles the shared
 * selected/invalid/disabled visual states and ARIA wiring; callers own the
 * inner layout since it differs a lot between usages.
 */
export function SelectableCard({
  role,
  selected,
  invalid,
  disabled,
  className,
  children,
  ...rest
}: SelectableCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        "text-charcoal rounded-lg border-[1.5px] bg-white text-left font-sans transition-colors",
        "disabled:text-ink-soft disabled:cursor-not-allowed disabled:border-dashed",
        !disabled && "cursor-pointer",
        invalid && "border-error border-2",
        !invalid && selected && "border-purple bg-lavender-100 border-2",
        !invalid && !selected && !disabled && "border-lavender",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
