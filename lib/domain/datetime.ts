import { businessConfig } from "@/lib/config/business";

const TIMEZONE = businessConfig.timezone;

/**
 * True if `startsAt` is at least `minLeadHours` (default: the 24h rule) in
 * the future relative to `now`. Must be re-checked server-side even though
 * the UI also disables same-day slots — the client's clock/state is never
 * trusted for this.
 */
export function isAtLeastLeadHoursAhead(
  startsAt: Date,
  now: Date = new Date(),
  minLeadHours: number = businessConfig.rules.minLeadHours,
): boolean {
  const diffMs = startsAt.getTime() - now.getTime();
  return diffMs >= minLeadHours * 60 * 60 * 1000;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

/** True if two slots on the same day are closer than the warn threshold. */
export function isWithinWarnGap(
  a: Date,
  b: Date,
  warnGapMinutes: number = businessConfig.rules.warnGapMinutes,
): boolean {
  return minutesBetween(a, b) < warnGapMinutes;
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** e.g. "jueves, 24 de septiembre" in the business timezone regardless of server locale. */
export function formatDayLabel(date: Date): string {
  return dayFormatter.format(date);
}

/** e.g. "14:00" in the business timezone. */
export function formatTimeLabel(date: Date): string {
  return timeFormatter.format(date);
}

/** e.g. 150 -> "2 h 30 min", 180 -> "3 h". */
export function formatDurationHM(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Local-clock-independent "date key" (YYYY-MM-DD) in the business timezone. */
export function toDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
