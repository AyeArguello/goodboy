"use server";

import { z } from "zod";
import {
  lookupAppointmentStatus,
  lookupReceiptState,
  type ReceiptState,
} from "@/lib/data/appointments";
import { isValidAppointmentCodeFormat } from "@/lib/domain/code";

const codeSchema = z.string().trim().min(1, "Ingresá tu código de solicitud.");

export type CheckStatusResult =
  | {
      ok: true;
      code: string;
      status: string;
      startsAt: string;
      previousStartsAt: string | null;
      depositAmountArs: number;
      depositDueAt: string | null;
      receiptState: ReceiptState;
    }
  | { ok: false; error: string };

/**
 * Looked up by code via a POST form — never a GET/URL param — so the
 * status page never carries anything identifying in the address bar.
 */
export async function checkStatusAction(
  rawCode: string,
): Promise<CheckStatusResult> {
  const parsed = codeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }
  if (!isValidAppointmentCodeFormat(parsed.data)) {
    return { ok: false, error: "Ese código no tiene un formato válido." };
  }

  const result = await lookupAppointmentStatus(parsed.data);
  if (!result) {
    return { ok: false, error: "No encontramos una solicitud con ese código." };
  }

  const receiptState =
    result.status === "awaiting_deposit"
      ? await lookupReceiptState(parsed.data)
      : "none";

  return {
    ok: true,
    code: result.code,
    status: result.status,
    startsAt: result.startsAt,
    previousStartsAt: result.previousStartsAt,
    depositAmountArs: result.depositAmountArs,
    depositDueAt: result.depositDueAt,
    receiptState,
  };
}
