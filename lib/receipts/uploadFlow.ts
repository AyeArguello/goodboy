import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_RECEIPT_FILES,
  RECEIPT_BUCKET,
  RECEIPT_MIME_TO_EXT,
  RECEIPT_PATH_PATTERN,
  RECEIPT_REFERENCE_MAX_LENGTH,
  isReceiptMime,
  type ReceiptMime,
} from "./constants";
import { checkDeclaredFile, checkStoredContent } from "./fileValidation";
import { hashUploadToken, isWellFormedUploadToken } from "./token";

/**
 * Receipt upload flow, run entirely on the server with the service-role
 * client (never exposed to the browser). The browser uploads the image
 * straight to Storage through a one-off signed URL (so the file never goes
 * through a serverless request body limit), then asks us to finalize: we
 * download the stored object, verify its REAL content, and only then
 * register it against the appointment and consume the link.
 */

export type ReceiptClient = Pick<SupabaseClient, "rpc" | "storage" | "from">;

export type ReceiptErrorCode =
  | "INVALID_LINK"
  | "TOKEN_USED"
  | "TOKEN_EXPIRED"
  | "NOT_AWAITING_DEPOSIT"
  | "TOO_MANY_RECEIPTS"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INVALID_FILE"
  | "INVALID_CONTENT"
  | "STORAGE_ERROR"
  | "SERVER_ERROR";

export type TokenState = "valid" | "used" | "revoked" | "expired" | "closed";

export interface UploadContext {
  dogName: string;
  startsAt: string;
  amountArs: number;
  dueAt: string | null;
  tokenState: TokenState;
  appointmentStatus: string;
  pendingReceipts: number;
  activeReceipts: number;
}

type Failure = { ok: false; code: ReceiptErrorCode; message?: string };

const RATE_WINDOW = "10 minutes";

export function parseReceiptRpcError(
  message: string | undefined,
): ReceiptErrorCode {
  const known: [string, ReceiptErrorCode][] = [
    ["TOKEN_INVALID", "INVALID_LINK"],
    ["TOKEN_USED", "TOKEN_USED"],
    ["TOKEN_EXPIRED", "TOKEN_EXPIRED"],
    ["NOT_AWAITING_DEPOSIT", "NOT_AWAITING_DEPOSIT"],
    ["TOO_MANY_RECEIPTS", "TOO_MANY_RECEIPTS"],
    ["RATE_LIMITED", "RATE_LIMITED"],
    ["VALIDATION_ERROR", "VALIDATION_ERROR"],
  ];
  return (
    known.find(([needle]) => message?.includes(needle))?.[1] ?? "SERVER_ERROR"
  );
}

async function enforceLimit(
  client: ReceiptClient,
  key: string,
  max: number,
): Promise<Failure | null> {
  const { error } = await client.rpc("enforce_rate_limit", {
    p_key: key,
    p_max_per_window: max,
    p_window: RATE_WINDOW,
  });
  if (!error) return null;
  return {
    ok: false,
    code: error.message.includes("RATE_LIMITED")
      ? "RATE_LIMITED"
      : "SERVER_ERROR",
  };
}

interface ContextRow {
  ctx_appointment_id: string;
  ctx_dog_name: string;
  ctx_starts_at: string;
  ctx_status: string;
  ctx_deposit_amount_ars: number | string;
  ctx_deposit_due_at: string | null;
  ctx_token_state: TokenState;
  ctx_pending_receipts: number;
  ctx_active_receipts: number;
}

async function loadContext(
  client: ReceiptClient,
  tokenHash: string,
): Promise<{ ok: true; row: ContextRow } | Failure> {
  const { data, error } = await client.rpc("get_upload_context", {
    p_token_hash: tokenHash,
  });
  if (error) return { ok: false, code: "SERVER_ERROR" };
  const row = (data as ContextRow[] | null)?.[0];
  if (!row) return { ok: false, code: "INVALID_LINK" };
  return { ok: true, row };
}

