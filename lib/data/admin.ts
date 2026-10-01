import "server-only";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/domain/datetime";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type AppointmentStatus,
  type CoatState,
  type LogisticsMode,
  type PaymentMethod,
  type ServicePackageKey,
  type SizeBucket,
} from "@/lib/domain/appointment";

export interface AdminSession {
  userId: string;
  email: string;
}

/** Null when there's a Supabase session but no admin_profiles row (see proxy.ts's comment on layered auth). */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("admin_profiles")
    .select("id, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { userId: data.id, email: data.email };
}

/**
 * Writes `expired` for any awaiting_deposit row whose window lapsed, so
 * every admin view reads consistent state instead of relying purely on the
 * public RPCs' lazy-expiration check. Cheap and idempotent — call it once
 * per admin request (see app/admin/(app)/layout.tsx).
 */
export async function expireOverdueDeposits(): Promise<void> {
  const supabase = await getServerSupabaseClient();
  await supabase.rpc("expire_overdue_deposits");
}

export interface PaymentInfo {
  id: string;
  amountArs: number;
  method: PaymentMethod;
  status: "pending" | "verified" | "reversed";
  externalReference: string | null;
  verifiedAt: string;
}

export interface AppointmentRow {
  id: string;
  code: string;
  dogName: string;
  sizeBucket: SizeBucket;
  breed: string | null;
  coatState: CoatState | null;
  servicePackage: ServicePackageKey;
  notes: string | null;
  adminNotes: string | null;
  logisticsMode: LogisticsMode;
  neighborhood: string | null;
  pickupAddress: string | null;
  ownerName: string;
  phoneE164: string;
  email: string | null;
  status: AppointmentStatus;
  startsAt: string;
  slotId: string;
  depositDueAt: string | null;
  latestPayment: PaymentInfo | null;
}

type RawAppointment = {
  id: string;
  code: string;
  dog_name: string;
  size_bucket: SizeBucket;
  breed: string | null;
  coat_state: CoatState | null;
  service_package: ServicePackageKey;
  notes: string | null;
  admin_notes: string | null;
  logistics_mode: LogisticsMode;
  neighborhood: string | null;
  pickup_address: string | null;
  owner_name: string;
  phone_e164: string;
  email: string | null;
  status: AppointmentStatus;
  slot_id: string;
  deposit_due_at: string | null;
  availability_slots: { starts_at: string } | null;
  payments: {
    id: string;
    amount_ars: number;
    method: PaymentMethod;
    status: "pending" | "verified" | "reversed";
    external_reference: string | null;
    verified_at: string;
  }[];
};

function mapAppointment(row: RawAppointment): AppointmentRow {
  const latest = [...row.payments].sort((a, b) =>
    b.verified_at.localeCompare(a.verified_at),
  )[0];
  return {
    id: row.id,
    code: row.code,
    dogName: row.dog_name,
    sizeBucket: row.size_bucket,
    breed: row.breed,
    coatState: row.coat_state,
    servicePackage: row.service_package,
    notes: row.notes,
    adminNotes: row.admin_notes,
    logisticsMode: row.logistics_mode,
    neighborhood: row.neighborhood,
    pickupAddress: row.pickup_address,
    ownerName: row.owner_name,
    phoneE164: row.phone_e164,
    email: row.email,
    status: row.status,
    startsAt: row.availability_slots?.starts_at ?? "",
    slotId: row.slot_id,
    depositDueAt: row.deposit_due_at,
    latestPayment: latest
      ? {
          id: latest.id,
          amountArs: Number(latest.amount_ars),
          method: latest.method,
          status: latest.status,
          externalReference: latest.external_reference,
          verifiedAt: latest.verified_at,
        }
      : null,
  };
}

const APPOINTMENT_SELECT = `
  id, code, dog_name, size_bucket, breed, coat_state, service_package, notes, admin_notes,
  logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, status, slot_id,
  deposit_due_at, availability_slots(starts_at),
  payments(id, amount_ars, method, status, external_reference, verified_at)
`;

export async function getPendingCount(): Promise<number> {
  const supabase = await getServerSupabaseClient();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");
  return count ?? 0;
}

