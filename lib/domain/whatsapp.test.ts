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

  it("fills in the transport amount when it is known", () => {
    expect(
      adminWhatsAppTemplates.confirmTransportCost({
        neighborhood: "Jardín",
        amount: "ARS 5.000–8.000",
      }),
    ).toBe("El traslado desde Jardín es de ARS 5.000–8.000, ida y vuelta.");
  });

  const approval = {
    ownerName: "Carolina",
    dogName: "Luna",
    when: "viernes 25 sep · 9:00",
    amountArs: 20000,
    dueLabel: "sábado 26 sep · 9:00",
    transfer: {
      alias: "good.boy.alias",
      holder: "Titular Prueba",
      cbu: "0000003100000000000001",
    },
  };

  it("asks for the deposit with the amount, the deadline and the transfer details", () => {
    const msg = adminWhatsAppTemplates.approveWithDepositInstructions(approval);
    expect(msg).toContain("Carolina");
    expect(msg).toContain("Luna");
    expect(msg).toContain("20.000");
    expect(msg).toContain("sábado 26 sep · 9:00");
    expect(msg).toContain("Alias: good.boy.alias");
    expect(msg).toContain("Titular: Titular Prueba");
    expect(msg).toContain("CBU/CVU: 0000003100000000000001");
  });

  it("asks for the receipt in the same chat, with no card or Mercado Pago", () => {
    const msg = adminWhatsAppTemplates.approveWithDepositInstructions(approval);
    expect(msg).toContain("transferencia");
    expect(msg).toContain("comprobante por este chat");
    expect(msg).not.toMatch(/mercado ?pago|tarjeta|recargo|email/i);
  });

  it("leaves a visible gap when no transfer details are configured", () => {
    const msg = adminWhatsAppTemplates.approveWithDepositInstructions({
      ...approval,
      transfer: { alias: null, holder: null, cbu: null },
    });
    expect(msg).toContain("[completar]");
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