function stateToFailure(state: TokenState): Failure | null {
  switch (state) {
    case "valid":
      return null;
    case "used":
      return { ok: false, code: "TOKEN_USED" };
    case "expired":
      return { ok: false, code: "TOKEN_EXPIRED" };
    case "closed":
      return { ok: false, code: "NOT_AWAITING_DEPOSIT" };
    default:
      return { ok: false, code: "INVALID_LINK" };
  }
}

// ---------------------------------------------------------------- context

export type UploadContextResult =
  { ok: true; context: UploadContext } | Failure;

export async function getUploadContext(
  client: ReceiptClient,
  input: { token: unknown; clientKey: string },
): Promise<UploadContextResult> {
  if (!isWellFormedUploadToken(input.token)) {
    return { ok: false, code: "INVALID_LINK" };
  }
  const tokenHash = hashUploadToken(input.token);

  const limited =
    (await enforceLimit(client, `upload-ctx:ip:${input.clientKey}`, 30)) ??
    (await enforceLimit(client, `upload-ctx:tok:${tokenHash}`, 30));
  if (limited) return limited;

  const loaded = await loadContext(client, tokenHash);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  return {
    ok: true,
    context: {
      dogName: row.ctx_dog_name,
      startsAt: row.ctx_starts_at,
      amountArs: Number(row.ctx_deposit_amount_ars),
      dueAt: row.ctx_deposit_due_at,
      tokenState: row.ctx_token_state,
      appointmentStatus: row.ctx_status,
      pendingReceipts: row.ctx_pending_receipts,
      activeReceipts: row.ctx_active_receipts,
    },
  };
}

// ---------------------------------------------------------------- prepare

export interface DeclaredFile {
  name: string;
  type: string;
  size: number;
}

export interface PreparedUpload {
  path: string;
  mime: ReceiptMime;
  signedUrl: string;
}

export type PrepareResult = { ok: true; uploads: PreparedUpload[] } | Failure;

export async function prepareUpload(
  client: ReceiptClient,
  input: { token: unknown; clientKey: string; files: DeclaredFile[] },
): Promise<PrepareResult> {
  if (!isWellFormedUploadToken(input.token)) {
    return { ok: false, code: "INVALID_LINK" };
  }
  const tokenHash = hashUploadToken(input.token);

  const limited =
    (await enforceLimit(client, `upload-prep:ip:${input.clientKey}`, 20)) ??
    (await enforceLimit(client, `upload-prep:tok:${tokenHash}`, 10));
  if (limited) return limited;

  const loaded = await loadContext(client, tokenHash);
  if (!loaded.ok) return loaded;
  const blocked = stateToFailure(loaded.row.ctx_token_state);
  if (blocked) return blocked;

  const files = input.files;
  if (
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > MAX_RECEIPT_FILES
  ) {
    return {
      ok: false,
      code: "INVALID_FILE",
      message: "Subí una o dos imágenes del comprobante.",
    };
  }
  const mimes: ReceiptMime[] = [];
  for (const file of files) {
    const check = checkDeclaredFile(file);
    if (!check.ok) {
      return { ok: false, code: "INVALID_FILE", message: check.message };
    }
    mimes.push(check.mime);
  }
  if (loaded.row.ctx_active_receipts + files.length > MAX_RECEIPT_FILES) {
    return { ok: false, code: "TOO_MANY_RECEIPTS" };
  }

  const bucket = client.storage.from(RECEIPT_BUCKET);
  const uploads: PreparedUpload[] = [];
  for (const mime of mimes) {
    const path = `r/${randomUUID()}.${RECEIPT_MIME_TO_EXT[mime]}`;
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) return { ok: false, code: "STORAGE_ERROR" };
    uploads.push({ path, mime, signedUrl: data.signedUrl });
  }
  return { ok: true, uploads };
}

// --------------------------------------------------------------- finalize

export interface UploadedFile {
  path: string;
  mime: string;
}

export type FinalizeResult =
  { ok: true; appointmentId: string; receiptIds: string[] } | Failure;

