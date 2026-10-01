/**
 * Full v2 lifecycle (deposit required to confirm — see docs/assumptions.md §6):
 *
 *   pending_review --approve--> awaiting_deposit --deposit verified--> confirmed
 *        |                           |                                    |
 *        cancelled_by_business   expired (deposit_due_at passed,     reschedule_requested
 *                                 lazy + expire_overdue_deposits())        |
 *                                     |                              confirmed (new slot)
 *                                 cancelled_by_business/client
 *
 *   confirmed --> completed | no_show | cancelled_by_client | cancelled_by_business
 *   any cancellation within cancellationCutoffHours of the slot --> deposit_forfeited
 *     (in addition to / instead of the cancelled_by_* status — see admin RPCs)
 */
export type AppointmentStatus =
  | "pending_review"
  | "awaiting_deposit"
  | "confirmed"
  | "reschedule_requested"
  | "cancelled_by_client"
  | "cancelled_by_business"
  | "deposit_forfeited"
  | "completed"
  | "no_show"
  | "expired";

/** Statuses that occupy a slot — everything else has released it. */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "pending_review",
  "awaiting_deposit",
  "confirmed",
  "reschedule_requested",
];

export type AppointmentEventType =
  | "created"
  | "approved"
  | "rejected"
  | "deposit_recorded"
  | "deposit_reversed"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no_show"
  | "expired"
  | "forfeited"
  | "reverted";

export type SizeBucket = "pequeno" | "mediano" | "grande";
export type CoatState = "corto" | "largo" | "con_nudos" | "no_se";
export type LogisticsMode = "self" | "pickup";
export type PaymentMethod = "cash" | "bank_transfer" | "mercadopago_link";
export type PaymentStatus = "pending" | "verified" | "reversed";

export const SIZE_LABELS: Record<SizeBucket, string> = {
  pequeno: "Pequeño",
  mediano: "Mediano",
  grande: "Grande",
};

export const COAT_LABELS: Record<CoatState, string> = {
  corto: "Corto",
  largo: "Largo",
  con_nudos: "Con nudos",
  no_se: "No sé",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  mercadopago_link: "Link de Mercado Pago",
};

/** The two real service packages — see docs/assumptions.md §1. Not a mix-and-match checklist. */
export type ServicePackageKey = "corto_doble_capa" | "crecimiento_continuo";

export const SERVICE_PACKAGE_LABELS: Record<ServicePackageKey, string> = {
  corto_doble_capa: "Mantos cortos y doble capa",
  crecimiento_continuo: "Mantos de crecimiento continuo",
};

export const SERVICE_PACKAGE_INCLUDES: Record<ServicePackageKey, string[]> = {
  corto_doble_capa: [
    "Baño",
    "Deslanado",
    "Limpieza de oídos",
    "Corte de uñas",
    "Limpieza de zona de pulpejos",
    "Vaciado de glándulas perianales",
    "Terminación final con tijeras",
  ],
  crecimiento_continuo: [
    "Baño",
    "Corte de pelo",
    "Corte higiénico",
    "Corte de uñas",
    "Limpieza y depilado de oídos",
    "Limpieza de zona de pulpejos",
    "Terminación final",
  ],
};

/** Consent keys tracked with the version of their text the customer accepted. */
export const CONSENT_KEYS = [
  "orientative_price",
  "deposit_and_cancellation",
  "privacy",
] as const;
export type ConsentKey = (typeof CONSENT_KEYS)[number];

export interface ConsentRecord {
  key: ConsentKey;
  version: number;
  acceptedAt: string;
}

/** Bumped for v2: consent text now names the ARS 20.000 deposit and the 48h cutoff explicitly. */
export const CONSENT_TEXT_VERSION = 2;

/** Known error codes raised by request_appointment / admin RPCs (see supabase/migrations). */
export type BookingErrorCode =
  | "SLOT_NOT_AVAILABLE"
  | "SLOT_TAKEN"
  | "DAY_FULL"
  | "CODE_GENERATION_FAILED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export function parseBookingErrorCode(
  message: string | undefined,
): BookingErrorCode {
  const known: BookingErrorCode[] = [
    "SLOT_NOT_AVAILABLE",
    "SLOT_TAKEN",
    "DAY_FULL",
    "CODE_GENERATION_FAILED",
    "RATE_LIMITED",
  ];
  return known.find((code) => message?.includes(code)) ?? "UNKNOWN";
}
