import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SERVICE_PACKAGE_LABELS, SIZE_LABELS } from "@/lib/domain/appointment";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import { HISTORY_FILTERS, type HistoryFilter } from "@/lib/domain/history";
import type { AppointmentRow } from "@/lib/data/admin";

function filterHref(filter: HistoryFilter, query: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (query) params.set("q", query);
  const qs = params.toString();
  return qs ? `/admin/historial?${qs}` : "/admin/historial";
}

export function HistoryList({
  appointments,
  counts,
  filter,
  query,
}: {
  appointments: AppointmentRow[];
  counts: Record<HistoryFilter, number>;
  filter: HistoryFilter;
  query: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        action="/admin/historial"
        className="flex flex-wrap gap-2"
      >
        {filter !== "all" ? (
          <input type="hidden" name="filter" value={filter} />
        ) : null}
        <label className="flex min-w-0 flex-1 flex-col">
          <span className="sr-only">Buscar en el historial</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Perro, cliente, código o teléfono"
            className="border-ink-soft focus:border-purple min-h-12 w-full rounded-full border-[1.5px] bg-white px-4 text-base focus:shadow-[0_0_0_3px_var(--color-lavender)] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="bg-purple font-heading min-h-12 cursor-pointer rounded-full border-0 px-5 text-sm font-semibold text-white"
        >
          Buscar
        </button>
        {query ? (
          <Link
            href={filterHref(filter, "")}
            className="font-heading text-charcoal flex min-h-12 items-center px-2 text-sm font-semibold underline"
          >
            Limpiar
          </Link>
        ) : null}
      </form>

      <nav
        aria-label="Filtrar historial"
        className="flex gap-2 overflow-x-auto"
      >
        {HISTORY_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={filterHref(f.key, query)}
            aria-current={filter === f.key ? "page" : undefined}
            className={`border-charcoal font-heading flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold no-underline ${
              filter === f.key
                ? "bg-charcoal text-white"
                : "text-charcoal bg-white"
            }`}
          >
            {f.label} ({counts[f.key]})
          </Link>
        ))}
      </nav>

      {appointments.length === 0 ? (
        <p className="border-lavender text-ink-soft rounded-lg border-[1.5px] border-dashed p-5">
          {query
            ? "No encontramos solicitudes con esa búsqueda."
            : "Todavía no hay solicitudes en el historial."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {appointments.map((a) => {
            const startsAt = new Date(a.startsAt);
            return (
              <li
                key={a.id}
                className="border-lavender-100 flex flex-col gap-2 rounded-lg border-[1.5px] bg-white p-4"
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
                  {a.ownerName} · {SIZE_LABELS[a.sizeBucket]} ·{" "}
                  {SERVICE_PACKAGE_LABELS[a.servicePackage]}
                </span>
                <div>
                  <Link
                    href={`/admin/solicitudes/${a.id}`}
                    className="border-charcoal font-heading text-charcoal inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4.5 text-sm font-semibold no-underline"
                  >
                    Ver ficha
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
