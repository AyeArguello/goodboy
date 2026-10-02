import { RequestsList } from "@/components/admin/RequestsList";
import {
  getPendingCount,
  getPendingReceiptsCount,
  getRequestsList,
  type RequestsFilter,
} from "@/lib/data/admin";

const VALID_FILTERS: RequestsFilter[] = [
  "pending_review",
  "receipts",
  "awaiting_deposit",
  "confirmed",
  "all",
];

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter: RequestsFilter = VALID_FILTERS.includes(
    rawFilter as RequestsFilter,
  )
    ? (rawFilter as RequestsFilter)
    : "pending_review";

  const [appointments, pendingCount, receiptsCount] = await Promise.all([
    getRequestsList(filter),
    getPendingCount(),
    getPendingReceiptsCount(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">Solicitudes</h1>
        <span className="text-ink-soft text-sm">
          {pendingCount} por revisar · {receiptsCount} comprobantes por
          verificar
        </span>
      </div>
      <RequestsList
        appointments={appointments}
        filter={filter}
        pendingCount={pendingCount}
        receiptsCount={receiptsCount}
      />
    </div>
  );
}
