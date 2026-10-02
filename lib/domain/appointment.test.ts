import { describe, expect, it } from "vitest";
import { receiptDisplay } from "./appointment";

const NOW = new Date("2026-10-10T12:00:00Z");
const BEFORE = "2026-10-11T12:00:00Z";
const AFTER = "2026-10-09T12:00:00Z";

describe("receiptDisplay", () => {
  it("pending inside the payment window", () => {
    expect(receiptDisplay("pending_verification", BEFORE, NOW)).toEqual({
      label: "Pendiente de verificación",
      tone: "pending",
    });
  });

  it("pending after the window lapsed is flagged 'Verificación vencida' (and stays pending, never confirmed)", () => {
    expect(receiptDisplay("pending_verification", AFTER, NOW)).toEqual({
      label: "Verificación vencida",
      tone: "overdue",
    });
  });

  it("a receipt with no deadline is never overdue", () => {
    expect(receiptDisplay("pending_verification", null, NOW).tone).toBe(
      "pending",
    );
  });

  it("rejected, verified and deleted are distinct regardless of the deadline", () => {
    expect(receiptDisplay("rejected", AFTER, NOW)).toEqual({
      label: "Rechazado",
      tone: "rejected",
    });
    expect(receiptDisplay("verified", AFTER, NOW)).toEqual({
      label: "Verificado",
      tone: "verified",
    });
    expect(receiptDisplay("deleted", BEFORE, NOW)).toEqual({
      label: "Eliminado",
      tone: "deleted",
    });
  });
});
