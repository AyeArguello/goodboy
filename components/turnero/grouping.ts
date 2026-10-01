import type { BookableSlot } from "@/lib/data/availability";
import {
  formatDayLabel,
  formatTimeLabel,
  isAtLeastLeadHoursAhead,
} from "@/lib/domain/datetime";

export interface DaySlot {
  slotId: string;
  startsAt: Date;
  timeLabel: string;
  bookable: boolean;
}

export interface DayGroup {
  dateKey: string;
  dayLabel: string;
  slots: DaySlot[];
}

/**
 * Groups the flat, already-anonymized slot list by day for the picker.
 * `bookable` re-applies the 24h rule client-side purely for the UI (disabled
 * radio + "Hoy no" caption); the server is the actual authority and
 * re-checks this on submit.
 */
export function groupSlotsByDay(slots: BookableSlot[]): DayGroup[] {
  const byDate = new Map<string, BookableSlot[]>();
  for (const slot of slots) {
    const bucket = byDate.get(slot.dateKey) ?? [];
    bucket.push(slot);
    byDate.set(slot.dateKey, bucket);
  }

  return Array.from(byDate.entries()).map(([dateKey, daySlots]) => {
    const sorted = [...daySlots].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    const first = new Date(sorted[0]!.startsAt);
    return {
      dateKey,
      dayLabel: formatDayLabel(first),
      slots: sorted.map((s) => {
        const startsAt = new Date(s.startsAt);
        return {
          slotId: s.slotId,
          startsAt,
          timeLabel: formatTimeLabel(startsAt),
          bookable: isAtLeastLeadHoursAhead(startsAt),
        };
      }),
    };
  });
}
