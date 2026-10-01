import "server-only";

export interface BookableSlot {
  slotId: string;
  startsAt: string;
  dateKey: string;
}

export interface DayAvailabilityPreview {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  slotLabels: string[];
}

/**
 * Every published, genuinely-free future slot (already excludes taken slots
 * and blocked dates — see the `public_availability()` RPC). Backs both the
 * landing preview and the turnero's day/slot pickers so there's one shape
 * for "what can be booked right now".
 *
 * Until a Supabase project is connected this returns an empty list, which
 * renders the legitimate "sin horarios publicados" empty state rather than
 * inventing example slots.
 */
export async function getBookableSlots(): Promise<BookableSlot[]> {
  const { getPublicSupabaseClient } = await import("@/lib/supabase/public");
  const supabase = getPublicSupabaseClient();

  const { data, error } = await supabase.rpc("public_availability");
  if (error || !data) {
    if (error) console.error("public_availability RPC failed:", error.message);
    return [];
  }

  type Row = { slot_id: string; starts_at: string; date_key: string };
  return (data as Row[]).map((row) => ({
    slotId: row.slot_id,
    startsAt: row.starts_at,
    dateKey: row.date_key,
  }));
}

/** Groups the next few days of bookable slots for the landing's preview section. */
export async function getUpcomingAvailability(
  maxDays = 5,
): Promise<DayAvailabilityPreview[]> {
  const slots = await getBookableSlots();
  const { formatDayLabel, formatTimeLabel } =
    await import("@/lib/domain/datetime");

  const byDate = new Map<string, BookableSlot[]>();
  for (const slot of slots) {
    const bucket = byDate.get(slot.dateKey) ?? [];
    bucket.push(slot);
    byDate.set(slot.dateKey, bucket);
  }

  return Array.from(byDate.entries())
    .slice(0, maxDays)
    .map(([dateKey, daySlots]) => {
      const first = new Date(daySlots[0]!.startsAt);
      return {
        dateKey,
        dayLabel: formatDayLabel(first),
        dateLabel: formatDayLabel(first),
        slotLabels: daySlots.map((s) => formatTimeLabel(new Date(s.startsAt))),
      };
    });
}
