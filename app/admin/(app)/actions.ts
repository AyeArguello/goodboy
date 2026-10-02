"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { getAdminSession } from "@/lib/data/admin";
import {
  getNotifier,
  type IssueUploadToken,
  type NotifyResult,
} from "@/lib/notifications/dispatch";
import {
  ADMIN_SIGNED_URL_SECONDS,
  RECEIPT_BUCKET,
} from "@/lib/receipts/constants";
import { runReceiptPurgeNow } from "@/lib/receipts/purgeRunner";
import type { PurgeSummary } from "@/supabase/functions/_shared/purge";
import type { PaymentMethod } from "@/lib/domain/appointment";

function revalidateAdmin() {
  revalidatePath("/admin/hoy");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/horarios");
  revalidatePath("/admin/mantenimiento");
}

/** Whether the customer/owner emails for an action went out, failed (queued for retry), or didn't apply. */
export type EmailStatus = "sent" | "failed" | "none";

export type AdminActionResult =
  { ok: true; emailStatus?: EmailStatus } | { ok: false; error: string };

const FRIENDLY_ERRORS: [string, string][] = [
  [
    "NOT_AUTHORIZED",
    "No tenés permiso para hacer esto. Volvé a iniciar sesión.",
  ],
  [
    "INVALID_TRANSITION",
    "El turno cambió de estado (por ejemplo, ya se confirmó). Actualizá la ficha.",
  ],
  ["NO_PENDING_RECEIPT", "No hay un comprobante pendiente de verificación."],
  [
    "RECEIPT_PENDING",
    "Hay un comprobante pendiente: confirmalo o rechazalo desde ahí.",
  ],
  ["REASON_REQUIRED", "Escribí un motivo (mínimo 3 caracteres)."],
  ["ALREADY_REFUNDED", "Esta seña ya tiene una devolución registrada."],
  ["NO_VERIFIED_PAYMENT", "No hay una seña verificada para devolver."],
  ["DEPOSIT_WINDOW_EXPIRED", "El plazo de la seña ya venció."],
  ["VALIDATION_ERROR", "Revisá los datos ingresados."],
  ["APPOINTMENT_NOT_FOUND", "No encontramos ese turno."],
];

function friendlyError(message: string): string {
  return (
    FRIENDLY_ERRORS.find(([code]) => message.includes(code))?.[1] ?? message
  );
}

const fail = (message: string): AdminActionResult => ({
  ok: false,
  error: friendlyError(message),
});

function emailStatusOf(result: NotifyResult): EmailStatus {
  const outcomes = [result.customer, result.owner];
  if (outcomes.includes("failed")) return "failed";
  if (outcomes.includes("sent")) return "sent";
  return "none";
}

/** Runs a notification and reduces it to a status. Never throws: the transition already happened. */
async function notify(fn: () => Promise<NotifyResult>): Promise<EmailStatus> {
  try {
    return emailStatusOf(await fn());
  } catch (err) {
    console.error("admin notification failed:", err);
    return "failed";
  }
}

type AdminSupabase = Awaited<ReturnType<typeof getServerSupabaseClient>>;

/** Issues upload links through the ADMIN's session, so the service role never creates them. */
function tokenIssuer(supabase: AdminSupabase): IssueUploadToken {
  return async (appointmentId, tokenHash) => {
    const { error } = await supabase.rpc("admin_issue_upload_token", {
      p_appointment_id: appointmentId,
      p_token_hash: tokenHash,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  };
}

/**
 * Server Functions are reachable by direct POST, so every action that uses
 * the service role (signed URLs, outbox retries, purge) must verify the
 * caller is a signed-in admin itself — the DB-level is_admin() check backs it
 * up for everything that goes through an RPC.
 */
async function requireAdmin(): Promise<
  { ok: true; supabase: AdminSupabase } | { ok: false; error: string }
> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: friendlyError("NOT_AUTHORIZED") };
  return { ok: true, supabase: await getServerSupabaseClient() };
}

// ------------------------------------------------------ request review

export async function approveRequest(
  appointmentId: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_approve_request", {
    p_appointment_id: appointmentId,
    p_note: note ?? null,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  // Payment instructions + secure upload link. A failure here is recorded in
  // the outbox and can be retried; the approval itself stands.
  const emailStatus = await notify(() =>
    getNotifier().requestApproved(appointmentId, tokenIssuer(supabase)),
  );
  return { ok: true, emailStatus };
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
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().appointmentCancelled(appointmentId),
  );
  return { ok: true, emailStatus };
}

// ------------------------------------------------------------ deposits

/** Manual entry without a receipt (e.g. cash at the shop). Receipts go through confirmDepositFromReceipt. */
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
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().appointmentConfirmed(appointmentId),
  );
  return { ok: true, emailStatus };
}

/**
 * Confirms the deposit from a receipt: ONE verified payment, receipts marked
 * verified, appointment confirmed. A double click gets INVALID_TRANSITION from
 * the database (the appointment is already confirmed), never a second payment.
 */
