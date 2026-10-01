import Link from "next/link";
import {
  formatDayLabel,
  formatTimeLabel,
  toDateKey,
} from "@/lib/domain/datetime";
import { getMaxActivePerDayFor } from "@/lib/domain/schedule";
import { statusLabel } from "@/components/ui/StatusBadge";
import type { WeekDay } from "@/lib/data/admin";

export function WeekAgenda({ week }: { week: WeekDay[] }) {
  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col gap-4">
      <div className="text-charcoal flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="bg-purple size-3.5 rounded-sm" /> Confirmado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-warning-line bg-warning-bg size-3.5 rounded-sm border-[1.5px]" />{" "}
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-purple size-3.5 rounded-sm border-[1.5px] bg-white" />{" "}
          Publicado libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-ink-soft size-3.5 rounded-sm border-[1.5px] border-dashed" />{" "}
          Oculto
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {week.map((day) => {
          const max = getMaxActivePerDayFor(day.dateKey);
          const used = day.slots.filter(
            (s) => s.appointment || s.isPublished,
          ).length;
          const first = day.slots[0]
            ? new Date(day.slots[0].startsAt)
            : new Date(`${day.dateKey}T12:00:00`);
          return (
            <section
              key={day.dateKey}
              className="border-lavender-100 flex min-w-0 flex-col gap-2 rounded-lg border-[1.5px] bg-white p-3"
            >
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="font-heading m-0 text-[15px] font-bold">
                  {formatDayLabel(first)}
                </h3>
                <span
                  className={`text-xs font-bold ${used >= max ? "text-error" : "text-charcoal"}`}
                >
                  {used}/{max}
                </span>
              </header>
              {day.slots.length === 0 ? (
                <span className="text-ink-soft text-sm">Sin horarios</span>
              ) : (
                day.slots.map((s) => {
                  const startsAt = new Date(s.startsAt);
                  const label = s.appointment
                    ? `${s.appointment.dogName} · ${statusLabel(s.appointment.status)}`
                    : s.isPublished
                      ? "Publicado, libre"
                      : "Oculto";
                  const isConfirmedish =
                    s.appointment?.status === "confirmed" ||
                    s.appointment?.status === "completed";
                  return (
                    <span
                      key={s.slotId}
                      className={`flex flex-col rounded-md border-[1.5px] px-2.5 py-2 text-sm leading-tight ${
                        isConfirmedish
                          ? "border-purple bg-purple text-white"
                          : s.appointment
                            ? "border-warning-line bg-warning-bg text-charcoal"
                            : s.isPublished
                              ? "border-purple text-charcoal bg-white"
                              : "border-ink-soft bg-canvas text-ink-soft border-dashed"
                      }`}
                    >
                      <strong className="font-heading tabular-nums">
                        {formatTimeLabel(startsAt)}
                      </strong>
                      <span>{label}</span>
                    </span>
                  );
                })
              )}
              <Link
                href={
                  day.dateKey === todayKey
                    ? "/admin/hoy"
                    : `/admin/horarios?day=${day.dateKey}`
                }
                className="border-purple font-heading text-purple mt-auto flex min-h-11 items-center justify-center rounded-md border-[1.5px] border-dashed text-sm font-semibold no-underline"
              >
                {day.dateKey === todayKey ? "Ver hoy" : "Editar horarios"}
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
