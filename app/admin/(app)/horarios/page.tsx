import {
  SlotsPublisher,
  type DayChip,
} from "@/components/admin/SlotsPublisher";
import {
  getAppointmentById,
  getSlotsForDay,
  getWeekAgenda,
} from "@/lib/data/admin";
import { formatDayLabel, toDateKey } from "@/lib/domain/datetime";

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; reschedule?: string }>;
}) {
  const { day, reschedule } = await searchParams;
  const today = new Date();
  const selectedDateKey = day ?? toDateKey(today);

  const [week, slots, reschedulingAppointment] = await Promise.all([
    getWeekAgenda(today, 6),
    getSlotsForDay(selectedDateKey),
    reschedule ? getAppointmentById(reschedule) : Promise.resolve(null),
  ]);

  const days: DayChip[] = week.map((w) => ({
    dateKey: w.dateKey,
    label: formatDayLabel(
      new Date(w.slots[0]?.startsAt ?? `${w.dateKey}T12:00:00`),
    ),
    count: w.slots.filter((s) => s.isPublished || s.appointment).length,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">
          Publicar horarios
        </h1>
        <span className="text-ink-soft text-sm">
          Publicá de a uno para evitar esperas
        </span>
      </div>
      <SlotsPublisher
        days={days}
        selectedDateKey={selectedDateKey}
        slots={slots}
        rescheduleAppointmentId={reschedule ?? null}
        rescheduleDogName={reschedulingAppointment?.dogName ?? null}
      />
    </div>
  );
}
