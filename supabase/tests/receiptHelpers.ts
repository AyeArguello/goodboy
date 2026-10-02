import {
  finalizeUpload,
  prepareUpload,
  type FinalizeResult,
  type PrepareResult,
} from "@/lib/receipts/uploadFlow";
import { generateUploadToken, hashUploadToken } from "@/lib/receipts/token";
import {
  RECEIPTS_BUCKET,
  anonClient,
  createFutureSlot,
  serviceClient,
  validAppointmentPayload,
  type createTestAdminClient,
} from "./helpers";

export type AdminClient = Awaited<ReturnType<typeof createTestAdminClient>>;

/** Same value for every call: resetTestData() clears the rate-limit table before each test. */
export const CLIENT_KEY = "integration-test-client";

/** A tiny buffer that starts with the real JPEG magic bytes (all the server checks). */
export const JPEG = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01,
  ...Array.from({ length: 2048 }, (_, i) => i % 251),
]);
export const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...Array.from({ length: 2048 }, (_, i) => i % 241),
]);
export const PDF = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n",
);

export async function awaitingDeposit(admin: AdminClient) {
  const slotId = await createFutureSlot(48);
  const { data, error } = await anonClient().rpc(
    "request_appointment",
    validAppointmentPayload(slotId),
  );
  if (error) throw error;
  const appointmentId = data![0].appointment_id as string;
  const code = data![0].code as string;
  const { error: approveError } = await admin.rpc("admin_approve_request", {
    p_appointment_id: appointmentId,
  });
  if (approveError) throw approveError;
  return { appointmentId, slotId, code };
}

/** Issues an upload link exactly like the app does: random token, only its hash reaches the database. */
export async function issueToken(
  admin: AdminClient,
  appointmentId: string,
): Promise<string> {
  const token = generateUploadToken();
  const { error } = await admin.rpc("admin_issue_upload_token", {
    p_appointment_id: appointmentId,
    p_token_hash: hashUploadToken(token),
  });
  if (error) throw error;
  return token;
}

export interface TestFile {
  name: string;
  /** Declared MIME type. */
  type: string;
  bytes: Uint8Array;
  /** What is actually sent to Storage, when it differs from the declared type. */
  uploadType?: string;
}

export const jpegFile = (name = "pago.jpg"): TestFile => ({
  name,
  type: "image/jpeg",
  bytes: JPEG,
});

/** prepare (server) + direct upload to the signed URL (what the browser does). */
export async function prepareAndUpload(
  token: string,
  files: TestFile[] = [jpegFile()],
): Promise<{ prep: PrepareResult }> {
  const svc = serviceClient();
  const prep = await prepareUpload(svc, {
    token,
    clientKey: CLIENT_KEY,
    files: files.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.bytes.length,
    })),
  });
  if (!prep.ok) return { prep };

  for (let i = 0; i < files.length; i++) {
    const signed = prep.uploads[i]!;
    const storageToken = new URL(signed.signedUrl).searchParams.get("token")!;
    const contentType = files[i]!.uploadType ?? files[i]!.type;
    const { error } = await svc.storage
      .from(RECEIPTS_BUCKET)
      .uploadToSignedUrl(
        signed.path,
        storageToken,
        new Blob([files[i]!.bytes as BlobPart], { type: contentType }),
        { contentType },
      );
    if (error) throw error;
  }
  return { prep };
}

/** The whole client journey: prepare, upload, finalize. */
export async function submitReceipt(
  token: string,
  files: TestFile[] = [jpegFile()],
  reference = "OP-1234",
): Promise<FinalizeResult | Extract<PrepareResult, { ok: false }>> {
  const { prep } = await prepareAndUpload(token, files);
  if (!prep.ok) return prep;
  return finalizeUpload(serviceClient(), {
    token,
    clientKey: CLIENT_KEY,
    uploads: prep.uploads.map((u) => ({ path: u.path, mime: u.mime })),
    reference,
  });
}

export async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data, error } = await serviceClient()
    .storage.from(RECEIPTS_BUCKET)
    .list(path.slice(0, slash), { limit: 100, search: name });
  if (error) throw error;
  return (data ?? []).some((item) => item.name === name);
}

export async function receiptsOf(appointmentId: string) {
  const { data, error } = await serviceClient()
    .from("payment_receipts")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("uploaded_at");
  if (error) throw error;
  return data ?? [];
}
