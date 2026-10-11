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
  /** "solid" fills the chosen card with the brand colour (day and time pickers). */
  tone?: "soft" | "solid";
  /** Shows a check badge in the corner while chosen (large option cards). */
  check?: boolean;
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
  tone = "solid",
  check = false,
  disabled,
  className,
  children,
  ...rest
}: SelectableCardProps) {
  const solidSelected = !invalid && selected && tone === "solid";

  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        "relative rounded-lg border-[1.5px] text-left font-sans transition-colors",
        solidSelected ? "" : "text-charcoal bg-white",
        "disabled:text-ink-soft disabled:cursor-not-allowed disabled:border-dashed",
        !disabled && "cursor-pointer",
        invalid && "border-error border-2",
        !invalid &&
          selected &&
          tone === "soft" &&
          "border-purple bg-lavender-100 ring-purple/20 border-2 ring-4",
        !invalid &&
          selected &&
          tone === "solid" &&
          "border-purple bg-purple ring-purple/25 border-2 text-white shadow-md ring-4 [&_*]:text-white",
        !invalid && !selected && !disabled && "border-lavender",
        className,
      )}
      {...rest}
    >
      {children}
      {check && solidSelected ? (
        <span
          aria-hidden="true"
          className="text-purple! absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-white text-sm font-bold"
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}
