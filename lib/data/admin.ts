import "server-only";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/domain/datetime";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type AppointmentStatus,
  type CoatState,
  type LogisticsMode,
  type AppointmentEventType,
  type PaymentMethod,
  type ReceiptStatus,
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
  refundedAt: string | null;
  refundAmountArs: number | null;
  refundReference: string | null;
}

export interface ReceiptRow {
  id: string;
  status: ReceiptStatus;
  uploadedAt: string;
  reference: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  retentionUntil: string | null;
  deletedAt: string | null;
  deletionAttempts: number;
  lastDeletionError: string | null;
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
  receipts: ReceiptRow[];
  closedAt: string | null;
  retentionHold: boolean;
  retentionHoldReason: string | null;
  disputeResolvedAt: string | null;
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
  closed_at: string | null;
  retention_hold: boolean;
  retention_hold_reason: string | null;
  dispute_resolved_at: string | null;
  availability_slots: { starts_at: string } | null;
  payments: {
    id: string;
    amount_ars: number;
    method: PaymentMethod;
    status: "pending" | "verified" | "reversed";
    external_reference: string | null;
    verified_at: string;
    refunded_at: string | null;
    refund_amount_ars: number | null;
    refund_reference: string | null;
  }[];
  payment_receipts: {
    id: string;
    status: ReceiptStatus;
    uploaded_at: string;
    reference: string | null;
    original_mime_type: string | null;
    size_bytes: number | null;
    verified_at: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    retention_until: string | null;
    deleted_at: string | null;
    deletion_attempts: number;
    last_deletion_error: string | null;
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
          refundedAt: latest.refunded_at,
          refundAmountArs:
            latest.refund_amount_ars === null
              ? null
              : Number(latest.refund_amount_ars),
          refundReference: latest.refund_reference,
        }
      : null,
    receipts: [...(row.payment_receipts ?? [])]
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
      .map((r) => ({
        id: r.id,
        status: r.status,
        uploadedAt: r.uploaded_at,
        reference: r.reference,
        mimeType: r.original_mime_type,
        sizeBytes: r.size_bytes,
        verifiedAt: r.verified_at,
        rejectedAt: r.rejected_at,
        rejectionReason: r.rejection_reason,
        retentionUntil: r.retention_until,
        deletedAt: r.deleted_at,
        deletionAttempts: r.deletion_attempts,
        lastDeletionError: r.last_deletion_error,
      })),
    closedAt: row.closed_at,
    retentionHold: row.retention_hold,
    retentionHoldReason: row.retention_hold_reason,
    disputeResolvedAt: row.dispute_resolved_at,
  };
}

const APPOINTMENT_SELECT = `
  id, code, dog_name, size_bucket, breed, coat_state, service_package, notes, admin_notes,
  logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, status, slot_id,
  deposit_due_at, closed_at, retention_hold, retention_hold_reason, dispute_resolved_at,
  availability_slots(starts_at),
  payments(id, amount_ars, method, status, external_reference, verified_at, refunded_at, refund_amount_ars, refund_reference),
  payment_receipts(id, status, uploaded_at, reference, original_mime_type, size_bytes, verified_at, rejected_at, rejection_reason, retention_until, deleted_at, deletion_attempts, last_deletion_error)
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
  "pending_review" | "receipts" | "awaiting_deposit" | "confirmed" | "all";

export async function getRequestsList(
  filter: RequestsFilter,
): Promise<AppointmentRow[]> {
  const supabase = await getServerSupabaseClient();
  let query = supabase.from("appointments").select(APPOINTMENT_SELECT);
  if (filter === "all") query = query.in("status", ACTIVE_APPOINTMENT_STATUSES);
  else if (filter === "receipts")
    query = query.eq("status", "awaiting_deposit");
  else query = query.eq("status", filter);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as RawAppointment[])
    .map(mapAppointment)
    .filter(
      (a) =>
        filter !== "receipts" ||
        a.receipts.some((r) => r.status === "pending_verification"),
    )
    .sort((a, b) =>
      // Receipts: earliest payment deadline first, so "Verificación vencida" leads.
      filter === "receipts"
        ? (a.depositDueAt ?? "").localeCompare(b.depositDueAt ?? "")
        : a.startsAt.localeCompare(b.startsAt),
    );
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

/** Appointments with at least one receipt waiting for the admin's decision. */
export async function getPendingReceiptsCount(): Promise<number> {
  const supabase = await getServerSupabaseClient();
  const { data } = await supabase
    .from("payment_receipts")
    .select("appointment_id")
    .eq("status", "pending_verification");
  return new Set((data ?? []).map((r) => r.appointment_id as string)).size;
}

export interface EventRow {
  id: string;
  type: AppointmentEventType;
  actor: "system" | "admin";
  note: string | null;
  createdAt: string;
}

export async function getAppointmentEvents(
  appointmentId: string,
): Promise<EventRow[]> {
  const supabase = await getServerSupabaseClient();
  const { data } = await supabase
    .from("appointment_events")
    .select("id, event_type, actor, note, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    type: e.event_type as AppointmentEventType,
    actor: e.actor as "system" | "admin",
    note: (e.note as string | null) ?? null,
    createdAt: e.created_at as string,
  }));
}

export interface EmailLogRow {
  id: string;
  kind: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export async function getAppointmentEmails(
  appointmentId: string,
): Promise<EmailLogRow[]> {
  const supabase = await getServerSupabaseClient();
  const { data } = await supabase
    .from("email_outbox")
    .select("id, kind, status, attempts, last_error, created_at, sent_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    kind: e.kind as string,
    status: e.status as "pending" | "sent" | "failed",
    attempts: e.attempts as number,
    lastError: (e.last_error as string | null) ?? null,
    createdAt: e.created_at as string,
    sentAt: (e.sent_at as string | null) ?? null,
  }));
}

export interface MaintenanceOverview {
  lastRun: {
    source: string;
    startedAt: string;
    candidates: number;
    deleted: number;
    failed: number;
    orphansRemoved: number;
    error: string | null;
  } | null;
  dueNow: number;
  stuckAfterRetries: number;
  failedEmails: number;
}

export async function getMaintenanceOverview(): Promise<MaintenanceOverview> {
  const supabase = await getServerSupabaseClient();
  const nowIso = new Date().toISOString();
  const [run, due, stuck, emails] = await Promise.all([
    supabase
      .from("receipt_purge_runs")
      .select(
        "source, started_at, candidates, deleted, failed, orphans_removed, error",
      )
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payment_receipts")
      .select("id", { count: "exact", head: true })
      .neq("status", "deleted")
      .not("storage_path", "is", null)
      .lte("retention_until", nowIso),
    supabase
      .from("payment_receipts")
      .select("id", { count: "exact", head: true })
      .neq("status", "deleted")
      .gte("deletion_attempts", 5),
    supabase
      .from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);
  const r = run.data;
  return {
    lastRun: r
      ? {
          source: r.source as string,
          startedAt: r.started_at as string,
          candidates: r.candidates as number,
          deleted: r.deleted as number,
          failed: r.failed as number,
          orphansRemoved: r.orphans_removed as number,
          error: (r.error as string | null) ?? null,
        }
      : null,
    dueNow: due.count ?? 0,
    stuckAfterRetries: stuck.count ?? 0,
    failedEmails: emails.count ?? 0,
  };
}

export async function getFailedEmailsCount(): Promise<number> {
  const supabase = await getServerSupabaseClient();
  const { count } = await supabase
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");
  return count ?? 0;
}
