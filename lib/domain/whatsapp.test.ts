import { describe, expect, it } from "vitest";
import {
  adminWhatsAppTemplates,
  buildWhatsAppLink,
  customerSummaryMessage,
  depositConfirmationMessage,
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

  it("approval template points to the email, not to Mercado Pago or card payments", () => {
    const msg = adminWhatsAppTemplates.approveWithDepositInstructions({
      ownerName: "Carolina",
      dogName: "Luna",
      when: "viernes 25 sep · 9:00",
      amountArs: 20000,
      dueHours: 24,
    });
    expect(msg).toContain("transferencia");
    expect(msg).toContain("email");
    expect(msg).not.toMatch(/mercado ?pago|tarjeta|recargo/i);
  });
});

describe("depositConfirmationMessage", () => {
  const base = {
    ownerName: "Carolina",
    dogName: "Luna",
    when: "viernes 25 sep · 9:00",
    pickup: false,
    neighborhood: null,
    depositAmountArs: 20000,
    priceRange: "40.000–50.000",
    cancellationPolicy:
      "Si cancelás con menos de 48 h, la seña no se reintegra.",
  };

  it("includes the client, dog, date and time, mode, deposit, balance and cancellation policy", () => {
    const msg = depositConfirmationMessage(base);
    expect(msg).toContain("Carolina");
    expect(msg).toContain("Luna");
    expect(msg).toContain("viernes 25 sep · 9:00");
    expect(msg).toContain("lo traés vos");
    expect(msg).toContain("Seña recibida: ARS 20.000");
    expect(msg).toContain("Saldo:");
    expect(msg).toContain("40.000–50.000");
    expect(msg).toContain("Cancelación: Si cancelás con menos de 48 h");
  });

  it("describes pickup with the neighborhood and the transport cost caveat", () => {
    const msg = depositConfirmationMessage({
      ...base,
      pickup: true,
      neighborhood: "Jardín",
    });
    expect(msg).toContain("lo buscamos (Jardín)");
    expect(msg).toContain("costo del traslado se confirma");
  });

  it("never claims the message was sent automatically", () => {
    expect(depositConfirmationMessage(base)).not.toMatch(/autom[aá]tic/i);
  });

  it("builds a wa.me link that opens with that text prefilled", () => {
    const link = buildWhatsAppLink(
      "+5493511234567",
      depositConfirmationMessage(base),
    );
    expect(link.startsWith("https://wa.me/5493511234567?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1]!)).toBe(
      depositConfirmationMessage(base),
    );
  });
});
