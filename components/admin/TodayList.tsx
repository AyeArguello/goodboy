"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { businessConfig } from "@/lib/config/business";
import {
  COAT_LABELS,
  SERVICE_PACKAGE_LABELS,
  SIZE_LABELS,
} from "@/lib/domain/appointment";
import { formatTimeLabel, formatDurationHM } from "@/lib/domain/datetime";
import {
  adminWhatsAppTemplates,
  buildWhatsAppLink,
} from "@/lib/domain/whatsapp";
import type { AppointmentRow } from "@/lib/data/admin";
import {
  completeAppointment,
  revertToConfirmed,
} from "@/app/admin/(app)/actions";

export function TodayList({
  appointments,
}: {
  appointments: AppointmentRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<{
    message: string;
    undo: () => void;
  } | null>(null);

  function complete(a: AppointmentRow) {
    startTransition(async () => {
      await completeAppointment(a.id);
      setToast({
        message: `${a.dogName} marcado como completado`,
        undo: () =>
          startTransition(async () => {
            await revertToConfirmed(a.id);
            router.refresh();
          }),
      });
      router.refresh();
    });
  }

  if (appointments.length === 0) {
    return (
      <p className="text-ink-soft">
        Todavía no hay perros confirmados para hoy.
      </p>
    );
  }

  return (
    <>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {appointments.map((a) => {
          const startsAt = new Date(a.startsAt);
          const endsAt = new Date(
            startsAt.getTime() +
              businessConfig.rules.serviceDurationMaxMinutes * 60_000,
          );
          const isPickup = a.logisticsMode === "pickup";
          return (
            <li
              key={a.id}
              className="border-lavender-100 grid grid-cols-[64px_1fr] gap-3.5 rounded-xl border-[1.5px] bg-white p-4"
            >
              <span className="flex flex-col leading-tight">
                <strong className="font-heading text-xl font-bold tabular-nums">
                  {formatTimeLabel(startsAt)}
                </strong>
                <span className="text-ink-soft text-xs">
                  a {formatTimeLabel(endsAt)}
                </span>
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-heading text-lg">{a.dogName}</strong>
                  <StatusBadge status={a.status} />
                </div>
                <span className="text-ink-soft text-[15px]">
                  {SIZE_LABELS[a.sizeBucket]} · {a.breed || "raza sin dato"} ·{" "}
                  {SERVICE_PACKAGE_LABELS[a.servicePackage]}
                  {a.coatState
                    ? ` · manto ${COAT_LABELS[a.coatState].toLowerCase()}`
                    : ""}
                </span>
                <span className="flex items-center gap-1.5 text-[15px]">
                  {isPickup
                    ? `Traslado · ${a.neighborhood} · buscar 30 min antes`
                    : "Lo trae"}
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {a.status === "confirmed" ? (
                    <button
                      type="button"
                      onClick={() => complete(a)}
                      className="bg-purple font-heading min-h-11 cursor-pointer rounded-full border-0 px-4 text-sm font-semibold text-white"
                    >
                      Marcar completado
                    </button>
                  ) : null}
                  <a
                    href={buildWhatsAppLink(
                      a.phoneE164,
                      isPickup
                        ? adminWhatsAppTemplates.confirmTransportCost({
                            neighborhood: a.neighborhood ?? "",
                          })
                        : adminWhatsAppTemplates.askForPhoto({
                            ownerName: a.ownerName,
                            dogName: a.dogName,
                          }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-charcoal font-heading text-charcoal flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold no-underline"
                  >
                    {isPickup ? "Avisar que salgo" : "Avisar que está listo"}
                  </a>
                  <Link
                    href={`/admin/solicitudes/${a.id}`}
                    className="font-heading text-purple flex min-h-11 items-center rounded-full px-3 text-sm font-semibold underline"
                  >
                    Ver ficha
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div
        aria-live="polite"
        className="fixed inset-x-4 bottom-4 z-10 lg:right-4 lg:left-auto lg:w-96"
      >
        {toast ? (
          <Toast
            message={toast.message}
            onUndo={toast.undo}
            onDismiss={() => setToast(null)}
          />
        ) : null}
      </div>
      <p className="sr-only">
        Duración estimada por turno:{" "}
        {formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}.
      </p>
    </>
  );
}
