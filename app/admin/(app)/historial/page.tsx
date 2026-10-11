import { HistoryList } from "@/components/admin/HistoryList";
import { getHistory } from "@/lib/data/admin";
import { HISTORY_FILTERS, type HistoryFilter } from "@/lib/domain/history";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter: rawFilter, q: rawQuery } = await searchParams;
  const filter: HistoryFilter =
    HISTORY_FILTERS.find((f) => f.key === rawFilter)?.key ?? "all";
  const query = (rawQuery ?? "").slice(0, 80);

  const { appointments, counts } = await getHistory(filter, query);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">Historial</h1>
        <span className="text-ink-soft text-sm">
          Solicitudes canceladas, vencidas o ya atendidas.
        </span>
      </div>
      <HistoryList
        appointments={appointments}
        counts={counts}
        filter={filter}
        query={query}
      />
    </div>
  );
}
