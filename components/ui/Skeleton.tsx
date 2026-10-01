import { cn } from "@/lib/ui/cn";

/** Loading placeholder. `animate-pulse` is neutralized globally under prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-lavender-100 block animate-pulse rounded-lg",
        className,
      )}
    />
  );
}
