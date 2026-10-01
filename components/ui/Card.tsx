import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-charcoal rounded-xl border-[1.5px] bg-white p-4",
        className,
      )}
      {...rest}
    />
  );
}
