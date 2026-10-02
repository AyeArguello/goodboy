import "server-only";
import { getPublicSupabaseClient } from "@/lib/supabase/public";
import { getClientKey } from "@/lib/security/clientKey";
import type {
  CoatState,
  ConsentRecord,
  LogisticsMode,
  ServicePackageKey,
  SizeBucket,
} from "@/lib/domain/appointment";
import { parseBookingErrorCode } from "@/lib/domain/appointment";

export interface BookAppointmentInput {
  slotId: string;
  dogName: string;
  sizeBucket: SizeBucket;
  breed: string | null;
  coatState: CoatState | null;
  servicePackage: ServicePackageKey;
  notes: string | null;
  logisticsMode: LogisticsMode;
  neighborhood: string | null;
  pickupAddress: string | null;
  ownerName: string;
  phoneE164: string;
  email: string | null;
  consents: ConsentRecord[];
}

export type BookAppointmentResult =
  | { ok: true; code: string; appointmentId: string; slotStartsAt: string }
  | { ok: false; errorCode: ReturnType<typeof parseBookingErrorCode> };

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const supabase = getPublicSupabaseClient();
  const clientKey = await getClientKey();

  const { data, error } = await supabase.rpc("request_appointment", {
    p_slot_id: input.slotId,
    p_dog_name: input.dogName,
    p_size_bucket: input.sizeBucket,
    p_breed: input.breed,
    p_coat_state: input.coatState,
    p_service_package: input.servicePackage,
    p_notes: input.notes,
    p_logistics_mode: input.logisticsMode,
    p_neighborhood: input.neighborhood,
    p_pickup_address: input.pickupAddress,
    p_owner_name: input.ownerName,
    p_phone_e164: input.phoneE164,
    p_email: input.email,
    p_consents: input.consents.map((c) => ({
      key: c.key,
      version: c.version,
      accepted_at: c.acceptedAt,
    })),
    p_client_key: clientKey,
  });

  if (error || !data?.[0]) {
    return { ok: false, errorCode: parseBookingErrorCode(error?.message) };
  }

  return {
    ok: true,
    code: data[0].code as string,
    appointmentId: data[0].appointment_id as string,
    slotStartsAt: data[0].slot_starts_at as string,
  };
}

export interface AppointmentStatusResult {
  code: string;
  status: string;
  startsAt: string;
  previousStartsAt: string | null;
  depositAmountArs: number;
  depositDueAt: string | null;
}

export async function lookupAppointmentStatus(
  code: string,
): Promise<AppointmentStatusResult | null> {
  const supabase = getPublicSupabaseClient();
  const clientKey = await getClientKey();

  const { data, error } = await supabase.rpc("get_appointment_status", {
    p_code: code,
    p_client_key: clientKey,
  });

  if (error || !data?.[0]) return null;

  return {
    code: data[0].code as string,
    status: data[0].status as string,
    startsAt: data[0].starts_at as string,
    previousStartsAt: (data[0].previous_starts_at as string | null) ?? null,
    depositAmountArs: Number(data[0].deposit_amount_ars),
    depositDueAt: (data[0].deposit_due_at as string | null) ?? null,
  };
}

export type ReceiptState =
  "none" | "pending_verification" | "verified" | "rejected";

/** Whether a receipt is waiting / verified / rejected for this code — nothing personal. */
export async function lookupReceiptState(code: string): Promise<ReceiptState> {
  const supabase = getPublicSupabaseClient();
  const clientKey = await getClientKey();

  const { data, error } = await supabase.rpc("get_appointment_receipt_status", {
    p_code: code,
    p_client_key: clientKey,
  });
  const state = data?.[0]?.receipt_state as string | undefined;
  if (error || !state) return "none";
  return state === "pending_verification" ||
    state === "verified" ||
    state === "rejected"
    ? state
    : "none";
}