export async function getTodayAppointments(): Promise<AppointmentRow[]> {
  const supabase = await getServerSupabaseClient();
  const todayKey = toDateKey(new Date());

  // Filtered by date in JS rather than via a dotted `availability_slots.starts_at`
  // PostgREST filter — appointment volume is tiny for this business, and this
  // sidesteps relying on to-one embed filter semantics being exactly right.
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .in("status", ["confirmed", "completed", "no_show"]);

  if (error || !data) return [];
  return (data as unknown as RawAppointment[])
    .filter(
      (r) =>
        r.availability_slots &&
        toDateKey(new Date(r.availability_slots.starts_at)) === todayKey,
    )
    .map(mapAppointment)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export type RequestsFilter =
  "pending_review" | "awaiting_deposit" | "confirmed" | "all";

export async function getRequestsList(
  filter: RequestsFilter,
): Promise<AppointmentRow[]> {
  const supabase = await getServerSupabaseClient();
  let query = supabase.from("appointments").select(APPOINTMENT_SELECT);
  if (filter !== "all") query = query.eq("status", filter);
  else query = query.in("status", ACTIVE_APPOINTMENT_STATUSES);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as RawAppointment[])
    .map(mapAppointment)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function getAppointmentById(
  id: string,
): Promise<AppointmentRow | null> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapAppointment(data as unknown as RawAppointment);
}

export interface WeekDaySlot {
  slotId: string;
  startsAt: string;
  isPublished: boolean;
  appointment: { dogName: string; status: AppointmentStatus } | null;
}

export interface WeekDay {
  dateKey: string;
  slots: WeekDaySlot[];
}

export async function getWeekAgenda(
  startDate: Date,
  days = 6,
): Promise<WeekDay[]> {
  const supabase = await getServerSupabaseClient();
  const startKey = toDateKey(startDate);
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  const endKey = toDateKey(endDate);

  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, starts_at, is_published, appointments(dog_name, status)")
    .gte("starts_at", `${startKey}T00:00:00`)
    .lt("starts_at", `${endKey}T00:00:00`)
    .order("starts_at");

  if (error || !data) return [];

  type Raw = {
    id: string;
    starts_at: string;
    is_published: boolean;
    appointments: { dog_name: string; status: AppointmentStatus }[];
  };

  const byDate = new Map<string, WeekDaySlot[]>();
  for (const row of data as unknown as Raw[]) {
    const dateKey = toDateKey(new Date(row.starts_at));
    const active = row.appointments.find((a) =>
      ACTIVE_APPOINTMENT_STATUSES.includes(a.status),
    );
    const bucket = byDate.get(dateKey) ?? [];
    bucket.push({
      slotId: row.id,
      startsAt: row.starts_at,
      isPublished: row.is_published,
      appointment: active
        ? { dogName: active.dog_name, status: active.status }
        : null,
    });
    byDate.set(dateKey, bucket);
  }

  return Array.from(byDate.entries()).map(([dateKey, slots]) => ({
    dateKey,
    slots,
  }));
}

export interface DaySlotDetail {
  slotId: string;
  startsAt: string;
  isPublished: boolean;
  appointment: {
    id: string;
    dogName: string;
    status: AppointmentStatus;
  } | null;
}

export async function getSlotsForDay(
  dateKey: string,
): Promise<DaySlotDetail[]> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, starts_at, is_published, appointments(id, dog_name, status)")
    .gte("starts_at", `${dateKey}T00:00:00`)
    .lt("starts_at", `${dateKey}T23:59:59`)
    .order("starts_at");

  if (error || !data) return [];

  type Raw = {
    id: string;
    starts_at: string;
    is_published: boolean;
    appointments: { id: string; dog_name: string; status: AppointmentStatus }[];
  };

  return (data as unknown as Raw[]).map((row) => {
    const active = row.appointments.find((a) =>
      ACTIVE_APPOINTMENT_STATUSES.includes(a.status),
    );
    return {
      slotId: row.id,
      startsAt: row.starts_at,
      isPublished: row.is_published,
      appointment: active
        ? { id: active.id, dogName: active.dog_name, status: active.status }
        : null,
    };
  });
}
