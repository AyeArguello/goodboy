import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createTestAdminClient,
  serviceClient,
  validAppointmentPayload,
} from "./helpers";

const TZ = "America/Argentina/Cordoba";

function localParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    weekday: get("weekday"),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

async function generate(days: number | null = 30) {
  const { data, error } = await serviceClient().rpc(
    "ensure_default_slots",
    days === null ? {} : { p_days: days },
  );
  expect(error, JSON.stringify(error)).toBeNull();
  return data as number;
}

/** First free published slot at least `afterHours` away on the given weekdays. */
async function slotOn(weekdays: string[], afterHours = 48, skip = 0) {
  const { data, error } = await serviceClient()
    .from("availability_slots")
    .select("id, starts_at, is_published")
    .gt("starts_at", new Date(Date.now() + afterHours * 3600_000).toISOString())
    .order("starts_at")
    .limit(120);
  if (error) throw error;
  const matches = (data ?? []).filter((s) =>
    weekdays.includes(localParts(s.starts_at).weekday),
  );
  const slot = matches[skip];
  if (!slot) throw new Error(`no slot on ${weekdays.join("/")}`);
  return slot as { id: string; starts_at: string; is_published: boolean };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const manual = (slotId: string, overrides: Record<string, unknown> = {}) => ({
  p_slot_id: slotId,
  p_dog_name: "Firulais",
  p_size_bucket: "mediano",
  p_breed: null,
  p_coat_state: "largo",
  p_service_package: "crecimiento_continuo",
  p_notes: "Llamó por teléfono",
  p_logistics_mode: "self",
  p_neighborhood: null,
  p_pickup_address: null,
  p_owner_name: "Marta Gómez",
  p_phone_e164: "+5493511234567",
  p_email: null,
  p_initial_status: "confirmed",
  p_deposit_method: null,
  p_force: false,
  ...overrides,
});

describe("default schedule", () => {
  it("generates the weekly grid for the next days, published, and is idempotent", async () => {
    const created = await generate(30);
    expect(created).toBeGreaterThan(50);

    const { data } = await serviceClient()
      .from("availability_slots")
      .select("starts_at, is_published")
      .order("starts_at");
    expect(data!.length).toBe(created);
    for (const slot of data!) {
      const { weekday, time } = localParts(slot.starts_at);
      expect(slot.is_published).toBe(true);
      expect(weekday).not.toBe("Sun");
      expect(
        weekday === "Sat" ? ["11:00"] : ["09:00", "11:30", "13:30"],
      ).toContain(time);
      expect(new Date(slot.starts_at).getTime()).toBeGreaterThan(Date.now());
    }

    expect(await generate(30)).toBe(0);
  });

  it("never brings back a slot the owner hid", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    const svc = serviceClient();
    await svc
      .from("availability_slots")
      .update({ is_published: false })
      .eq("id", slot.id);

    expect(await generate(45)).toBeGreaterThanOrEqual(0);

    const { data } = await svc
      .from("availability_slots")
      .select("is_published")
      .eq("id", slot.id)
      .single();
    expect(data!.is_published).toBe(false);
  });

  it("only the server can generate it: anonymous and signed-in users cannot", async () => {
    const anon = await anonClient().rpc("ensure_default_slots", { p_days: 5 });
    expect(anon.error?.code).toBe("42501");

    const admin = await createTestAdminClient();
    const signedIn = await admin.rpc("ensure_default_slots", { p_days: 5 });
    expect(signedIn.error?.code).toBe("42501");
  });

  it("rejects a nonsensical window", async () => {
    const { error } = await serviceClient().rpc("ensure_default_slots", {
      p_days: 0,
    });
    expect(error?.message).toContain("INVALID_ARGUMENT");
  });
});

