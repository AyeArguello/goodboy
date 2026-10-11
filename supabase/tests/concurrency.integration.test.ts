import { describe, expect, it } from "vitest";
import {
  anonClient,
  createFutureSlot,
  createTestAdminClient,
  serviceClient,
  validAppointmentPayload,
} from "./helpers";

/**
 * The same turn can never be booked twice, whoever asks and however many ask
 * at once. The database serializes concurrent requests on the slot (row lock),
 * so they are handled one after the other: the first to arrive wins and every
 * other one is refused with SLOT_TAKEN, which the site turns into "ese turno ya
 * fue tomado, elegí otro". A unique index is the last line of defense.
 */

// Each caller gets its own rate-limit key, as real visitors (different IPs) do.
const payload = (slotId: string) => ({
  ...validAppointmentPayload(slotId),
  p_client_key: crypto.randomUUID(),
});

async function activeCount(slotId: string) {
  const { count, error } = await serviceClient()
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .in("status", [
      "pending_review",
      "awaiting_deposit",
      "confirmed",
      "reschedule_requested",
    ]);
  expect(error).toBeNull();
  return count ?? 0;
}

const manualPayload = (slotId: string) => ({
  p_slot_id: slotId,
  p_dog_name: "Firulais",
  p_size_bucket: "mediano",
  p_breed: null,
  p_coat_state: "largo",
  p_service_package: "crecimiento_continuo",
  p_notes: null,
  p_logistics_mode: "self",
  p_neighborhood: null,
  p_pickup_address: null,
  p_owner_name: "Marta Gómez",
  p_phone_e164: "+5493511234567",
  p_email: null,
  p_initial_status: "confirmed",
  p_deposit_method: null,
  p_force: false,
});

describe("two people, same turn", () => {
  it("lets exactly one of many simultaneous requests in; all the others get SLOT_TAKEN", async () => {
    const slotId = await createFutureSlot(120);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        anonClient().rpc("request_appointment", payload(slotId)),
      ),
    );

    const winners = results.filter((r) => !r.error);
    const losers = results.filter((r) => r.error);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    // Every loser gets the specific, translatable answer, never a raw failure.
    for (const loser of losers) {
      expect(loser.error!.message).toContain("SLOT_TAKEN");
    }
    expect(await activeCount(slotId)).toBe(1);
  });

  it("keeps the winner's booking intact when later requests arrive", async () => {
    const slotId = await createFutureSlot(120);
    const first = await anonClient().rpc(
      "request_appointment",
      payload(slotId),
    );
    expect(first.error).toBeNull();

    const late = await anonClient().rpc("request_appointment", payload(slotId));
    expect(late.error?.message).toContain("SLOT_TAKEN");

    const stored = await serviceClient()
      .from("appointments")
      .select("code")
      .eq("slot_id", slotId)
      .eq("status", "pending_review");
    expect(stored.data).toHaveLength(1);
    expect(stored.data![0]!.code).toBe(first.data![0].code);
  });

  it("also holds between a customer and the owner loading a turn by hand", async () => {
    const slotId = await createFutureSlot(120);
    const admin = await createTestAdminClient();

    const [customer, owner] = await Promise.all([
      anonClient().rpc("request_appointment", payload(slotId)),
      admin.rpc("admin_create_appointment", manualPayload(slotId)),
    ]);

    const failures = [customer, owner].filter((r) => r.error);
    expect([customer, owner].filter((r) => !r.error)).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error!.message).toContain("SLOT_TAKEN");
    expect(await activeCount(slotId)).toBe(1);
  });

  it("frees the turn again once the booking is cancelled, for the next person", async () => {
    const slotId = await createFutureSlot(120);
    const admin = await createTestAdminClient();
    const first = await anonClient().rpc(
      "request_appointment",
      payload(slotId),
    );
    expect(first.error).toBeNull();
    const { data: appointment } = await serviceClient()
      .from("appointments")
      .select("id")
      .eq("slot_id", slotId)
      .single();

    const rejected = await admin.rpc("admin_reject_request", {
      p_appointment_id: appointment!.id,
      p_note: null,
    });
    expect(rejected.error).toBeNull();

    const next = await anonClient().rpc("request_appointment", payload(slotId));
    expect(next.error).toBeNull();
    expect(await activeCount(slotId)).toBe(1);
  });
});
