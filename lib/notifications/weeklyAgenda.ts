import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/config/business";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  formatDayLabel,
  formatTimeLabel,
  toDateKey,
} from "@/lib/domain/datetime";
import {
  buildWhatsAppLink,
  adminWhatsAppTemplates,
} from "@/lib/domain/whatsapp";
import type { AppointmentStatus } from "@/lib/domain/appointment";
import {
  renderOwnerWeeklyAgenda,
  type WeeklyAgendaItem,
} from "./emailTemplates";
import { getMailer, getOwnerEmail, type Mailer } from "./mailer";
import { sendOnce, type SendOutcome } from "./outbox";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Partial<Record<AppointmentStatus, string>> = {
  confirmed: "confirmado",
  awaiting_deposit: "esperando seña",
  pending_review: "pendiente de aprobar",
  reschedule_requested: "reprogramación pedida",
};
const INCLUDED_STATUSES = Object.keys(STATUS_LABELS);

/** Local midnight (business timezone) of a YYYY-MM-DD key, as a UTC instant. */
function localMidnight(dateKey: string): Date {
  // Córdoba has no daylight saving: UTC-3 all year.
  return new Date(`${dateKey}T00:00:00-03:00`);
}

/**
 * The coming Monday-to-Sunday week, in the business timezone. Called on a
 * Sunday it is the week that starts tomorrow; on any other day, the next one.
 */
export function nextWeekRange(now: Date): {
  start: Date;
  end: Date;
  mondayKey: string;
  rangeLabel: string;
} {
  const todayKey = toDateKey(now);
  const todayNoon = new Date(`${todayKey}T12:00:00.000Z`);
  const dow = todayNoon.getUTCDay(); // 0 = Sunday
  const daysToMonday = (8 - dow) % 7 || 7;
  const monday = new Date(todayNoon.getTime() + daysToMonday * DAY_MS);
  const mondayKey = monday.toISOString().slice(0, 10);
  const sundayKey = new Date(monday.getTime() + 6 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const start = localMidnight(mondayKey);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const short = (key: string) =>
    formatDayLabel(new Date(`${key}T15:00:00.000Z`));
  return {
    start,
    end,
    mondayKey,
    rangeLabel: `${short(mondayKey)} al ${short(sundayKey)}`,
  };
}

export interface WeeklyAgendaDeps {
  client: Pick<SupabaseClient, "rpc" | "from">;
  mailer: Mailer;
  ownerEmail: string | null;
  now?: Date;
}

export type WeeklyAgendaResult =
  | {
      ok: true;
      outcome: SendOutcome | "no_recipient";
      count: number;
      week: string;
    }
  | { ok: false; error: string };

export async function sendWeeklyAgenda(
  deps: WeeklyAgendaDeps,
): Promise<WeeklyAgendaResult> {
  const { start, end, mondayKey, rangeLabel } = nextWeekRange(
    deps.now ?? new Date(),
  );
  if (!deps.ownerEmail)
    return { ok: true, outcome: "no_recipient", count: 0, week: mondayKey };

  const { data, error } = await deps.client
    .from("appointments")
    .select(
      "id, dog_name, owner_name, phone_e164, status, availability_slots!inner(starts_at)",
    )
    .in("status", INCLUDED_STATUSES)
    .gte("availability_slots.starts_at", start.toISOString())
    .lt("availability_slots.starts_at", end.toISOString());
  if (error) return { ok: false, error: error.message };

  type Row = {
    dog_name: string;
    owner_name: string;
    phone_e164: string;
    status: AppointmentStatus;
    availability_slots: { starts_at: string } | { starts_at: string }[];
  };
  const items = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const slot = Array.isArray(r.availability_slots)
        ? r.availability_slots[0]!
        : r.availability_slots;
      return { r, startsAt: new Date(slot.starts_at) };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map(({ r, startsAt }): WeeklyAgendaItem => {
      const whenLabel = `${formatDayLabel(startsAt)} · ${formatTimeLabel(startsAt)}`;
      return {
        whenLabel,
        dogName: r.dog_name,
        ownerName: r.owner_name,
        phoneLabel: r.phone_e164,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        reminderUrl: buildWhatsAppLink(
          r.phone_e164,
          adminWhatsAppTemplates.appointmentReminder({
            ownerName: r.owner_name,
            dogName: r.dog_name,
            when: whenLabel,
          }),
        ),
      };
    });

  const outcome = await sendOnce(
    { client: deps.client, mailer: deps.mailer },
    {
      key: `owner_weekly_agenda:${mondayKey}`,
      kind: "owner_weekly_agenda",
      appointmentId: null,
      to: deps.ownerEmail,
      render: () =>
        renderOwnerWeeklyAgenda({
          rangeLabel,
          items,
          panelUrl: `${siteUrl()}/admin`,
        }),
    },
  );
  return { ok: true, outcome, count: items.length, week: mondayKey };
}

/** Production wiring. */
export async function runWeeklyAgenda(): Promise<WeeklyAgendaResult> {
  return sendWeeklyAgenda({
    client: getServiceSupabaseClient(),
    mailer: getMailer(),
    ownerEmail: getOwnerEmail(),
  });
}
