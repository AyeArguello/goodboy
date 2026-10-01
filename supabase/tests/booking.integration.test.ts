import { describe, expect, it } from "vitest";
import {
  anonClient,
  createFutureSlot,
  nextSaturdayDateKey,
  nextValidSlotStartsAt,
  nextWeekdayDateKey,
  serviceClient,
  validAppointmentPayload,
} from "./helpers";

describe("request_appointment", () => {
  it("succeeds for a valid, published, far-enough-in-the-future slot", async () => {
    const slotId = await createFutureSlot(48);
    const anon = anonClient();
    const { data, error } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slotId),
    );
    expect(error).toBeNull();
    expect(data?.[0]?.code).toMatch(
      /^GB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/,
    );
  });

  it("rejects a slot less than 24h away (server-side, regardless of client input)", async () => {
    // Bounded above by 23h so the pick can never accidentally land past the
    // 24h minimum-lead-time cutoff, whichever grid slot the scan finds first.
    const slotId = await createFutureSlot(1, 23);
    const anon = anonClient();
    const { error } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slotId),
    );
    expect(error?.message).toContain("SLOT_NOT_AVAILABLE");
  });

  it("rejects an unpublished slot", async () => {
    const svc = serviceClient();
    const startsAt = nextValidSlotStartsAt(48);
    const { data: slot } = await svc
      .from("availability_slots")
      .insert({ starts_at: startsAt, is_published: false })
      .select("id")
      .single();

    const anon = anonClient();
    const { error } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slot!.id),
    );
    expect(error?.message).toContain("SLOT_NOT_AVAILABLE");
  });

  it("rejects a slot on a blocked date", async () => {
    const svc = serviceClient();
    const startsAt = nextValidSlotStartsAt(72);
    const { data: slot } = await svc
      .from("availability_slots")
      .insert({ starts_at: startsAt, is_published: true })
      .select("id")
      .single();
    await svc.rpc("admin_block_date", {
      p_date: startsAt.slice(0, 10),
      p_reason: "test",
    });

    const anon = anonClient();
    const { error } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slot!.id),
    );
    expect(error?.message).toContain("SLOT_NOT_AVAILABLE");
  });

  it("rejects a time outside the published weekday/Saturday grid, even inserted directly", async () => {
    const svc = serviceClient();
    // 10:00 is not one of the three allowed weekday times — the schedule
    // trigger must reject the insert itself, defense-in-depth against a
    // direct table write that skips admin_publish_slot entirely.
    const day = nextValidSlotStartsAt(48, 48 + 24 * 5).slice(0, 10);
    const { error } = await svc
      .from("availability_slots")
      .insert({ starts_at: `${day}T10:00:00-03:00`, is_published: true });
    expect(error?.message).toContain("INVALID_TIME");
  });

  it("fills all three weekday grid slots for one day without a spurious DAY_FULL on the third", async () => {
    const day = nextWeekdayDateKey(96, 96 + 24 * 5);
    const svc = serviceClient();
    const anon = anonClient();

    for (const time of ["09:00", "11:30", "13:30"]) {
      const { data: slot, error: insertError } = await svc
        .from("availability_slots")
        .insert({ starts_at: `${day}T${time}:00-03:00`, is_published: true })
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { error } = await anon.rpc(
        "request_appointment",
        validAppointmentPayload(slot!.id),
      );
      expect(error).toBeNull();
    }
  });

  it("Saturday only ever offers the single 11:00 slot", async () => {
    const svc = serviceClient();
    const daySat = nextSaturdayDateKey(48, 48 + 24 * 8);

    const { error: badTimeError } = await svc
      .from("availability_slots")
      .insert({ starts_at: `${daySat}T13:30:00-03:00`, is_published: true });
    expect(badTimeError?.message).toContain("INVALID_TIME");

    const { data: slot, error: goodTimeError } = await svc
      .from("availability_slots")
      .insert({ starts_at: `${daySat}T11:00:00-03:00`, is_published: true })
      .select("id")
      .single();
    expect(goodTimeError).toBeNull();

    const anon = anonClient();
    const { error: bookingError } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slot!.id),
    );
    expect(bookingError).toBeNull();

    // A second attempt for that same (only) Saturday slot must fail — this
    // is where Saturday's max-1/day cap and its single-slot grid coincide.
    const { error: secondError } = await anon.rpc(
      "request_appointment",
      validAppointmentPayload(slot!.id),
    );
    expect(secondError?.message).toContain("SLOT_TAKEN");
  });

  it("exactly one of two concurrent requests for the same slot wins", async () => {
    const slotId = await createFutureSlot(120);
    const anon1 = anonClient();
    const anon2 = anonClient();

    const [r1, r2] = await Promise.all([
      anon1.rpc("request_appointment", validAppointmentPayload(slotId)),
      anon2.rpc("request_appointment", validAppointmentPayload(slotId)),
    ]);

    const results = [r1, r2];
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error!.message).toContain("SLOT_TAKEN");
  });

  it("rejects a request missing a required consent key", async () => {
    const slotId = await createFutureSlot(48);
    const anon = anonClient();
    const payload = validAppointmentPayload(slotId);
    const { error } = await anon.rpc("request_appointment", {
      ...payload,
      p_consents: [
        { key: "privacy", version: 2, accepted_at: new Date().toISOString() },
      ],
    });
    expect(error?.message).toContain("VALIDATION_ERROR");
  });

  it("rejects a dog name over 80 characters", async () => {
    const slotId = await createFutureSlot(48);
    const anon = anonClient();
    const payload = validAppointmentPayload(slotId);
    const { error } = await anon.rpc("request_appointment", {
      ...payload,
      p_dog_name: "a".repeat(81),
    });
    expect(error?.message).toContain("VALIDATION_ERROR");
  });

  it("rejects a malformed phone number", async () => {
    const slotId = await createFutureSlot(48);
    const anon = anonClient();
    const payload = validAppointmentPayload(slotId);
    const { error } = await anon.rpc("request_appointment", {
      ...payload,
      p_phone_e164: "not-a-phone",
    });
    expect(error?.message).toContain("VALIDATION_ERROR");
  });
});
