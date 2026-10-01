import { WeekAgenda } from "@/components/admin/WeekAgenda";
import { getWeekAgenda } from "@/lib/data/admin";
import { formatDayLabel } from "@/lib/domain/datetime";

export default async function AgendaPage() {
  const today = new Date();
  const week = await getWeekAgenda(today, 7);
  const end = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">
          Agenda de la semana
        </h1>
        <span className="text-ink-soft text-sm">
          {formatDayLabel(today)} al {formatDayLabel(end)}
        </span>
      </div>
      <WeekAgenda week={week} />
    </div>
  );
}
