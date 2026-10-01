import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

/** No-fault empty state (e.g. "sin horarios publicados") — never phrased as an error. */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="border-charcoal relative flex flex-col items-start gap-3.5 overflow-hidden rounded-xl border-[1.5px] bg-white px-6 py-7">
      <div
        aria-hidden="true"
        className="bg-lavender-100 absolute top-5 right-6 size-10 rounded-full"
      />
      <h2 className="font-heading text-charcoal max-w-[14em] text-xl leading-tight font-bold">
        {title}
      </h2>
      <p className="text-ink-soft">{description}</p>
      {action}
      {secondaryAction}
    </div>
  );
}
