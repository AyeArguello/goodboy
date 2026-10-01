"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Switch } from "@/components/ui/Switch";
import { statusLabel } from "@/components/ui/StatusBadge";
import { businessConfig } from "@/lib/config/business";
import { formatDurationHM, formatTimeLabel } from "@/lib/domain/datetime";
import {
  getMaxActivePerDayFor,
  getSlotTimesFor,
  isSaturday,
} from "@/lib/domain/schedule";
import type { DaySlotDetail } from "@/lib/data/admin";
import {
  publishSlot,
  rescheduleAppointment,
  setSlotVisibility,
} from "@/app/admin/(app)/actions";

export interface DayChip {
  dateKey: string;
  label: string;
  count: number;
}

export interface SlotsPublisherProps {
  days: DayChip[];
  selectedDateKey: string;
  slots: DaySlotDetail[];
  rescheduleAppointmentId: string | null;
  rescheduleDogName: string | null;
}

function suggestedNextTime(slots: DaySlotDetail[], dateKey: string): string {
  if (slots.length === 0) return getSlotTimesFor(dateKey)[0] ?? "09:00";
  const last = slots.reduce(
    (max, s) => (s.startsAt > max ? s.startsAt : max),
    slots[0]!.startsAt,
  );
  const d = new Date(
    new Date(last).getTime() + businessConfig.rules.warnGapMinutes * 60_000,
  );
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SlotsPublisher({
  days,
  selectedDateKey,
  slots,
  rescheduleAppointmentId,
  rescheduleDogName,
}: SlotsPublisherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nextTime, setNextTime] = useState(() =>
    suggestedNextTime(slots, selectedDateKey),
  );
  const [gapWarning, setGapWarning] = useState<{ time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dayMax = getMaxActivePerDayFor(selectedDateKey);
  const daySlotTimes = getSlotTimesFor(selectedDateKey);
  const saturday = isSaturday(selectedDateKey);
  const publishedCount = slots.filter(
    (s) => s.isPublished || s.appointment,
  ).length;
  const atMax = publishedCount >= dayMax;

  const nearestGapMinutes = slots.length
    ? Math.min(
        ...slots.map((s) => {
          const [h, m] = nextTime.split(":").map(Number);
          const candidate = new Date(s.startsAt);
          candidate.setHours(h!, m!, 0, 0);
          return (
            Math.abs(new Date(s.startsAt).getTime() - candidate.getTime()) /
            60000
          );
        }),
      )
    : Infinity;

  function toggleSlot(slot: DaySlotDetail) {
    if (rescheduleAppointmentId && !slot.appointment && slot.isPublished) {
      startTransition(async () => {
        const result = await rescheduleAppointment(
          rescheduleAppointmentId,
          slot.slotId,
        );
        if (result.ok)
          router.push(`/admin/solicitudes/${rescheduleAppointmentId}`);
        else setError(result.error);
      });
      return;
    }
    startTransition(async () => {
      const result = await setSlotVisibility(slot.slotId, !slot.isPublished);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function publish(force: boolean) {
    setError(null);
    const [h, m] = nextTime.split(":").map(Number);
    const startsAt = new Date(`${selectedDateKey}T00:00:00`);
    startsAt.setHours(h!, m!, 0, 0);

    startTransition(async () => {
      const result = await publishSlot(startsAt.toISOString(), force);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.warning === "GAP_WARNING") {
        setGapWarning({ time: nextTime });
        return;
      }
      setGapWarning(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {rescheduleAppointmentId ? (
        <Alert
          variant="info"
          title={`Reprogramando el turno de ${rescheduleDogName ?? ""}`}
        >
          Elegí un horario publicado y libre para reasignarlo.
        </Alert>
      ) : null}

      <div
        role="radiogroup"
        aria-label="Día"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {days.map((d) => {
          const sel = d.dateKey === selectedDateKey;
          const qs = rescheduleAppointmentId
            ? `&reschedule=${rescheduleAppointmentId}`
            : "";
          return (
            <Link
              key={d.dateKey}
              href={`/admin/horarios?day=${d.dateKey}${qs}`}
              role="radio"
              aria-checked={sel}
              className={`font-heading flex min-h-18 min-w-18 shrink-0 flex-col items-center justify-center rounded-lg border-[1.5px] no-underline ${
                sel
                  ? "border-charcoal bg-charcoal text-white"
                  : "border-lavender text-charcoal bg-white"
              }`}
            >
              <span className="text-xs font-semibold uppercase">
                {d.label.split(",")[0]}
              </span>
              <span className="text-xl font-bold">
                {d.label.match(/\d+/)?.[0]}
              </span>
              <span className="font-sans text-xs font-bold">
                {d.count}/{getMaxActivePerDayFor(d.dateKey)}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="border-charcoal flex flex-col gap-3 rounded-xl border-[1.5px] bg-white p-4.5">
        {error ? (
          <p role="alert" className="text-error m-0 text-sm font-bold">
            {error}
          </p>
        ) : null}

        {slots.map((s) => {
          const startsAt = new Date(s.startsAt);
          const canToggle = !s.appointment;
          const label = s.appointment
            ? `${s.appointment.dogName} · ${statusLabel(s.appointment.status)}`
            : s.isPublished
              ? rescheduleAppointmentId
                ? "Publicado, libre · tocá para reasignar"
                : "Publicado, libre"
              : "Oculto: no se ve en la web";
          return (
            <div
              key={s.slotId}
              className="border-lavender-100 flex flex-wrap items-center gap-3 border-t py-2.5 first:border-t-0"
            >
              <strong className="font-heading min-w-16 text-xl tabular-nums">
                {formatTimeLabel(startsAt)}
              </strong>
              <span className="text-ink-soft flex-1 text-[15px]">{label}</span>
              {canToggle ? (
                rescheduleAppointmentId ? (
                  s.isPublished ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggleSlot(s)}
                      loading={isPending}
                    >
                      Reasignar acá
                    </Button>
                  ) : null
                ) : (
                  <Switch
                    checked={s.isPublished}
                    onCheckedChange={() => toggleSlot(s)}
                    label={s.isPublished ? "Visible" : "Oculto"}
                  />
                )
              ) : null}
            </div>
          );
        })}

        {atMax ? (
          <Alert variant="info">
            <strong>Día completo.</strong> Ya hay {dayMax}{" "}
            {dayMax === 1 ? "perro" : "perros"}, que es el máximo{" "}
            {saturday ? "de los sábados" : "de lunes a viernes"}. Para sumar
            otro, ocultá o cancelá uno.
          </Alert>
        ) : (
          <div className="border-charcoal flex flex-col gap-2.5 border-t-[1.5px] pt-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="font-heading text-[15px] font-semibold">
                {saturday ? "Horario de sábado" : "Horarios habituales"}
              </span>
              <div className="flex flex-wrap gap-2">
                {daySlotTimes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNextTime(t)}
                    className={`font-heading min-h-11 cursor-pointer rounded-full border-[1.5px] px-4 text-sm font-semibold tabular-nums ${
                      nextTime === t
                        ? "border-purple bg-purple text-white"
                        : "border-lavender text-charcoal bg-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {saturday ? (
              <p className="text-ink-soft m-0 text-sm">
                Los sábados solo se publica el turno de las 11:00 — no hay otro
                horario para elegir.
              </p>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="font-heading text-[15px] font-semibold">
                  O elegí otro horario
                </span>
                <input
                  type="time"
                  step={900}
                  value={nextTime}
                  onChange={(e) => setNextTime(e.target.value)}
                  className="border-ink-soft h-13 max-w-[200px] rounded-md border-[1.5px] px-3.5 text-lg"
                />
                <span className="text-ink-soft text-sm">
                  Sugerido: {suggestedNextTime(slots, selectedDateKey)}
                </span>
              </label>
            )}
            {nearestGapMinutes < businessConfig.rules.warnGapMinutes ? (
              <Alert variant="warning">
                <strong>
                  Quedan menos de {businessConfig.rules.warnGapMinutes} minutos
                  con otro turno del día.
                </strong>{" "}
                Cada trabajo lleva entre{" "}
                {formatDurationHM(
                  businessConfig.rules.serviceDurationMinMinutes,
                )}{" "}
                y{" "}
                {formatDurationHM(
                  businessConfig.rules.serviceDurationMaxMinutes,
                )}
                .
              </Alert>
            ) : null}
            <Button onClick={() => publish(!!gapWarning)} loading={isPending}>
              {gapWarning
                ? `Publicar igual a las ${nextTime}`
                : `Publicar siguiente horario · ${nextTime}`}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
