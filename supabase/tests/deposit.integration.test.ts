import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createFutureSlot,
  createTestAdminClient,
  serviceClient,
  validAppointmentPayload,
} from "./helpers";

/**
 * Makes any normal slot count as "inside the 48h cutoff" by widening the
 * cutoff, so these tests never depend on the weekday they run on (a 22h
 * window can contain no grid slot, e.g. on a Friday evening).
 */
async function insideCutoff() {
  const { error } = await serviceClient()
    .from("business_settings")
    .update({ cancellation_cutoff_hours: 24 * 60 })
    .eq("id", true);
  if (error) throw error;
}

/** Exercises the v2 deposit lifecycle (pending_review -> awaiting_deposit -> confirmed). */
async function createPendingRequest(
  minHoursFromNow = 48,
  maxHoursFromNow?: number,
) {
  const slotId = await createFutureSlot(minHoursFromNow, maxHoursFromNow);
  const anon = anonClient();
  const { data, error } = await anon.rpc(
    "request_appointment",
    validAppointmentPayload(slotId),
  );
  if (error) throw error;
  return { slotId, appointmentId: data![0].appointment_id as string };
}

describe("deposit lifecycle", () => {
  let admin: Awaited<ReturnType<typeof createTestAdminClient>>;

  beforeAll(async () => {
    admin = await createTestAdminClient();
  });

  it("approve sets awaiting_deposit with a due date, then a verified payment confirms it", async () => {
    const svc = serviceClient();
    const { appointmentId } = await createPendingRequest();

    const { error: approveError } = await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    expect(approveError).toBeNull();

    const { data: afterApprove } = await svc
      .from("appointments")
      .select("status, deposit_due_at")
      .eq("id", appointmentId)
      .single();
    expect(afterApprove!.status).toBe("awaiting_deposit");
    expect(afterApprove!.deposit_due_at).not.toBeNull();

    const { error: depositError } = await admin.rpc(
      "admin_record_deposit_payment",
      {
        p_appointment_id: appointmentId,
        p_amount_ars: 20000,
        p_method: "bank_transfer",
      },
    );
    expect(depositError).toBeNull();

    const { data: afterDeposit } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(afterDeposit!.status).toBe("confirmed");

    const { data: payment } = await svc
      .from("payments")
      .select("amount_ars, method, status")
      .eq("appointment_id", appointmentId)
      .single();
    expect(payment).toMatchObject({
      amount_ars: 20000,
      method: "bank_transfer",
      status: "verified",
    });
  });

  it("cannot record a deposit before the request is approved", async () => {
    const { appointmentId } = await createPendingRequest();

    const { error } = await admin.rpc("admin_record_deposit_payment", {
      p_appointment_id: appointmentId,
      p_amount_ars: 20000,
      p_method: "cash",
    });
    expect(error?.message).toContain("INVALID_TRANSITION");
  });

  it("reversing a deposit reopens the awaiting_deposit window instead of losing the reservation", async () => {
    const svc = serviceClient();
    const { appointmentId } = await createPendingRequest();
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    await admin.rpc("admin_record_deposit_payment", {
      p_appointment_id: appointmentId,
      p_amount_ars: 20000,
      p_method: "cash",
    });

    const { error } = await admin.rpc("admin_reverse_deposit_payment", {
      p_appointment_id: appointmentId,
    });
    expect(error).toBeNull();

    const { data } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(data!.status).toBe("awaiting_deposit");

    const { data: payment } = await svc
      .from("payments")
      .select("status")
      .eq("appointment_id", appointmentId)
      .single();
    expect(payment!.status).toBe("reversed");
  });

  it("cancelling a confirmed appointment with plenty of notice does not forfeit the deposit", async () => {
    const svc = serviceClient();
    // 96h out — comfortably past the 48h cutoff.
    const { appointmentId } = await createPendingRequest(96);
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    await admin.rpc("admin_record_deposit_payment", {
      p_appointment_id: appointmentId,
      p_amount_ars: 20000,
      p_method: "cash",
    });

    const { error } = await admin.rpc("admin_cancel_appointment", {
      p_appointment_id: appointmentId,
      p_initiated_by: "client",
    });
    expect(error).toBeNull();

    const { data } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(data!.status).toBe("cancelled_by_client");
  });

  it("client cancelling a confirmed appointment inside the 48h cutoff forfeits the deposit", async () => {
    const svc = serviceClient();
    // Bounded to (24, 47]h so it can never accidentally land outside the
    // 48h cutoff, whichever grid slot the scan finds first.
    const { appointmentId } = await createPendingRequest(96);
    await insideCutoff();
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    await admin.rpc("admin_record_deposit_payment", {
      p_appointment_id: appointmentId,
      p_amount_ars: 20000,
      p_method: "cash",
    });

    const { error } = await admin.rpc("admin_cancel_appointment", {
      p_appointment_id: appointmentId,
      p_initiated_by: "client",
    });
    expect(error).toBeNull();

    const { data } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(data!.status).toBe("deposit_forfeited");
  });

  it("business cancelling a confirmed appointment inside the 48h cutoff never forfeits the deposit (regression for the audit's bug crítico)", async () => {
    const svc = serviceClient();
    const { appointmentId } = await createPendingRequest(96);
    await insideCutoff();
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    await admin.rpc("admin_record_deposit_payment", {
      p_appointment_id: appointmentId,
      p_amount_ars: 20000,
      p_method: "cash",
    });

    const { error } = await admin.rpc("admin_cancel_appointment", {
      p_appointment_id: appointmentId,
      p_initiated_by: "business",
    });
    expect(error).toBeNull();

    const { data } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(data!.status).toBe("cancelled_by_business");

    // The payment itself is untouched by this fix — the admin still records
    // any refund/credit manually per the (pending) business-cancellation
    // policy; only the appointment status must never read as forfeited.
    const { data: payment } = await svc
      .from("payments")
      .select("status")
      .eq("appointment_id", appointmentId)
      .single();
    expect(payment!.status).toBe("verified");
  });

  it("expire_overdue_deposits frees a slot whose deposit window lapsed", async () => {
    const svc = serviceClient();
    const { appointmentId, slotId } = await createPendingRequest();
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });

    // Force the due date into the past to simulate a lapsed window.
    await svc
      .from("appointments")
      .update({ deposit_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", appointmentId);

    const { error } = await admin.rpc("expire_overdue_deposits");
    expect(error).toBeNull();

    const { data: appt } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(appt!.status).toBe("expired");

    // The slot should now show up as bookable again for a fresh visitor.
    const anon = anonClient();
    const { data: availability } = await anon.rpc("public_availability");
    expect(
      (availability ?? []).some(
        (row: { slot_id: string }) => row.slot_id === slotId,
      ),
    ).toBe(true);
  });

  it("a fresh booking request also sweeps and frees an expired slot (inline lazy expiration)", async () => {
    const svc = serviceClient();
    const { appointmentId, slotId } = await createPendingRequest();
    await admin.rpc("admin_approve_request", {
      p_appointment_id: appointmentId,
    });
    await svc
      .from("appointments")
      .update({ deposit_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", appointmentId);

    // Without calling expire_overdue_deposits() at all, a new request for
    // the *same* slot must succeed — request_appointment's own inline sweep
    // (added in 20260101000006_v3_hardening.sql) must free it first.
    const anon = anonClient();
    const { error } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slotId),
    );
    expect(error).toBeNull();

    const { data: original } = await svc
      .from("appointments")
      .select("status")
      .eq("id", appointmentId)
      .single();
    expect(original!.status).toBe("expired");
  });
});
