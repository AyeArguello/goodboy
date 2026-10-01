import { businessConfig } from "@/lib/config/business";
import { e164ToWhatsAppDigits } from "@/lib/domain/phone";

/**
 * Builds a wa.me deep link with a prearmed message. This is the *entire*
 * WhatsApp integration for the MVP: no Business API, no auto-send — the
 * owner (or the customer) always reviews and taps send themselves.
 */
export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const digits = e164ToWhatsAppDigits(phoneE164);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Generic "talk to us" link using the business number, no prefilled context. */
export function businessWhatsAppLink(message?: string): string {
  return buildWhatsAppLink(
    businessConfig.whatsappNumberE164,
    message ?? "Hola, quiero consultar por un turno para mi perro.",
  );
}

export function customerSummaryMessage(input: {
  dogName: string;
  slotLabel: string;
  code: string;
}): string {
  return [
    `Hola, les mando el resumen de mi solicitud (${input.code}).`,
    `Perro: ${input.dogName}`,
    `Turno: ${input.slotLabel}`,
    "Adjunto una foto reciente.",
  ].join("\n");
}

/**
 * Prearmed templates shown in the admin's "Detalle" screen. The admin taps
 * one, reviews the text, and sends manually — never automated.
 */
export const adminWhatsAppTemplates = {
  approveWithDepositInstructions: (input: {
    ownerName: string;
    dogName: string;
    when: string;
    amountArs: number;
    dueHours: number;
  }) =>
    `Hola ${input.ownerName}, tu turno para ${input.dogName} el ${input.when} fue aprobado. ` +
    `Para confirmarlo necesitamos una seña de ARS ${input.amountArs.toLocaleString("es-AR")} (se descuenta del total), ` +
    `dentro de las próximas ${input.dueHours} h. Te paso los datos para transferir o el link de Mercado Pago (con recargo) — ¿cuál preferís?`,
  confirmDepositReceived: (input: {
    ownerName: string;
    dogName: string;
    when: string;
  }) =>
    `Hola ${input.ownerName}, recibimos tu seña — el turno de ${input.dogName} el ${input.when} queda confirmado. ¡Te esperamos!`,
  askForPhoto: (input: { ownerName: string; dogName: string }) =>
    `Hola ${input.ownerName}, ¿me mandás una foto reciente de ${input.dogName}?`,
  proposeNewTime: (input: { ownerName: string }) =>
    `Hola ${input.ownerName}, ese horario no me queda. ¿Te sirve [día y hora]?`,
  confirmTransportCost: (input: { neighborhood: string }) =>
    `El traslado desde ${input.neighborhood || "tu barrio"} es de ARS [monto], ida y vuelta.`,
  depositForfeited: (input: { ownerName: string; dogName: string }) =>
    `Hola ${input.ownerName}, como la cancelación del turno de ${input.dogName} fue con menos de 48 h de anticipación, la seña no se reintegra. Cualquier duda, escribinos.`,
};