describe("public availability with the default schedule", () => {
  it("creates the schedule by itself the first time and offers the next 6 weeks", async () => {
    const svc = serviceClient();
    const { count } = await svc
      .from("availability_slots")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(0);

    const { data, error } = await anonClient().rpc("public_availability");
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data!.length).toBeGreaterThan(40);

    const horizon = Date.now() + 42 * 24 * 3600_000;
    for (const row of data!) {
      expect(new Date(row.starts_at).getTime()).toBeLessThan(horizon);
      expect(Object.keys(row).sort()).toEqual([
        "date_key",
        "slot_id",
        "starts_at",
      ]);
    }
  });

  it("by default generates through the end of the month after next", async () => {
    const generated = await generate(null);
    expect(generated).toBeGreaterThan(0);

    const { data } = await serviceClient()
      .from("availability_slots")
      .select("starts_at")
      .order("starts_at", { ascending: false })
      .limit(1);
    const last = localParts(data![0].starts_at).date;

    const [y, m] = localParts(new Date().toISOString())
      .date.split("-")
      .map(Number);
    const monthEnd = new Date(Date.UTC(y!, m! - 1 + 3, 0))
      .toISOString()
      .slice(0, 10);
    // Sunday is closed, so the last slot is on the final day or the one before.
    const dayBefore = new Date(Date.parse(monthEnd) - 24 * 3600_000)
      .toISOString()
      .slice(0, 10);
    expect([monthEnd, dayBefore]).toContain(last);
  });

  it("hides what the owner removed: a slot, a whole day, and gives it back when restored", async () => {
    await generate(30);
    const admin = await createTestAdminClient();
    const anon = anonClient();
    const slot = await slotOn(WEEKDAYS, 48, 0);
    const other = await slotOn(WEEKDAYS, 48, 5);
    const otherDate = localParts(other.starts_at).date;

    const ids = async () =>
      new Set(
        ((await anon.rpc("public_availability")).data ?? []).map(
          (r: { slot_id: string }) => r.slot_id,
        ),
      );

    expect((await ids()).has(slot.id)).toBe(true);
    expect(
      (
        await admin.rpc("admin_set_slot_visibility", {
          p_slot_id: slot.id,
          p_visible: false,
        })
      ).error,
    ).toBeNull();
    expect((await ids()).has(slot.id)).toBe(false);
    expect(
      (
        await admin.rpc("admin_set_slot_visibility", {
          p_slot_id: slot.id,
          p_visible: true,
        })
      ).error,
    ).toBeNull();
    expect((await ids()).has(slot.id)).toBe(true);

    expect(
      (
        await admin.rpc("admin_block_date", {
          p_date: otherDate,
          p_reason: "Vacaciones",
        })
      ).error,
    ).toBeNull();
    expect((await ids()).has(other.id)).toBe(false);
    expect(
      (await admin.rpc("admin_unblock_date", { p_date: otherDate })).error,
    ).toBeNull();
    expect((await ids()).has(other.id)).toBe(true);
  });

  it("unblocking is for admins only", async () => {
    const anon = await anonClient().rpc("admin_unblock_date", {
      p_date: "2030-01-01",
    });
    expect(anon.error).not.toBeNull();
    expect(anon.error?.code).toBe("42501");
  });
});

