"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { statusLabel } from "@/components/ui/StatusBadge";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import type { ScheduleDay } from "@/lib/data/admin";
import {
  blockDate,
  rescheduleAppointment,
  setSlotVisibility,
  unblockDate,
} from "@/app/admin/(app)/actions";

export interface ScheduleManagerProps {
  days: ScheduleDay[];
  selectedDateKey: string;
  rescheduleAppointmentId: string | null;
  rescheduleDogName: string | null;
}

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "octubre de 2026" for a YYYY-MM-DD key, independent of the viewer's time zone. */
function monthOf(dateKey: string): string {
  return monthFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

const monthNameFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
});

/** "2026-10" of a YYYY-MM-DD key. */
function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** "octubre" for a "YYYY-MM" key. */
function monthName(monthKey: string): string {
  return monthNameFormatter.format(new Date(`${monthKey}-15T12:00:00Z`));
}

/** The months the calendar covers, in order. */
function monthsOf(days: ScheduleDay[]): string[] {
  return [...new Set(days.map((d) => monthKeyOf(d.dateKey)))];
}

/** Where the month tab lands: its first working day (or its first day). */
function firstDayOf(days: ScheduleDay[], monthKey: string): string {
  const inMonth = days.filter((d) => monthKeyOf(d.dateKey) === monthKey);
  return (inMonth.find((d) => d.weekday !== 0) ?? inMonth[0]!).dateKey;
}

/** Monday-first column (0..6) of a JS weekday (0 = Sunday). */
const mondayFirst = (weekday: number) => (weekday + 6) % 7;