/** Removes objects this flow uploaded but never registered. Best effort. */
async function discardUnregistered(
  client: ReceiptClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { data } = await client
      .from("payment_receipts")
      .select("storage_path")
      .in("storage_path", paths);
    const registered = new Set(
      ((data as { storage_path: string }[] | null) ?? []).map(
        (r) => r.storage_path,
      ),
    );
    const orphans = paths.filter((p) => !registered.has(p));
    if (orphans.length > 0) {
      await client.storage.from(RECEIPT_BUCKET).remove(orphans);
    }
  } catch (err) {
    console.error("receipt cleanup failed:", err);
  }
}

export async function finalizeUpload(
  client: ReceiptClient,
  input: {
    token: unknown;
    clientKey: string;
    uploads: UploadedFile[];
    reference?: string | null;
  },
): Promise<FinalizeResult> {
  if (!isWellFormedUploadToken(input.token)) {
    return { ok: false, code: "INVALID_LINK" };
  }
  const tokenHash = hashUploadToken(input.token);

  const limited =
    (await enforceLimit(client, `upload-final:ip:${input.clientKey}`, 20)) ??
    (await enforceLimit(client, `upload-final:tok:${tokenHash}`, 10));
  if (limited) return limited;

  const uploads = input.uploads;
  if (
    !Array.isArray(uploads) ||
    uploads.length < 1 ||
    uploads.length > MAX_RECEIPT_FILES
  ) {
    return { ok: false, code: "INVALID_FILE" };
  }
  const paths = uploads.map((u) => u?.path);
  const wellFormed = uploads.every(
    (u) =>
      typeof u?.path === "string" &&
      RECEIPT_PATH_PATTERN.test(u.path) &&
      isReceiptMime(u.mime) &&
      u.path.endsWith(`.${RECEIPT_MIME_TO_EXT[u.mime]}`),
  );
  if (!wellFormed || new Set(paths).size !== paths.length) {
    return { ok: false, code: "INVALID_FILE" };
  }
  const typed = uploads as { path: string; mime: ReceiptMime }[];

  const reference = (input.reference ?? "").trim();
  if (reference.length > RECEIPT_REFERENCE_MAX_LENGTH) {
    await discardUnregistered(client, paths as string[]);
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "La referencia es demasiado larga.",
    };
  }

  const discardAll = () =>
    discardUnregistered(
      client,
      typed.map((u) => u.path),
    );

  const loaded = await loadContext(client, tokenHash);
  if (!loaded.ok) {
    await discardAll();
    return loaded;
  }
  const blocked = stateToFailure(loaded.row.ctx_token_state);
  if (blocked) {
    await discardAll();
    return blocked;
  }

  // Verify the REAL content of every stored object before accepting it.
  const bucket = client.storage.from(RECEIPT_BUCKET);
  const registered: { path: string; mime: ReceiptMime; size: number }[] = [];
  for (const upload of typed) {
    const { data, error } = await bucket.download(upload.path);
    if (error || !data) {
      await discardAll();
      return {
        ok: false,
        code: "INVALID_CONTENT",
        message: "No pudimos leer la imagen. Probá subirla de nuevo.",
      };
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const check = checkStoredContent(bytes, upload.mime);
    if (!check.ok) {
      await discardAll();
      return {
        ok: false,
        code: "INVALID_CONTENT",
        message:
          "El archivo no es una imagen válida o supera los 5 MB. Subí un JPG, PNG o WebP.",
      };
    }
    registered.push({
      path: upload.path,
      mime: upload.mime,
      size: bytes.length,
    });
  }

  const { data, error } = await client.rpc("register_payment_receipts", {
    p_token_hash: tokenHash,
    p_files: registered,
    p_reference: reference || null,
  });
  if (error) {
    await discardAll();
    return { ok: false, code: parseReceiptRpcError(error.message) };
  }
  const row = (
    data as { reg_appointment_id: string; reg_receipt_ids: string[] }[] | null
  )?.[0];
  if (!row) {
    await discardAll();
    return { ok: false, code: "SERVER_ERROR" };
  }
  return {
    ok: true,
    appointmentId: row.reg_appointment_id,
    receiptIds: row.reg_receipt_ids,
  };
}
