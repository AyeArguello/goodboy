"use client";

import { useEffect, useRef } from "react";

const AUTO_DISMISS_MS = 8000;

export interface ToastProps {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
}

/**
 * Admin action confirmation with "Deshacer". Auto-dismisses after 8s, but
 * pauses the countdown while hovered/focused so a slow reader (or someone
 * about to click Deshacer) doesn't get cut off.
 */
export function Toast({ message, onUndo, onDismiss }: ToastProps) {
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedAtRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    remainingRef.current = AUTO_DISMISS_MS;
    resume();
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  function pause() {
    clearTimeout(timeoutRef.current);
    remainingRef.current -= Date.now() - startedAtRef.current;
  }

  function resume() {
    startedAtRef.current = Date.now();
    timeoutRef.current = setTimeout(
      onDismiss,
      Math.max(remainingRef.current, 0),
    );
  }

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="bg-charcoal flex items-center gap-2.5 rounded-md px-4 py-3 text-[15px] text-white"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-lavender)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <span className="flex-1">{message}</span>
      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="font-heading text-lavender min-h-11 cursor-pointer border-0 bg-none text-sm font-bold underline"
        >
          Deshacer
        </button>
      ) : null}
    </div>
  );
}