function dayNumber(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

/** Noon UTC keeps the same calendar day in any time zone the label is formatted in. */
function labelOf(dateKey: string): string {
  return formatDayLabel(new Date(`${dateKey}T15:00:00Z`));
}

function weeksOf(days: ScheduleDay[]): (ScheduleDay | null)[][] {
  const weeks: (ScheduleDay | null)[][] = [];
  let current: (ScheduleDay | null)[] = [];
  for (const day of days) {
    if (current.length === 0) {
      for (let i = 0; i < mondayFirst(day.weekday); i++) current.push(null);
    }
    current.push(day);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }
  return weeks;
}

function dayState(day: ScheduleDay) {
  const turns = day.slots.filter((s) => s.appointment).length;
  const open = day.slots.filter((s) => s.isPublished && !s.appointment).length;
  const hidden = day.slots.filter((s) => !s.isPublished).length;
  return { turns, open, hidden };
}

export function ScheduleManager({
  days,
  selectedDateKey,
  rescheduleAppointmentId,
  rescheduleDogName,
}: ScheduleManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");

  const selected = days.find((d) => d.dateKey === selectedDateKey) ?? days[0]!;
  const monthKey = monthKeyOf(selected.dateKey);
  const months = monthsOf(days);
  const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  const monthDays = days.filter((d) => monthKeyOf(d.dateKey) === monthKey);
  const closed = selected.weekday === 0;
  const { turns } = dayState(selected);
  const suffix = rescheduleAppointmentId
    ? `&reschedule=${rescheduleAppointmentId}`
    : "";

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "No se pudo completar.");
      else router.refresh();
    });
  }

  function toggleSlot(slotId: string, visible: boolean) {
    run(() => setSlotVisibility(slotId, visible));
  }

  function reassign(slotId: string) {
    if (!rescheduleAppointmentId) return;
    setError(null);
    startTransition(async () => {
      const result = await rescheduleAppointment(
        rescheduleAppointmentId,
        slotId,
      );
      if (result.ok)
        router.push(`/admin/solicitudes/${rescheduleAppointmentId}`);
      else setError(result.error);
    });
  }

  function removeDay() {
    run(async () => {
      const result = await blockDate(selected.dateKey, reason.trim() || null);
      if (result.ok) {
        setRemoving(false);
        setReason("");
      }
      return result;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {rescheduleAppointmentId ? (
        <Alert
          variant="info"
          title={`Reprogramando el turno de ${rescheduleDogName ?? ""}`}
        >
          Elegí un horario libre para reasignarlo.
        </Alert>
      ) : (
        <Alert variant="info" title="Los horarios ya están cargados">
          De lunes a viernes a las 9:00, 11:30 y 13:30, y los sábados a las
          11:00; los domingos no se atiende. Quitá solo lo que no vayas a
          atender: la web se actualiza sola.
        </Alert>
      )}

      <nav aria-label="Mes" className="flex flex-wrap gap-2">
        {months.map((month) => {
          const current = month === monthKey;
          return (
            <Link
              key={month}
              href={`/admin/horarios?day=${firstDayOf(days, month)}${suffix}`}
              aria-current={current ? "true" : undefined}
              className={`font-heading min-h-11 content-center rounded-full border-[1.5px] px-4 text-sm font-semibold no-underline first-letter:uppercase ${
                current
                  ? "border-purple bg-purple text-white"
                  : "border-lavender text-charcoal hover:bg-lavender-100 bg-white"
              }`}
            >
              {monthName(month)}
              {spansYears ? ` ${month.slice(0, 4)}` : ""}
            </Link>
          );
        })}
      </nav>

      <section aria-label="Calendario" className="flex flex-col gap-3">
        <h2 className="font-heading m-0 text-lg font-bold first-letter:uppercase">
          {monthOf(`${monthKey}-15`)}
        </h2>
        <div
          aria-hidden="true"
          className="font-heading text-ink-soft grid grid-cols-7 gap-1.5 text-center text-xs font-semibold"
        >
          {WEEKDAY_LETTERS.map((letter, index) => (
            <span key={index}>{letter}</span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {weeksOf(monthDays).map((week, index) => (
            <div key={index} className="grid grid-cols-7 gap-1.5">
              {week.map((day, cell) => {
                if (!day) return <span key={cell} />;
                const sel = day.dateKey === selected.dateKey;
                const state = dayState(day);
                const isClosed = day.weekday === 0;
                const label = `${labelOf(day.dateKey)}${
                  day.dateKey === days[0]?.dateKey ? ", hoy" : ""
                }${
                  day.blocked
                    ? ", día quitado"
                    : isClosed
                      ? ", cerrado"
                      : `, ${state.turns} ${state.turns === 1 ? "turno" : "turnos"}, ${state.open} libres`
                }`;
                return (
                  <Link
                    key={day.dateKey}
                    href={`/admin/horarios?day=${day.dateKey}${suffix}`}
                    aria-label={label}
                    aria-current={sel ? "date" : undefined}
                    className={`font-heading flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] no-underline transition-colors ${
                      sel
                        ? "border-charcoal bg-charcoal text-white"
                        : day.blocked
                          ? "border-ink-soft text-ink-soft bg-lavender-100 border-dashed"
                          : isClosed
                            ? "border-lavender-100 text-ink-soft bg-white"
                            : "border-lavender text-charcoal hover:bg-lavender-100 bg-white"
                    }`}
                  >
                    <span className="text-base leading-none font-bold">
                      {dayNumber(day.dateKey)}
                    </span>
                    <span className="flex h-3 items-center gap-0.5">
                      {day.blocked ? (
                        <span className="text-[10px] leading-none font-bold">
                          ✕
                        </span>
                      ) : (
                        Array.from({ length: Math.min(state.turns, 3) }).map(
                          (_, dot) => (
                            <span
                              key={dot}
                              className={`size-1.5 rounded-full ${sel ? "bg-white" : "bg-purple"}`}
                            />
                          ),
                        )
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="text-ink-soft flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="bg-purple size-2 rounded-full" /> Turno cargado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-ink-soft bg-lavender-100 size-3.5 rounded-sm border-[1.5px] border-dashed" />{" "}
            Día quitado
          </span>
        </div>
      </section>

      <section className="border-charcoal flex flex-col gap-3 rounded-xl border-[1.5px] bg-white p-4.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading m-0 text-lg font-bold first-letter:uppercase">
            {labelOf(selected.dateKey)}
          </h2>
          {!closed && !rescheduleAppointmentId ? (
            <Link
              href={`/admin/turnos/nuevo?day=${selected.dateKey}`}
              className="font-heading text-purple text-sm font-semibold underline"
            >
              Cargar turno a mano
            </Link>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-error m-0 text-sm font-bold">
            {error}
          </p>
        ) : null}

        {closed ? (
          <p className="text-ink-soft m-0">Los domingos no se atiende.</p>
        ) : (
          <>
            {selected.blocked ? (
              <Alert variant="warning" title="Este día está quitado">
                No aparece en la web
                {selected.blocked.reason
                  ? `. Motivo: ${selected.blocked.reason}`
                  : ""}
                . Los turnos que ya tenía siguen en la agenda.
                {!rescheduleAppointmentId ? (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={isPending}
                      onClick={() => run(() => unblockDate(selected.dateKey))}
                    >
                      Volver a abrir el día
                    </Button>
                  </div>
                ) : null}
              </Alert>
            ) : null}

            {selected.slots.length === 0 ? (
              <p className="text-ink-soft m-0">
                {selected.dateKey === days[0]?.dateKey
                  ? "Hoy ya no quedan horarios."
                  : "Este día todavía no tiene horarios generados."}
              </p>
            ) : null}

            {selected.slots.map((slot) => {
              const startsAt = new Date(slot.startsAt);
              const label = slot.appointment
                ? `${slot.appointment.dogName} · ${statusLabel(slot.appointment.status)}`
                : !slot.isPublished
                  ? "Quitado: no se ve en la web"
                  : selected.blocked
                    ? "Libre, pero el día está quitado"
                    : "Libre";
              return (
                <div
                  key={slot.slotId}
                  className="border-lavender-100 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-t py-2.5 first:border-t-0 sm:flex sm:flex-wrap sm:gap-3"
                >
                  <strong className="font-heading min-w-16 text-xl tabular-nums">
                    {formatTimeLabel(startsAt)}
                  </strong>
                  <span className="text-ink-soft min-w-0 text-[15px] sm:flex-1">
                    {slot.appointment ? (
                      <Link
                        href={`/admin/solicitudes/${slot.appointment.id}`}
                        className="text-charcoal font-semibold"
                      >
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                  {rescheduleAppointmentId ? (
                    !slot.appointment && slot.isPublished ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="col-span-2 justify-self-start sm:col-span-1"
                        loading={isPending}
                        onClick={() => reassign(slot.slotId)}
                      >
                        Reasignar acá
                      </Button>
                    ) : null
                  ) : !slot.appointment ? (
                    <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                      <Link
                        href={`/admin/turnos/nuevo?slot=${slot.slotId}`}
                        className="font-heading text-purple min-h-11 content-center text-sm font-semibold underline"
                      >
                        Cargar turno
                      </Link>
                      <Switch
                        checked={slot.isPublished}
                        onCheckedChange={() =>
                          toggleSlot(slot.slotId, !slot.isPublished)
                        }
                        label={slot.isPublished ? "Atiendo" : "Quitado"}
                        aria-label={`${formatTimeLabel(startsAt)}: ${
                          slot.isPublished
                            ? "atender (tocá para quitar)"
                            : "quitado (tocá para volver a atender)"
                        }`}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!selected.blocked && !rescheduleAppointmentId ? (
              <div className="border-lavender-100 flex flex-col gap-3 border-t pt-3.5">
                {removing ? (
                  <>
                    {turns > 0 ? (
                      <Alert
                        variant="warning"
                        title={`Este día ya tiene ${turns} ${turns === 1 ? "turno" : "turnos"}`}
                      >
                        Quitar el día no los cancela: seguirán en la agenda.
                        Cancelalos o reprogramalos si no vas a atender.
                      </Alert>
                    ) : null}
                    <label className="flex flex-col gap-1.5">
                      <span className="font-heading text-[15px] font-semibold">
                        Motivo (opcional)
                      </span>
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={120}
                        placeholder="Feriado, vacaciones, trámite…"
                        className="border-ink-soft min-h-12 rounded-md border-[1.5px] px-3.5 text-[17px]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button loading={isPending} onClick={removeDay}>
                        Quitar el día
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setRemoving(false)}
                      >
                        No quitarlo
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    className="self-start"
                    onClick={() => setRemoving(true)}
                  >
                    No atiendo este día
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
