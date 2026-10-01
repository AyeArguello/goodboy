"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { SERVICE_PACKAGE_LABELS, SIZE_LABELS } from "@/lib/domain/appointment";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { AppointmentRow, RequestsFilter } from "@/lib/data/admin";
import { approveRequest } from "@/app/admin/(app)/actions";

const FILTERS: { key: RequestsFilter; label: string }[] = [
  { key: "pending_review", label: "Por revisar" },
  { key: "awaiting_deposit", label: "Esperando seña" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "all", label: "Todas" },
];

export function RequestsList({
  appointments,
  filter,
  pendingCount,
}: {
  appointments: AppointmentRow[];
  filter: RequestsFilter;
  pendingCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function approve(a: AppointmentRow) {
    startTransition(async () => {
      const result = await approveRequest(a.id);
      if (result.ok) {
        setToast(
          `Solicitud de ${a.dogName} aprobada. Mandale los datos para la seña por WhatsApp.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={
              f.key === "pending_review"
                ? "/admin/solicitudes"
                : `/admin/solicitudes?filter=${f.key}`
            }
            role="tab"
            aria-selected={filter === f.key}
            className={`border-charcoal font-heading flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold no-underline ${
              filter === f.key
                ? "bg-charcoal text-white"
                : "text-charcoal bg-white"
            }`}
          >
            {f.label}
            {f.key === "pending_review" ? ` (${pendingCount})` : ""}
          </Link>
        ))}
      </div>

      {appointments.length === 0 ? (
        <p className="border-lavender text-ink-soft rounded-lg border-[1.5px] border-dashed p-5">
          No hay solicitudes en esta lista.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {appointments.map((a) => {
            const startsAt = new Date(a.startsAt);
            return (
              <li
                key={a.id}
                className="border-lavender-100 flex flex-col gap-2.5 rounded-lg border-[1.5px] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="flex flex-col">
                    <strong className="font-heading text-lg">
                      {a.dogName}{" "}
                      <span className="text-ink-soft font-sans text-sm font-normal">
                        · {a.code}
                      </span>
                    </strong>
                    <span className="text-[15px]">
                      {formatDayLabel(startsAt)} · {formatTimeLabel(startsAt)}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                <span className="text-ink-soft text-[15px]">
                  {SIZE_LABELS[a.sizeBucket]} ·{" "}
                  {SERVICE_PACKAGE_LABELS[a.servicePackage]} ·{" "}
                  {a.logisticsMode === "pickup"
                    ? `Traslado · ${a.neighborhood}`
                    : "Lo trae"}
                </span>
                <div className="flex flex-wrap gap-2">
                  {a.status === "pending_review" ? (
                    <button
                      type="button"
                      onClick={() => approve(a)}
                      className="bg-purple font-heading min-h-11 cursor-pointer rounded-full border-0 px-4.5 text-sm font-semibold text-white"
                    >
                      Aprobar
                    </button>
                  ) : null}
                  <Link
                    href={`/admin/solicitudes/${a.id}`}
                    className="border-charcoal font-heading text-charcoal flex min-h-11 items-center rounded-full border-[1.5px] px-4.5 text-sm font-semibold no-underline"
                  >
                    Ver ficha
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div
        aria-live="polite"
        className="fixed inset-x-4 bottom-4 z-10 lg:right-4 lg:left-auto lg:w-96"
      >
        {toast ? (
          <Toast message={toast} onDismiss={() => setToast(null)} />
        ) : null}
      </div>
    </div>
  );
}
