import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export type AlertVariant = "info" | "warning" | "error";

const variantClasses: Record<AlertVariant, string> = {
  info: "bg-lavender-100 text-charcoal",
  warning: "border-[1.5px] border-warning-line bg-warning-bg text-charcoal",
  error: "border-[1.5px] border-error bg-error-bg text-charcoal",
};

const icons: Record<AlertVariant, ReactNode> = {
  info: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  ),
  warning: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l9.5 17h-19zM12 10v4M12 17.2v.3" />
    </svg>
  ),
  error: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.5v5.5M12 16.3v.3" />
    </svg>
  ),
};

export interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Info/warning/error banner. Error renders role="alert" per the a11y rule. */
export function Alert({ variant, title, children, className }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "note"}
      className={cn(
        "grid grid-cols-[auto_1fr] items-start gap-2.5 rounded-lg px-4 py-3.5 text-[15px]",
        variantClasses[variant],
        className,
      )}
    >
      <span
        className={
          variant === "info"
            ? "text-purple"
            : variant === "warning"
              ? "text-warning"
              : "text-error"
        }
      >
        {icons[variant]}
      </span>
      <div className="flex flex-col gap-0.5">
        {title ? (
          <strong className="font-heading text-base">{title}</strong>
        ) : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
