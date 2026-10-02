import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/appointments", () => ({
  bookAppointment: vi.fn().mockResolvedValue({
    ok: true,
    code: "GB-TEST",
    appointmentId: "id",
    slotStartsAt: "2026-09-25T12:00:00.000Z",
  }),
}));
const requestReceived = vi.fn().mockResolvedValue({ customer: "sent" });
vi.mock("@/lib/notifications/dispatch", () => ({
  getNotifier: () => ({ requestReceived }),
}));

const { submitBookingAction } = await import("./actions");
type BookingFormInput = Parameters<typeof submitBookingAction>[0];

const validBase: BookingFormInput = {
  slotId: "00000000-0000-0000-0000-000000000000",
  dogName: "Luna",
  sizeBucket: "mediano",
  servicePackage: "crecimiento_continuo",
  logisticsMode: "self",
  ownerName: "Carolina",
  phone: "3511234567",
  email: "carolina@example.com",
  consentPrice: true,
  consentDeposit: true,
  consentPrivacy: true,
};

describe("submitBookingAction validation", () => {
  it("requires the dog's name", async () => {
    const result = await submitBookingAction({ ...validBase, dogName: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.dogName).toBeTruthy();
  });

  it.each([
    ["", "correo"],
    ["   ", "correo"],
    ["no-es-un-correo", "correo"],
  ])("requires a valid email (%j)", async (email) => {
    const result = await submitBookingAction({ ...validBase, email });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.email).toContain("correo");
  });

  it("sends the request notifications through the outbox after a successful booking", async () => {
    requestReceived.mockClear();
    const result = await submitBookingAction(validBase);
    expect(result).toEqual({ ok: true, code: "GB-TEST" });
    expect(requestReceived).toHaveBeenCalledWith("id");
  });

  it("a notification failure never turns a successful booking into an error", async () => {
    requestReceived.mockRejectedValueOnce(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await submitBookingAction(validBase);
    expect(result).toEqual({ ok: true, code: "GB-TEST" });
    spy.mockRestore();
  });

  it("requires a valid 10-digit phone number", async () => {
    const result = await submitBookingAction({ ...validBase, phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.phone).toContain("10 dígitos");
  });

  it("requires neighborhood and pickup address when logistics is pickup", async () => {
    const result = await submitBookingAction({
      ...validBase,
      logisticsMode: "pickup",
      neighborhood: "",
      pickupAddress: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.neighborhood).toBeTruthy();
      expect(result.fieldErrors.pickupAddress).toBeTruthy();
    }
  });

  it("does not require neighborhood/address when the owner brings the dog themselves", async () => {
    const result = await submitBookingAction({
      ...validBase,
      logisticsMode: "self",
    });
    expect(result).toEqual({ ok: true, code: "GB-TEST" });
  });

  it("requires all three consents", async () => {
    const result = await submitBookingAction({
      ...validBase,
      consentDeposit: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.fieldErrors.consentPrice).toContain("tres puntos");
  });

  it("rejects a malformed slotId before touching the database", async () => {
    const result = await submitBookingAction({
      ...validBase,
      slotId: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.slotId).toBeTruthy();
  });
});
