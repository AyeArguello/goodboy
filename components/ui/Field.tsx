"use client";

import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/ui/cn";

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.5v5.5M12 16.3v.3" />
    </svg>
  );
}

interface FieldChromeProps {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  errorId: string;
  hintId: string;
}

function FieldLabel({
  id,
  label,
  optional,
}: Pick<FieldChromeProps, "id" | "label" | "optional">) {
  return (
    <span className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-heading text-charcoal text-[15px] font-semibold"
      >
        {label}{" "}
        {optional && (
          <span className="text-ink-soft font-sans font-normal">
            (opcional)
          </span>
        )}
      </label>
    </span>
  );
}

function FieldMessages({
  error,
  hint,
  errorId,
  hintId,
}: Pick<FieldChromeProps, "error" | "hint" | "errorId" | "hintId">) {
  return (
    <>
      {error ? (
        <span
          id={errorId}
          role="alert"
          className="text-error flex items-center gap-1.5 text-sm font-bold"
        >
          <ErrorIcon />
          {error}
        </span>
      ) : null}
      {hint && !error ? (
        <span id={hintId} className="text-ink-soft text-sm">
          {hint}
        </span>
      ) : null}
    </>
  );
}

const baseControlClasses =
  "w-full rounded-md border-[1.5px] bg-white px-3.5 font-sans text-[17px] text-charcoal placeholder:text-ink-soft focus:border-purple focus:shadow-[0_0_0_3px_var(--color-lavender)] focus:outline-none";

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className"
> {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  /** Fixed prefix shown before the input, e.g. "+54" for phone numbers. */
  prefix?: string;
}

export function TextField({
  label,
  optional,
  error,
  hint,
  prefix,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={id} label={label} optional={optional} />
      <span
        className={cn(
          prefix && "flex overflow-hidden rounded-md border-[1.5px]",
          prefix && (error ? "border-error" : "border-ink-soft"),
        )}
      >
        {prefix ? (
          <span className="bg-lavender-100 font-heading text-charcoal flex items-center px-3 font-bold">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "min-h-13",
            prefix ? "border-0 focus:shadow-none" : baseControlClasses,
            !prefix && (error ? "border-error border-2" : "border-ink-soft"),
          )}
          {...inputProps}
        />
      </span>
      <FieldMessages
        error={error}
        hint={hint}
        errorId={errorId}
        hintId={hintId}
      />
    </div>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className"
> {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
}

export function TextAreaField({
  label,
  optional,
  error,
  hint,
  rows = 3,
  ...textareaProps
}: TextAreaFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={id} label={label} optional={optional} />
      <textarea
        id={id}
        rows={rows}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          baseControlClasses,
          "resize-y py-3",
          error ? "border-error border-2" : "border-ink-soft",
        )}
        {...textareaProps}
      />
      <FieldMessages
        error={error}
        hint={hint}
        errorId={errorId}
        hintId={hintId}
      />
    </div>
  );
}
