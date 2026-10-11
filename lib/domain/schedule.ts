import { businessConfig } from "@/lib/config/business";

/**
 * 0 = Sunday .. 6 = Saturday, computed purely from the Y-M-D components of a
 * `toDateKey()` string — never via `new Date(dateKey)`, which would parse
 * against the server's local timezone instead of the business's.
 */
function dayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * Days from `todayKey` (inclusive) through the last day of the month that is
 * `monthsAhead` months after today's: in October with 2, through December 31;
 * in December, through the end of February. Pure calendar arithmetic on the
 * date key, so it does not depend on the server's time zone.
 */
export function daysThroughEndOfMonth(
  todayKey: string,
  monthsAhead: number,
): number {
  const [y, m, d] = todayKey.split("-").map(Number);
  const start = Date.UTC(y!, m! - 1, d!);
  const end = Date.UTC(y!, m! - 1 + monthsAhead + 1, 0);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function isSaturday(dateKey: string): boolean {
  return dayOfWeek(dateKey) === 6;
}

/** Sunday is closed entirely — no slots, no appointments. */
export function isSunday(dateKey: string): boolean {
  return dayOfWeek(dateKey) === 0;
}

/**
 * The allowed start times for a given day: the weekday grid Mon-Fri, the
 * single 11:00 slot on Saturday, and none at all on Sunday (closed). See
 * docs/plan-web-good-boy.md §2 and businessConfig.weeklySchedule.
 */
export function getSlotTimesFor(dateKey: string): readonly string[] {
  if (isSunday(dateKey)) return [];
  return isSaturday(dateKey)
    ? businessConfig.weeklySchedule.saturday.slotTimes
    : businessConfig.weeklySchedule.weekday.slotTimes;
}

/** Max active appointments allowed for a given day: 3 Mon-Fri, 1 Saturday, 0 Sunday. */
export function getMaxActivePerDayFor(dateKey: string): number {
  if (isSunday(dateKey)) return 0;
  return isSaturday(dateKey)
    ? businessConfig.weeklySchedule.saturday.maxActivePerDay
    : businessConfig.weeklySchedule.weekday.maxActivePerDay;
}