export async function confirmDepositFromReceipt(
  appointmentId: string,
  reference?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_confirm_deposit", {
    p_appointment_id: appointmentId,
    p_reference: reference?.trim() || null,
    p_note: null,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().appointmentConfirmed(appointmentId),
  );
  return { ok: true, emailStatus };
}

export async function rejectReceipts(
  appointmentId: string,
  reason: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_reject_receipts", {
    p_appointment_id: appointmentId,
    p_reason: reason,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().receiptRejected(appointmentId, tokenIssuer(supabase)),
  );
  return { ok: true, emailStatus };
}

export type ReceiptUrlResult =
  | { ok: true; url: string; mime: string; expiresInSeconds: number }
  | { ok: false; error: string };

/**
 * Short-lived signed URL for one receipt, created on the server. The admin is
 * verified twice: the receipt row is read with the ADMIN's session (RLS only
 * lets admins see it), and only then does the service role sign the path.
 */
export async function getReceiptViewUrl(
  receiptId: string,
): Promise<ReceiptUrlResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { data } = await admin.supabase
    .from("payment_receipts")
    .select("storage_path, original_mime_type")
    .eq("id", receiptId)
    .maybeSingle();
  if (!data?.storage_path) {
    return { ok: false, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error } = await getServiceSupabaseClient()
    .storage.from(RECEIPT_BUCKET)
    .createSignedUrl(data.storage_path, ADMIN_SIGNED_URL_SECONDS);
  if (error || !signed) {
    return {
      ok: false,
      error: "No pudimos abrir el comprobante. Probá de nuevo.",
    };
  }
  return {
    ok: true,
    url: signed.signedUrl,
    mime: data.original_mime_type ?? "image/jpeg",
    expiresInSeconds: ADMIN_SIGNED_URL_SECONDS,
  };
}

export async function resendUploadInstructions(
  appointmentId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const emailStatus = await notify(() =>
    getNotifier().requestApproved(appointmentId, tokenIssuer(admin.supabase), {
      resend: true,
    }),
  );
  revalidateAdmin();
  return { ok: true, emailStatus };
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
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

export async function recordRefund(
  appointmentId: string,
  amountArs: number,
  reference?: string,
  note?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_record_refund", {
    p_appointment_id: appointmentId,
    p_amount_ars: amountArs,
    p_reference: reference?.trim() || null,
    p_note: note ?? null,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().refundRecorded(appointmentId),
  );
  return { ok: true, emailStatus };
}

// -------------------------------------------------- retention / disputes

export async function setRetentionHold(
  appointmentId: string,
  hold: boolean,
  reason?: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_retention_hold", {
    p_appointment_id: appointmentId,
    p_hold: hold,
    p_reason: reason ?? null,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

export async function resolveDispute(
  appointmentId: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_resolve_dispute", {
    p_appointment_id: appointmentId,
  });
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

// ------------------------------------------------------- appointment

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
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().appointmentCancelled(appointmentId),
  );
  return { ok: true, emailStatus };
}

export async function completeAppointment(
  id: string,
): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "completed",
  });
  if (error) return fail(error.message);
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
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

export async function markNoShow(id: string): Promise<AdminActionResult> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_appointment_status", {
    p_appointment_id: id,
    p_new_status: "no_show",
  });
  if (error) return fail(error.message);
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
  if (error) return fail(error.message);
  revalidateAdmin();
  const emailStatus = await notify(() =>
    getNotifier().appointmentRescheduled(id),
  );
  return { ok: true, emailStatus };
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
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

// ------------------------------------------------------------- slots

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
  if (error) return fail(error.message);
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
  if (error) return fail(error.message);
  revalidateAdmin();
  return { ok: true };
}

// -------------------------------------------------------- maintenance

export type RetryEmailsResult =
  | {
      ok: true;
      summary: {
        retried: number;
        sent: number;
        failed: number;
        dismissed: number;
      };
    }
  | { ok: false; error: string };

export async function retryFailedEmails(): Promise<RetryEmailsResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  try {
    const summary = await getNotifier().retryFailed(
      tokenIssuer(admin.supabase),
    );
    revalidateAdmin();
    return { ok: true, summary };
  } catch (err) {
    console.error("retryFailedEmails failed:", err);
    return {
      ok: false,
      error: "No pudimos reintentar los emails. Probá de nuevo.",
    };
  }
}

export type PurgeActionResult =
  { ok: true; summary: PurgeSummary } | { ok: false; error: string };

/** Manual receipt purge; `rearm` first re-opens receipts that exhausted their retries. */
export async function runReceiptPurge(
  rearm = false,
): Promise<PurgeActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  try {
    if (rearm) {
      const { error } = await admin.supabase.rpc(
        "admin_reset_receipt_deletion_attempts",
      );
      if (error) return { ok: false, error: friendlyError(error.message) };
    }
    const summary = await runReceiptPurgeNow();
    revalidateAdmin();
    return { ok: true, summary };
  } catch (err) {
    console.error("runReceiptPurge failed:", err);
    return {
      ok: false,
      error: "La limpieza falló. Mirá los registros e intentá de nuevo.",
    };
  }
}
