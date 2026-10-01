import { cn } from "@/lib/ui/cn";
import type { AppointmentStatus } from "@/lib/domain/appointment";

export type { AppointmentStatus };

const STATUS_META: Record<
  AppointmentStatus,
  { label: string; bg: string; fg: string; line: string; icon: string }
> = {
  pending_review: {
    label: "Pendiente de revisión",
    bg: "bg-warning-bg",
    fg: "text-warning",
    line: "border-warning-line",
    icon: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM12 7v5l3 2",
  },
  awaiting_deposit: {
    label: "Esperando seña",
    bg: "bg-warning-bg",
    fg: "text-warning",
    line: "border-warning-line",
    icon: "M3.5 12.5l8-8H20v8.5l-8 8zM15.5 8.5a.5.5 0 1 0 0-.01",
  },
  confirmed: {
    label: "Confirmado",
    bg: "bg-success-bg",
    fg: "text-success",
    line: "border-success-line",
    icon: "M5 12.5l4.5 4.5L19 7.5",
  },
  reschedule_requested: {
    label: "Reprogramado",
    bg: "bg-rescheduled-bg",
    fg: "text-rescheduled",
    line: "border-purple",
    icon: "M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4",
  },
  cancelled_by_client: {
    label: "Cancelado por el cliente",
    bg: "bg-error-bg",
    fg: "text-error",
    line: "border-error",
    icon: "M6 6l12 12M18 6L6 18",
  },
  cancelled_by_business: {
    label: "Cancelado por Good Boy",
    bg: "bg-error-bg",
    fg: "text-error",
    line: "border-error",
    icon: "M6 6l12 12M18 6L6 18",
  },
  deposit_forfeited: {
    label: "Seña perdida",
    bg: "bg-error-bg",
    fg: "text-error",
    line: "border-error",
    icon: "M6 6l12 12M18 6L6 18",
  },
  completed: {
    label: "Completado",
    bg: "bg-lavender-100/60",
    fg: "text-charcoal",
    line: "border-ink-soft",
    icon: "M5 12.5l4.5 4.5L19 7.5",
  },
  no_show: {
    label: "Ausente",
    bg: "bg-error-bg",
    fg: "text-error",
    line: "border-error",
    icon: "M12 3l9.5 17h-19zM12 10v4M12 17.2v.3",
  },
  expired: {
    label: "Vencido",
    bg: "bg-lavender-100/60",
    fg: "text-ink-soft",
    line: "border-ink-soft",
    icon: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM12 7v5l3 2",
  },
};

/** Icon + word status chip — never color alone, per the design's a11y rule. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "font-heading inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold",
        m.bg,
        m.fg,
        m.line,
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={m.icon} />
      </svg>
      {m.label}
    </span>
  );
}

export function statusLabel(status: AppointmentStatus): string {
  return STATUS_META[status].label;
}
