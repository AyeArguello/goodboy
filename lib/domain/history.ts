import type { AppointmentStatus } from "./appointment";

/** Requests that are over: cancelled, expired, done or no-show. */
export type HistoryGroup = "cancelled" | "expired" | "completed" | "no_show";
export type HistoryFilter = "all" | HistoryGroup;

export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "cancelled", label: "Canceladas" },
  { key: "expired", label: "Vencidas" },
  { key: "completed", label: "Completadas" },
  { key: "no_show", label: "No vino" },
];

const GROUP_BY_STATUS: Partial<Record<AppointmentStatus, HistoryGroup>> = {
  cancelled_by_client: "cancelled",
  cancelled_by_business: "cancelled",
  deposit_forfeited: "cancelled",
  expired: "expired",
  completed: "completed",
  no_show: "no_show",
};

/** The statuses that belong in the history (the rest are still open). */
export const HISTORY_STATUSES = Object.keys(
  GROUP_BY_STATUS,
) as AppointmentStatus[];

export function historyGroupOf(status: AppointmentStatus): HistoryGroup | null {
  return GROUP_BY_STATUS[status] ?? null;
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search by dog, owner, code or phone, ignoring accents and case. */
export function matchesHistoryQuery(
  appointment: {
    dogName: string;
    ownerName: string;
    code: string;
    phoneE164: string;
  },
  query: string,
): boolean {
  const q = normalize(query).trim();
  if (!q) return true;
  return [
    appointment.dogName,
    appointment.ownerName,
    appointment.code,
    appointment.phoneE164,
  ].some((field) => normalize(field).includes(q));
}
