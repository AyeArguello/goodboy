"use client";

import { cn } from "@/lib/ui/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
  label: string;
  "aria-label"?: string;
}

/** Publish/hide toggle for admin slots (role="switch"). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onCheckedChange}
      className="font-heading text-charcoal flex min-h-11 items-center gap-2.5 text-sm font-semibold"
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "border-charcoal relative h-7 w-12 rounded-full border-[1.5px] transition-colors",
          checked ? "bg-purple" : "bg-lavender-100",
        )}
      >
        <span
          className={cn(
            "border-charcoal absolute top-0.5 size-[21px] rounded-full border-[1.5px] bg-white transition-[left]",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}
