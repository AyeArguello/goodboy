import Link from "next/link";
import { ScheduleManager } from "@/components/admin/ScheduleManager";
import {
  getAppointmentById,
  getScheduleOverview,
  serverNowMs,
} from "@/lib/data/admin";

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; reschedule?: string }>;
}) {
  const { day, reschedule } = await searchParams;

  const [days, reschedulingAppointment] = await Promise.all([
    getScheduleOverview(),
    reschedule ? getAppointmentById(reschedule) : Promise.resolve(null),
  ]);

  // Without a valid ?day=, open the first day that still has a time ahead (today
  // may have none left).
  const nowMs = serverNowMs();
  const firstWithTimes = days.find((d) =>
    d.slots.some((s) => new Date(s.startsAt).getTime() > nowMs),
  );
  const selectedDateKey =
    day && days.some((d) => d.dateKey === day)
      ? day
      : (firstWithTimes ?? days[0]!).dateKey;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading m-0 text-xl font-bold">Horarios</h1>
          <span className="text-ink-soft text-sm">
            Quitá lo que no atiendas o cargá un turno a mano
          </span>
        </div>
        {!reschedule ? (
          <Link
            href="/admin/turnos/nuevo"
            className="font-heading bg-purple press inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white no-underline hover:bg-purple-700"
          >
            Cargar turno a mano
          </Link>
        ) : null}
      </div>
      <ScheduleManager
        days={days}
        selectedDateKey={selectedDateKey}
        rescheduleAppointmentId={reschedule ?? null}
        rescheduleDogName={reschedulingAppointment?.dogName ?? null}
      />
    </div>
  );
}
