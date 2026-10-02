"use server";

import { z } from "zod";
import { bookAppointment } from "@/lib/data/appointments";
import { normalizePhoneAr } from "@/lib/domain/phone";
import { getNotifier } from "@/lib/notifications/dispatch";
import { CONSENT_KEYS, CONSENT_TEXT_VERSION } from "@/lib/domain/appointment";

const bookingSchema = z
  .object({
    slotId: z.string().uuid("Elegí un horario para continuar."),
    dogName: z.string().trim().min(1, "Escribí el nombre de tu perro."),
    sizeBucket: z.enum(["pequeno", "mediano", "grande"], {
      message: "Elegí un tamaño aproximado.",
    }),
    breed: z.string().trim().optional(),
    coatState: z.enum(["corto", "largo", "con_nudos", "no_se"]).optional(),
    servicePackage: z.enum(["corto_doble_capa", "crecimiento_continuo"], {
      message: "Elegí el servicio según el manto de tu perro.",
    }),
    notes: z.string().trim().optional(),
    logisticsMode: z.enum(["self", "pickup"], { message: "Elegí una opción." }),
    neighborhood: z.string().trim().optional(),
    pickupAddress: z.string().trim().optional(),
    ownerName: z.string().trim().min(1, "Escribí tu nombre."),
    phone: z.string().trim(),
    email: z
      .string()
      .trim()
      .min(1, "Escribí tu correo: ahí te mandamos las novedades de tu turno.")
      .email("Revisá el correo: parece que le falta algo.")
      .max(254, "Correo inválido."),
    consentPrice: z.boolean(),
    consentDeposit: z.boolean(),
    consentPrivacy: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (!val.consentPrice || !val.consentDeposit || !val.consentPrivacy) {
      ctx.addIssue({
        code: "custom",
        path: ["consentPrice"],
        message:
          "Para enviar la solicitud necesitamos que aceptes los tres puntos.",
      });
    }
    if (val.logisticsMode === "pickup") {
      if (!val.neighborhood) {
        ctx.addIssue({
          code: "custom",
          path: ["neighborhood"],
          message: "Indicá tu barrio para calcular el traslado.",
        });
      }
      if (!val.pickupAddress) {
        ctx.addIssue({
          code: "custom",
          path: ["pickupAddress"],
          message: "Escribí la dirección donde lo buscamos.",
        });
      }
    }
    const phone = normalizePhoneAr(val.phone);
    if (!phone.valid) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message:
          "Revisá el número: necesitamos código de área y número (10 dígitos).",
      });
    }
  });

export type BookingFormInput = z.input<typeof bookingSchema>;

export type BookingActionResult =
  | { ok: true; code: string }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof BookingFormInput, string>>;
      formError?: string;
    };

export async function submitBookingAction(
  input: BookingFormInput,
): Promise<BookingActionResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof BookingFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof BookingFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const v = parsed.data;
  const phone = normalizePhoneAr(v.phone);
  const now = new Date().toISOString();

  const result = await bookAppointment({
    slotId: v.slotId,
    dogName: v.dogName,
    sizeBucket: v.sizeBucket,
    breed: v.breed || null,
    coatState: v.coatState ?? null,
    servicePackage: v.servicePackage,
    notes: v.notes || null,
    logisticsMode: v.logisticsMode,
    neighborhood:
      v.logisticsMode === "pickup" ? (v.neighborhood ?? null) : null,
    pickupAddress:
      v.logisticsMode === "pickup" ? (v.pickupAddress ?? null) : null,
    ownerName: v.ownerName,
    phoneE164: phone.e164,
    email: v.email,
    consents: CONSENT_KEYS.map((key) => ({
      key,
      version: CONSENT_TEXT_VERSION,
      acceptedAt: now,
    })),
  });

  if (!result.ok) {
    if (
      result.errorCode === "SLOT_TAKEN" ||
      result.errorCode === "SLOT_NOT_AVAILABLE"
    ) {
      return {
        ok: false,
        fieldErrors: {},
        formError: "SLOT_TAKEN",
      };
    }
    if (result.errorCode === "DAY_FULL") {
      return { ok: false, fieldErrors: {}, formError: "DAY_FULL" };
    }
    return { ok: false, fieldErrors: {}, formError: "NETWORK" };
  }

  // Best-effort: the booking already succeeded, so an email problem must
  // never turn into a customer-facing error (the outbox records any failure
  // so it can be retried without duplicating).
  try {
    await getNotifier().requestReceived(result.appointmentId);
  } catch (err) {
    console.error("Failed to dispatch request notifications:", err);
  }

  return { ok: true, code: result.code };
}
