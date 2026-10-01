"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps the native <dialog> element: free focus trap, Esc-to-close, and
 * focus-returns-to-trigger, all handled by the browser instead of custom JS.
 */
export function Dialog({
  open,
  onClose,
  label,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "backdrop:bg-charcoal/95 m-auto rounded-xl border-0 bg-transparent p-0",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