describe("manual bookings", () => {
  let admin: Awaited<ReturnType<typeof createTestAdminClient>>;
  beforeAll(async () => {
    admin = await createTestAdminClient();
  });

  it("books a confirmed turn without an email and takes the slot off the public list", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);

    const { data, error } = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id),
    );
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data![0].code).toMatch(/^GB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);

    const svc = serviceClient();
    const { data: appt } = await svc
      .from("appointments")
      .select(
        "status, email, owner_name, admin_notes, deposit_due_at, consents",
      )
      .eq("id", data![0].appointment_id)
      .single();
    expect(appt).toMatchObject({
      status: "confirmed",
      email: null,
      owner_name: "Marta Gómez",
      deposit_due_at: null,
      consents: [],
    });
    expect(appt!.admin_notes).toContain("a mano");

    const { data: events } = await svc
      .from("appointment_events")
      .select("event_type, actor")
      .eq("appointment_id", data![0].appointment_id);
    expect(events).toEqual([{ event_type: "created", actor: "admin" }]);

    const publicIds = (await anonClient().rpc("public_availability")).data.map(
      (r: { slot_id: string }) => r.slot_id,
    );
    expect(publicIds).not.toContain(slot.id);
  });

  it("can record the deposit as already received", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    const { data, error } = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id, {
        p_deposit_method: "cash",
        p_email: "marta@example.com",
      }),
    );
    expect(error, JSON.stringify(error)).toBeNull();

    const svc = serviceClient();
    const { data: payments } = await svc
      .from("payments")
      .select("status, method, amount_ars")
      .eq("appointment_id", data![0].appointment_id);
    expect(payments).toEqual([
      { status: "verified", method: "cash", amount_ars: 20000 },
    ]);
    const { data: events } = await svc
      .from("appointment_events")
      .select("event_type")
      .eq("appointment_id", data![0].appointment_id);
    expect(events!.map((e) => e.event_type).sort()).toEqual([
      "created",
      "deposit_recorded",
    ]);
  });

  it("can open the turn waiting for the deposit, with its payment window", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    const { data, error } = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id, { p_initial_status: "awaiting_deposit" }),
    );
    expect(error, JSON.stringify(error)).toBeNull();

    const { data: appt } = await serviceClient()
      .from("appointments")
      .select("status, deposit_due_at")
      .eq("id", data![0].appointment_id)
      .single();
    expect(appt!.status).toBe("awaiting_deposit");
    expect(new Date(appt!.deposit_due_at!).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("respects the agenda already assigned: a taken slot is refused, even when forced", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    expect(
      (await admin.rpc("admin_create_appointment", manual(slot.id))).error,
    ).toBeNull();

    const again = await admin.rpc("admin_create_appointment", manual(slot.id));
    expect(again.error?.message).toContain("SLOT_TAKEN");
    const forced = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id, { p_force: true }),
    );
    expect(forced.error?.message).toContain("SLOT_TAKEN");

    // And a customer cannot take it either.
    const customer = await anonClient().rpc("request_appointment", {
      ...validAppointmentPayload(slot.id),
      p_client_key: "manual-vs-customer",
    });
    expect(customer.error?.message).toContain("SLOT_TAKEN");
  });

  it("books Saturday's single turn once and then the day is full", async () => {
    await generate(30);
    const saturday = await slotOn(["Sat"]);
    expect(
      (await admin.rpc("admin_create_appointment", manual(saturday.id))).error,
    ).toBeNull();
    const second = await admin.rpc(
      "admin_create_appointment",
      manual(saturday.id),
    );
    expect(second.error?.message).toMatch(/SLOT_TAKEN|DAY_FULL/);
  });

  it("refuses a hidden slot or a blocked day unless the owner insists", async () => {
    await generate(30);
    const svc = serviceClient();
    const hidden = await slotOn(WEEKDAYS, 48, 0);
    await svc
      .from("availability_slots")
      .update({ is_published: false })
      .eq("id", hidden.id);

    const refused = await admin.rpc(
      "admin_create_appointment",
      manual(hidden.id),
    );
    expect(refused.error?.message).toContain("SLOT_NOT_AVAILABLE");
    const forced = await admin.rpc(
      "admin_create_appointment",
      manual(hidden.id, { p_force: true }),
    );
    expect(forced.error, JSON.stringify(forced.error)).toBeNull();

    const blocked = await slotOn(WEEKDAYS, 48, 6);
    await admin.rpc("admin_block_date", {
      p_date: localParts(blocked.starts_at).date,
      p_reason: "Feriado",
    });
    const blockedRefused = await admin.rpc(
      "admin_create_appointment",
      manual(blocked.id),
    );
    expect(blockedRefused.error?.message).toContain("SLOT_NOT_AVAILABLE");
    const blockedForced = await admin.rpc(
      "admin_create_appointment",
      manual(blocked.id, { p_force: true }),
    );
    expect(blockedForced.error).toBeNull();
  });

  it("does not book the past or an unknown slot", async () => {
    await generate(30);
    const svc = serviceClient();
    // A past slot that is on the weekly grid (a weekday 09:00 two weeks ago).
    let day = new Date(Date.now() - 14 * 24 * 3600_000);
    while (["Sat", "Sun"].includes(localParts(day.toISOString()).weekday)) {
      day = new Date(day.getTime() - 24 * 3600_000);
    }
    const { data: past } = await svc
      .from("availability_slots")
      .insert({
        starts_at: `${localParts(day.toISOString()).date}T09:00:00-03:00`,
        is_published: true,
      })
      .select("id")
      .single();

    const pastResult = await admin.rpc(
      "admin_create_appointment",
      manual(past!.id, { p_force: true }),
    );
    expect(pastResult.error?.message).toContain("SLOT_IN_PAST");

    const unknown = await admin.rpc(
      "admin_create_appointment",
      manual("00000000-0000-0000-0000-000000000000"),
    );
    expect(unknown.error?.message).toContain("SLOT_NOT_FOUND");
  });

  it("validates the data like the public form does", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    for (const bad of [
      { p_phone_e164: "351 123" },
      { p_dog_name: "" },
      { p_owner_name: "x".repeat(81) },
      { p_email: "no-es-un-correo" },
      { p_logistics_mode: "pickup" },
    ]) {
      const { error } = await admin.rpc(
        "admin_create_appointment",
        manual(slot.id, bad),
      );
      expect(error?.message, JSON.stringify(bad)).toContain("VALIDATION_ERROR");
    }
    const status = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id, { p_initial_status: "completed" }),
    );
    expect(status.error?.message).toContain("INVALID_ARGUMENT");
    const early = await admin.rpc(
      "admin_create_appointment",
      manual(slot.id, {
        p_initial_status: "awaiting_deposit",
        p_deposit_method: "cash",
      }),
    );
    expect(early.error?.message).toContain("INVALID_ARGUMENT");

    const { count } = await serviceClient()
      .from("appointments")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  it("is for admins only", async () => {
    await generate(30);
    const slot = await slotOn(WEEKDAYS);
    const anon = await anonClient().rpc(
      "admin_create_appointment",
      manual(slot.id),
    );
    expect(anon.error?.code).toBe("42501");
  });

  it("does not loosen the email rule for customers", async () => {
    await generate(30);
    const first = await slotOn(WEEKDAYS, 72, 0);
    const second = await slotOn(WEEKDAYS, 72, 1);
    expect(
      (await admin.rpc("admin_create_appointment", manual(first.id))).error,
    ).toBeNull();

    const customer = await anonClient().rpc("request_appointment", {
      ...validAppointmentPayload(second.id),
      p_email: null,
      p_client_key: "no-email-customer",
    });
    expect(customer.error?.message).toContain("VALIDATION_ERROR");
  });
});
