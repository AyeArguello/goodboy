import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getAdminSession: vi.fn(),
  appointmentConfirmed: vi.fn(),
  requestApproved: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: () => ({}),
}));
vi.mock("@/lib/data/admin", () => ({
  getAdminSession: mocks.getAdminSession,
}));
vi.mock("@/lib/receipts/purgeRunner", () => ({ runReceiptPurgeNow: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({
  getNotifier: () => ({
    appointmentConfirmed: mocks.appointmentConfirmed,
    requestApproved: mocks.requestApproved,
  }),
}));

import {
  createManualAppointment,
  type ManualAppointmentInput,
} from "./actions";

const SLOT = "7b6f1c2e-5d3a-4f8e-9c1a-0e2d4b6a8c10";

const valid = (
  overrides: Partial<ManualAppointmentInput> = {},
): ManualAppointmentInput => ({
  slotId: SLOT,
  dogName: "Firulais",
  sizeBucket: "mediano",
  breed: "",
  coatState: "largo",
  servicePackage: "crecimiento_continuo",
  notes: "",
  logisticsMode: "self",
  neighborhood: "",
  pickupAddress: "",
  ownerName: "Marta Gómez",
  phone: "351 123-4567",
  email: "",
  initialStatus: "confirmed",
  depositMethod: null,
  force: false,
  ...overrides,
});

describe("createManualAppointment", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getAdminSession.mockResolvedValue({
      userId: "admin-1",
      email: "a@x.com",
    });
    mocks.rpc.mockResolvedValue({
      data: [{ appointment_id: "appt-1", code: "GB-ABCDEFGH" }],
      error: null,
    });
    mocks.appointmentConfirmed.mockResolvedValue({
      customer: "sent",
      owner: "none",
    });
    mocks.requestApproved.mockResolvedValue({
      customer: "sent",
      owner: "none",
    });
  });

  it("is only for a signed-in admin", async () => {
    mocks.getAdminSession.mockResolvedValue(null);

    const result = await createManualAppointment(valid());

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("normalises the phone and sends the booking to the database", async () => {
    const result = await createManualAppointment(valid());

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt-1",
      code: "GB-ABCDEFGH",
      emailStatus: "none",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_create_appointment",
      expect.objectContaining({
        p_slot_id: SLOT,
        p_dog_name: "Firulais",
        p_phone_e164: "+5493511234567",
        p_email: null,
        p_breed: null,
        p_notes: null,
        p_initial_status: "confirmed",
        p_deposit_method: null,
        p_force: false,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/horarios");
  });

  it("sends nothing by email when the turn has no address", async () => {
    await createManualAppointment(valid());

    expect(mocks.appointmentConfirmed).not.toHaveBeenCalled();
    expect(mocks.requestApproved).not.toHaveBeenCalled();
  });

  it("confirms by email a confirmed turn that has an address", async () => {
    const result = await createManualAppointment(
      valid({ email: "marta@example.com", depositMethod: "cash" }),
    );

    expect(mocks.appointmentConfirmed).toHaveBeenCalledWith("appt-1");
    expect(result).toMatchObject({ ok: true, emailStatus: "sent" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_create_appointment",
      expect.objectContaining({
        p_email: "marta@example.com",
        p_deposit_method: "cash",
      }),
    );
  });

  it("sends the payment instructions when the turn waits for the deposit", async () => {
    await createManualAppointment(
      valid({ email: "marta@example.com", initialStatus: "awaiting_deposit" }),
    );

    expect(mocks.requestApproved).toHaveBeenCalledWith(
      "appt-1",
      expect.any(Function),
    );
    expect(mocks.appointmentConfirmed).not.toHaveBeenCalled();
  });

  it("keeps the booking when the email fails and says so", async () => {
    mocks.appointmentConfirmed.mockResolvedValue({
      customer: "failed",
      owner: "none",
    });

    const result = await createManualAppointment(
      valid({ email: "marta@example.com" }),
    );

    expect(result).toMatchObject({ ok: true, emailStatus: "failed" });
  });

  it("rejects a phone that is not 10 digits", async () => {
    const result = await createManualAppointment(valid({ phone: "351 123" }));

    expect(result).toEqual({
      ok: false,
      error: "El teléfono debe tener 10 números (código de área y número).",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires neighbourhood and address for a pickup", async () => {
    const result = await createManualAppointment(
      valid({ logisticsMode: "pickup", neighborhood: "Nueva Córdoba" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Para el traslado hace falta el barrio y la dirección.",
    });
  });

  it("rejects malformed data before it reaches the database", async () => {
    for (const bad of [
      { dogName: "   " },
      { email: "no-es-un-correo" },
      { slotId: "no-es-un-uuid" },
      { ownerName: "x".repeat(81) },
      {
        initialStatus: "awaiting_deposit" as const,
        depositMethod: "cash" as const,
      },
    ]) {
      const result = await createManualAppointment(valid(bad));
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("explains in plain words why the agenda refused", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "SLOT_TAKEN" },
    });

    const result = await createManualAppointment(valid());

    expect(result).toEqual({
      ok: false,
      error: "Ese horario ya tiene un turno. Elegí otro o cancelá el que está.",
    });
    expect(mocks.appointmentConfirmed).not.toHaveBeenCalled();
  });
});
