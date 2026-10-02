"use server";

import { z } from "zod";
import { formatDayLabel, formatTimeLabel } from "@/lib/domain/datetime";
import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";
import { getNotifier } from "@/lib/notifications/dispatch";
import {
  finalizeUpload,
  getUploadContext,
  prepareUpload,
  type ReceiptErrorCode,
  type TokenState,
} from "@/lib/receipts/uploadFlow";
import { getClientKey } from "@/lib/security/clientKey";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Public endpoints behind the secure receipt-upload link. Anyone can POST to
 * a Server Action, so none of this trusts the caller: access is proven only
 * by the 256-bit link token, every call is rate limited, and the service-role
 * client never leaves the server.
 */

const label = (iso: string) => {
  const d = new Date(iso);
  return `${formatDayLabel(d)} · ${formatTimeLabel(d)}`;
};

export type ContextActionResult =
  | {
      ok: true;
      dogName: string;
      whenLabel: string;
      amountArs: number;
      dueLabel: string | null;
      state: TokenState;
      appointmentStatus: string;
      pendingReceipts: number;
      remainingFiles: number;
      transfer: {
        alias: string | null;
        holder: string | null;
        cbu: string | null;
      };
    }
  | { ok: false; code: ReceiptErrorCode };

const tokenSchema = z.string().max(200);

export async function getUploadContextAction(
  token: string,
): Promise<ContextActionResult> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, code: "INVALID_LINK" };

  const result = await getUploadContext(getServiceSupabaseClient(), {
    token: parsed.data,
    clientKey: await getClientKey(),
  });
  if (!result.ok) return { ok: false, code: result.code };

  const c = result.context;
  const env = getServerEnv();
  return {
    ok: true,
    dogName: c.dogName,
    whenLabel: label(c.startsAt),
    amountArs: c.amountArs,
    dueLabel: c.dueAt ? label(c.dueAt) : null,
    state: c.tokenState,
    appointmentStatus: c.appointmentStatus,
    pendingReceipts: c.pendingReceipts,
    remainingFiles: Math.max(0, 2 - c.activeReceipts),
    transfer: {
      alias: env.DEPOSIT_TRANSFER_ALIAS ?? null,
      holder: env.DEPOSIT_TRANSFER_HOLDER ?? null,
      cbu: env.DEPOSIT_TRANSFER_CBU ?? null,
    },
  };
}

const prepareSchema = z.object({
  token: tokenSchema,
  files: z
    .array(
      z.object({
        name: z.string().max(255),
        type: z.string().max(100),
        size: z.number().int(),
      }),
    )
    .max(5),
});

export type PrepareActionResult =
  | {
      ok: true;
      apikey: string;
      uploads: { path: string; mime: string; signedUrl: string }[];
    }
  | { ok: false; code: ReceiptErrorCode; message?: string };

export async function prepareReceiptUploadAction(input: {
  token: string;
  files: { name: string; type: string; size: number }[];
}): Promise<PrepareActionResult> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_FILE" };

  const result = await prepareUpload(getServiceSupabaseClient(), {
    token: parsed.data.token,
    files: parsed.data.files,
    clientKey: await getClientKey(),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    // The anon key is public by design (it is shipped to every browser); the
    // signed URL, not this header, is what authorizes the single upload.
    apikey: getPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    uploads: result.uploads,
  };
}

const finalizeSchema = z.object({
  token: tokenSchema,
  uploads: z
    .array(z.object({ path: z.string().max(200), mime: z.string().max(100) }))
    .max(5),
  reference: z.string().max(200).optional(),
});

export type FinalizeActionResult =
  { ok: true } | { ok: false; code: ReceiptErrorCode; message?: string };

export async function finalizeReceiptUploadAction(input: {
  token: string;
  uploads: { path: string; mime: string }[];
  reference?: string;
}): Promise<FinalizeActionResult> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_FILE" };

  const result = await finalizeUpload(getServiceSupabaseClient(), {
    token: parsed.data.token,
    uploads: parsed.data.uploads,
    reference: parsed.data.reference ?? null,
    clientKey: await getClientKey(),
  });
  if (!result.ok) return result;

  // The receipt is already registered. A failed email must never undo that
  // or show the client an error — the outbox records it for a retry.
  try {
    await getNotifier().receiptReceived(result.appointmentId);
  } catch (err) {
    console.error("Failed to dispatch receipt notifications:", err);
  }
  return { ok: true };
}
