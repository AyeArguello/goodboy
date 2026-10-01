import { cn } from "@/lib/ui/cn";

/**
 * Stand-in for a real photo slot. Renders until a real file is dropped into
 * public/ and the caller passes `src` to next/image instead — never used to
 * fake real content, just to mark where one goes.
 */
export function PlaceholderPhoto({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-lavender-100 text-purple flex items-center justify-center px-4 text-center text-sm",
        className,
      )}
    >
      {label}
    </div>
  );
}
