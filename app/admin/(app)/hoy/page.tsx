import Link from "next/link";
import { TodayList } from "@/components/admin/TodayList";
import { getPendingCount, getTodayAppointments } from "@/lib/data/admin";
import { getMaxActivePerDayFor } from "@/lib/domain/schedule";
import { toDateKey } from "@/lib/domain/datetime";

export default async function HoyPage() {
  const [appointments, pendingCount] = await Promise.all([
    getTodayAppointments(),
    getPendingCount(),
  ]);
  // getTodayAppointments() already only returns confirmed/completed/no_show rows.
  const usedSlots = appointments.length;
  const maxToday = getMaxActivePerDayFor(toDateKey(new Date()));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">Hoy</h1>
        <span className="text-ink-soft text-sm">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      {pendingCount > 0 ? (
        <Link
          href="/admin/solicitudes"
          className="border-warning-line bg-warning-bg text-charcoal flex min-h-16 items-center gap-3.5 rounded-xl border-[1.5px] px-4 py-3.5 no-underline"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5E450C"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span className="flex-1">
            <strong className="font-heading">
              {pendingCount} solicitudes esperan respuesta
            </strong>
            <br />
            <span className="text-[15px]">
              Confirmalas o proponé otro horario
            </span>
          </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#25282C"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-heading m-0 text-lg font-bold">Perros de hoy</h2>
        <span className="text-ink-soft text-[15px]">
          <strong className="text-charcoal">
            {usedSlots} de {maxToday}
          </strong>{" "}
          lugares usados
        </span>
      </div>

      <TodayList appointments={appointments} />
    </div>
  );
}
