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
    "Hola 👋 les mando el resumen de mi solicitud de turno:",
    [
      `• 🔖 Código: ${input.code}`,
      `• 🐶 Perro: ${input.dogName}`,
      `• 📅 Turno: ${input.slotLabel}`,
    ].join("\n"),
    "Adjunto una foto reciente 📸",
  ].join("\n\n");
}

/**
 * Message the admin can open in WhatsApp once a deposit is confirmed. It is
 * only a prefilled link: nothing is sent until the admin taps send, and the
 * app never claims it was sent — only that the link was opened.
 */
export function depositConfirmationMessage(input: {
  ownerName: string;
  dogName: string;
  when: string;
  pickup: boolean;
  neighborhood: string | null;
  depositAmountArs: number;
  /** Orientative price range for the dog's size, e.g. "30.000–40.000". */
  priceRange: string;
  cancellationPolicy: string;
}): string {
  const details = [
    `• 📅 Cuándo: ${input.when}`,
    input.pickup
      ? `• 🚗 Modalidad: lo buscamos${input.neighborhood ? ` (${input.neighborhood})` : ""}; el costo del traslado se confirma según el barrio.`
      : "• 🏠 Modalidad: lo traés vos al local.",
    `• ✅ *Seña recibida: ARS ${input.depositAmountArs.toLocaleString("es-AR")}*`,
    `• 💰 Saldo: se confirma el día del turno al evaluar a ${input.dogName} (precio orientativo ARS ${input.priceRange}, menos la seña).`,
  ];
  return [
    `Hola ${input.ownerName} 👋 ¡confirmamos el turno de ${input.dogName}! 🐶`,
    details.join("\n"),
    `📌 Cancelación: ${input.cancellationPolicy}`,
    "¡Nos vemos pronto! 🐾",
  ].join("\n\n");
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
    /** Deadline for the deposit, e.g. "miércoles, 14 de octubre · 12:00". */
    dueLabel: string;
    transfer: {
      alias: string | null;
      holder: string | null;
      cbu: string | null;
    };
  }) => {
    const transferLines = [
      input.transfer.alias && `• Alias: ${input.transfer.alias}`,
      input.transfer.holder && `• Titular: ${input.transfer.holder}`,
      input.transfer.cbu && `• CBU/CVU: ${input.transfer.cbu}`,
    ].filter((line): line is string => Boolean(line));
    return [
      `Hola ${input.ownerName} 👋 ¡aprobamos el turno de ${input.dogName}! 🐶`,
      [
        `• 📅 Cuándo: ${input.when}`,
        `• 💸 Seña por transferencia: *ARS ${input.amountArs.toLocaleString("es-AR")}* (se descuenta del total)`,
        `• ⏰ Plazo: hasta el ${input.dueLabel}`,
      ].join("\n"),
      transferLines.length > 0
        ? ["🏦 *Datos para transferir*", ...transferLines].join("\n")
        : "🏦 *Datos para transferir:* [completar]",
      "Cuando transfieras, mandanos el comprobante por este chat y te confirmamos el turno ✅",
    ].join("\n\n");
  },
  /** Reminder for a booked turn, e.g. for clients who booked days ahead. */
  appointmentReminder: (input: {
    ownerName: string;
    dogName: string;
    when: string;
  }) =>
    [
      `Hola ${input.ownerName} 👋 te recuerdo que el turno de ${input.dogName} 🐶 está confirmado:`,
      `• 📅 ${input.when}`,
      "¡Nos vemos pronto! 🐾",
    ].join("\n\n"),
  askForPhoto: (input: { ownerName: string; dogName: string }) =>
    [
      `Hola ${input.ownerName} 👋`,
      `¿Me mandás una foto reciente de ${input.dogName}? 📸 Nos ayuda a prepararnos para el turno 🐶`,
    ].join("\n\n"),
  proposeNewTime: (input: { ownerName: string }) =>
    [
      `Hola ${input.ownerName} 👋`,
      "Ese horario no me queda 😅 ¿Te sirve [día y hora]? 📅",
    ].join("\n\n"),
  confirmTransportCost: (input: { neighborhood: string; amount?: string }) =>
    `🚗 El traslado desde ${input.neighborhood || "tu barrio"} es de *${input.amount ?? "ARS [monto]"}*, ida y vuelta.`,
  depositForfeited: (input: { ownerName: string; dogName: string }) =>
    [
      `Hola ${input.ownerName} 👋`,
      `Como el turno de ${input.dogName} se canceló sin una reprogramación válida dentro del mismo mes, la seña no se reintegra.`,
      "Cualquier duda, escribinos 🙌",
    ].join("\n\n"),
};
