import { describe, expect, it } from "vitest";
import {
  adminWhatsAppTemplates,
  buildWhatsAppLink,
  customerSummaryMessage,
} from "./whatsapp";

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the AR mobile 9 marker and encoded text", () => {
    const link = buildWhatsAppLink("+5493511234567", "Hola Good Boy");
    expect(link).toBe("https://wa.me/5493511234567?text=Hola%20Good%20Boy");
  });

  it("percent-encodes newlines and accents", () => {
    const link = buildWhatsAppLink("+5493511234567", "Línea 1\nLínea 2");
    expect(link).toContain("L%C3%ADnea%201%0AL%C3%ADnea%202");
  });
});

describe("customerSummaryMessage", () => {
  it("includes the code, dog and slot so the owner can match it to the request", () => {
    const msg = customerSummaryMessage({
      dogName: "Luna",
      slotLabel: "Viernes 25 sep · 9:00",
      code: "GB-7K4Q",
    });
    expect(msg).toContain("GB-7K4Q");
    expect(msg).toContain("Luna");
    expect(msg).toContain("Viernes 25 sep · 9:00");
  });
});

describe("adminWhatsAppTemplates", () => {
  it("falls back to a generic phrase when no neighborhood is set", () => {
    const msg = adminWhatsAppTemplates.confirmTransportCost({
      neighborhood: "",
    });
    expect(msg).toContain("tu barrio");
  });

  it("includes the deposit amount and deadline in the approval template", () => {
    const msg = adminWhatsAppTemplates.approveWithDepositInstructions({
      ownerName: "Carolina",
      dogName: "Luna",
      when: "viernes 25 sep · 9:00",
      amountArs: 20000,
      dueHours: 24,
    });
    expect(msg).toContain("Carolina");
    expect(msg).toContain("Luna");
    expect(msg).toContain("20.000");
    expect(msg).toContain("24 h");
  });

  it("confirms the deposit was received", () => {
    const msg = adminWhatsAppTemplates.confirmDepositReceived({
      ownerName: "Carolina",
      dogName: "Luna",
      when: "viernes 25 sep · 9:00",
    });
    expect(msg).toBe(
      "Hola Carolina, recibimos tu seña — el turno de Luna el viernes 25 sep · 9:00 queda confirmado. ¡Te esperamos!",
    );
  });
});
