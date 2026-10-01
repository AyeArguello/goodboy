"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/domain/appointment";

function revalidateAdmin() {
  revalidatePath("/admin/hoy");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/horarios");
}

export type AdminActionResult = { ok: true } | { ok: false; error: string };

export async function approveRequest(
  appointmentId: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_approve_request", {
    p_appointment_id: appointmentId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function rejectRequest(
  appointmentId: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_reject_request", {
    p_appointment_id: appointmentId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function recordDepositPayment(
  appointmentId: string,
  amountArs: number,
  method: PaymentMethod,
  externalReference?: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_record_deposit_payment", {
    p_appointment_id: appointmentId,
    p_amount_ars: amountArs,
    p_method: method,
    p_external_reference: externalReference ?? null,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function reverseDepositPayment(
  appointmentId: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_reverse_deposit_payment", {
    p_appointment_id: appointmentId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function cancelAppointment(
  appointmentId: string,
  initiatedBy: "client" | "business",
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_cancel_appointment", {
    p_appointment_id: appointmentId,
    p_initiated_by: initiatedBy,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function completeAppointment(
  id: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "completed",
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

/** Undo for the "Marcar completado"/"Marcar ausente" toast — never a forward transition. */
export async function revertToConfirmed(
  id: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "confirmed",
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function markNoShow(id: string): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "no_show",
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function rescheduleAppointment(
  id: string,
  newSlotId: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "reschedule_requested",
    p_new_slot_id: newSlotId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function setInternalNotes(
  appointmentId: string,
  notes: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_internal_notes", {
    p_appointment_id: appointmentId,
    p_notes: notes,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export type PublishSlotResult =
  | { ok: true; warning: null }
  | { ok: true; warning: "GAP_WARNING" }
  | { ok: false; error: string };

export async function publishSlot(
  startsAtIso: string,
  force: boolean,
): Promise<PublishSlotResult> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_publish_slot", {
    p_starts_at: startsAtIso,
    p_force: force,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  const row = data?.[0];
  if (row?.warning === "GAP_WARNING")
    return { ok: true, warning: "GAP_WARNING" };
  return { ok: true, warning: null };
}

export async function setSlotVisibility(
  slotId: string,
  visible: boolean,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_slot_visibility", {
    p_slot_id: slotId,
    p_visible: visible,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

export async function blockDate(
  dateKey: string,
  reason: string | null,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_block_date", {
    p_date: dateKey,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}
