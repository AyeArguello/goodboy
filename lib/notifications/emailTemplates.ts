/**
 * Plain-text email bodies. Pure functions: no I/O, no secrets. They only
 * state what actually happened — never that a WhatsApp was sent, that a
 * payment was detected automatically, or that anything is paid by card.
 */

export interface BaseEmailData {
  ownerName: string;
  dogName: string;
  code: string;
  /** e.g. "jueves, 24 de septiembre · 09:00" */
  whenLabel: string;
}

export interface BusinessFooter {
  businessName: string;
  address: string;
  /** Manual wa.me link (the person taps send themselves). */
  whatsappUrl: string;
}

export interface TransferDetails {
  alias: string | null;
  holder: string | null;
  cbu: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function formatArs(amount: number): string {
  return `ARS ${amount.toLocaleString("es-AR")}`;
}

function footer(f: BusinessFooter): string[] {
  return [
    "",
    `${f.businessName} · ${f.address}`,
    `¿Dudas? Respondé este correo o escribinos por WhatsApp: ${f.whatsappUrl}`,
  ];
}

function body(lines: string[], f: BusinessFooter): string {
  return [...lines, ...footer(f)].join("\n");
}

export function transferLines(t: TransferDetails): string[] {
  const lines: string[] = [];
  if (t.alias) lines.push(`  Alias: ${t.alias}`);
  if (t.holder) lines.push(`  Titular: ${t.holder}`);
  if (t.cbu) lines.push(`  CBU/CVU: ${t.cbu}`);
  return lines;
}

export function renderRequestReceived(
  d: BaseEmailData & { statusUrl: string },
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Recibimos tu solicitud de turno para ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Recibimos tu solicitud de turno para ${d.dogName}: ${d.whenLabel}.`,
        "Todavía no es un turno confirmado: revisamos cada solicitud a mano.",
        "Si la aprobamos, te escribimos por este mismo medio con los datos para pagar la seña por transferencia.",
        "",
        `Tu código de solicitud: ${d.code}`,
        `Podés consultar el estado en ${d.statusUrl} (te pedimos el código; no mostramos datos personales).`,
      ],
      f,
    ),
  };
}

export function renderOwnerNewRequest(
  d: BaseEmailData & { panelUrl: string },
): RenderedEmail {
  return {
    subject: `Nueva solicitud · ${d.dogName} (${d.code})`,
    text: [
      `${d.ownerName} pidió un turno para ${d.dogName}.`,
      `Turno: ${d.whenLabel}`,
      `Código: ${d.code}`,
      "",
      `Revisala en el panel, en Solicitudes: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export function renderRequestApproved(
  d: BaseEmailData & {
    amountArs: number;
    dueLabel: string;
    transfer: TransferDetails;
    cancellationPolicy: string;
    uploadUrl: string;
  },
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Aprobamos tu turno para ${d.dogName}: falta la seña para confirmarlo`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Aprobamos tu solicitud de turno para ${d.dogName}: ${d.whenLabel}.`,
        `Para confirmarlo necesitamos una seña de ${formatArs(d.amountArs)} (se descuenta del total del servicio), por transferencia bancaria, antes del ${d.dueLabel}.`,
        "",
        "Datos para transferir:",
        ...transferLines(d.transfer),
        "",
        "Cuando transfieras, subí una foto o captura del comprobante en este enlace seguro. Es personal: no lo compartas.",
        d.uploadUrl,
        "",
        "Verificamos el comprobante a mano. El turno queda confirmado recién cuando lo verificamos y te avisamos por email.",
        "Si no recibimos un comprobante válido antes del plazo, el horario se libera.",
        "",
        `Cancelación: ${d.cancellationPolicy}`,
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export function renderReceiptReceived(
  d: BaseEmailData,
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Recibimos tu comprobante · ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Recibimos el comprobante de la seña del turno de ${d.dogName} (${d.whenLabel}).`,
        "Comprobante recibido, pendiente de verificación: todavía no es un turno confirmado.",
        "Lo revisamos a mano y te avisamos por email apenas lo verifiquemos.",
        "",
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export function renderOwnerReceiptReceived(
  d: BaseEmailData & { panelUrl: string },
): RenderedEmail {
  return {
    subject: `Comprobante para verificar · ${d.dogName} (${d.code})`,
    text: [
      `${d.ownerName} subió el comprobante de la seña de ${d.dogName}.`,
      `Turno: ${d.whenLabel}`,
      `Código: ${d.code}`,
      "",
      `Verificalo en el panel: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export function renderReceiptRejected(
  d: BaseEmailData & {
    reason: string;
    dueLabel: string | null;
    uploadUrl: string | null;
  },
  f: BusinessFooter,
): RenderedEmail {
  const next = d.uploadUrl
    ? [
        `Podés subir un comprobante nuevo hasta el ${d.dueLabel ?? "plazo indicado"} desde este enlace seguro (es personal, no lo compartas):`,
        d.uploadUrl,
      ]
    : [
        "El plazo para subir un comprobante ya venció. Escribinos y vemos cómo seguir.",
      ];
  return {
    subject: `No pudimos verificar tu comprobante · ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `No pudimos verificar el comprobante de la seña del turno de ${d.dogName} (${d.whenLabel}).`,
        `Motivo: ${d.reason}`,
        "",
        ...next,
        "",
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export function renderAppointmentConfirmed(
  d: BaseEmailData & {
    amountArs: number;
    cancellationPolicy: string;
    address: string;
    pickup: boolean;
  },
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Turno confirmado para ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Verificamos tu seña de ${formatArs(d.amountArs)}: el turno de ${d.dogName} quedó confirmado.`,
        `Cuándo: ${d.whenLabel}`,
        d.pickup
          ? "Cómo: pasamos a buscarlo (el costo del traslado se confirma según tu barrio)."
          : `Dónde: ${d.address}`,
        "",
        "El precio final se confirma al recibir y evaluar a tu perro; la seña se descuenta del total.",
        `Cancelación: ${d.cancellationPolicy}`,
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export type CancellationKind = "client" | "business" | "declined";

export function renderAppointmentCancelled(
  d: BaseEmailData & {
    kind: CancellationKind;
    depositForfeited: boolean;
    cancellationPolicy: string;
  },
  f: BusinessFooter,
): RenderedEmail {
  const intro =
    d.kind === "declined"
      ? `No pudimos tomar tu solicitud de turno para ${d.dogName} (${d.whenLabel}).`
      : d.kind === "business"
        ? `Tuvimos que cancelar el turno de ${d.dogName} (${d.whenLabel}). Lamentamos el inconveniente.`
        : `Registramos la cancelación del turno de ${d.dogName} (${d.whenLabel}).`;
  const money = d.depositForfeited
    ? `Como se canceló con poca anticipación, la seña no se reintegra. ${d.cancellationPolicy}`
    : d.kind === "business"
      ? "Si ya habías transferido la seña, te avisamos por separado cuando registremos la devolución."
      : "";
  return {
    subject:
      d.kind === "declined"
        ? `Sobre tu solicitud de turno para ${d.dogName}`
        : `Turno cancelado · ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        intro,
        ...(money ? ["", money] : []),
        "",
        "Cuando quieras, podés pedir un turno nuevo desde nuestra web.",
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export function renderAppointmentRescheduled(
  d: BaseEmailData & { previousWhenLabel: string | null },
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Tu turno para ${d.dogName} fue reprogramado`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Reprogramamos el turno de ${d.dogName}.`,
        `Nuevo horario: ${d.whenLabel}`,
        ...(d.previousWhenLabel ? [`Antes: ${d.previousWhenLabel}`] : []),
        "La seña que ya pagaste sigue valiendo para el nuevo horario.",
        "Si no te sirve, avisanos respondiendo este correo.",
        "",
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}

export function renderRefundRecorded(
  d: BaseEmailData & { amountArs: number; reference: string | null },
  f: BusinessFooter,
): RenderedEmail {
  return {
    subject: `Registramos la devolución de tu seña · ${d.dogName}`,
    text: body(
      [
        `Hola ${d.ownerName},`,
        "",
        `Registramos la devolución de ${formatArs(d.amountArs)} de la seña del turno de ${d.dogName}.`,
        ...(d.reference ? [`Referencia de la operación: ${d.reference}`] : []),
        "Según tu banco, puede demorar en verse reflejada.",
        "",
        `Código de solicitud: ${d.code}`,
      ],
      f,
    ),
  };
}
