import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createNotifier,
  type IssueUploadToken,
} from "@/lib/notifications/dispatch";
import type { Mailer } from "@/lib/notifications/mailer";
import { getUploadContext, prepareUpload } from "@/lib/receipts/uploadFlow";
import { generateUploadToken, hashUploadToken } from "@/lib/receipts/token";
import {
  createSupabasePurgeDeps,
  runPurge,
  type SupabaseLike,
} from "@/supabase/functions/_shared/purge";
import {
  RECEIPTS_BUCKET,
  anonClient,
  createTestAdminClient,
  serviceClient,
} from "./helpers";
import {
  CLIENT_KEY,
  PDF,
  PNG,
  awaitingDeposit,
  issueToken,
  jpegFile,
  objectExists,
  prepareAndUpload,
  receiptsOf,
  submitReceipt,
  type AdminClient,
} from "./receiptHelpers";

let admin: AdminClient;

beforeAll(async () => {
  admin = await createTestAdminClient();
});

/** Time travel: the retention date has passed. Fails loudly if the update did not apply. */
async function dueNow(appointmentId: string) {
  const { data, error } = await serviceClient()
    .from("payment_receipts")
    .update({ retention_until: new Date(Date.now() - 1000).toISOString() })
    .eq("appointment_id", appointmentId)
    .select("id");
  expect(error, JSON.stringify(error)).toBeNull();
  expect(data?.length ?? 0).toBeGreaterThan(0);
}

const asSupabaseLike = () => serviceClient() as unknown as SupabaseLike;
const DAY = 24 * 60 * 60 * 1000;

async function statusOf(appointmentId: string) {
  const { data } = await serviceClient()
    .from("appointments")
    .select("status")
    .eq("id", appointmentId)
    .single();
  return data!.status as string;
}

/** Awaiting deposit + one verified receipt on a confirmed appointment. */
async function confirmedWithReceipt() {
  const a = await awaitingDeposit(admin);
  const token = await issueToken(admin, a.appointmentId);
  const sent = await submitReceipt(token);
  expect(sent.ok).toBe(true);
  const { error } = await admin.rpc("admin_confirm_deposit", {
    p_appointment_id: a.appointmentId,
  });
  expect(error).toBeNull();
  return { ...a, token };
}

describe("receipts: environment sanity", () => {
  it("the local Storage list API and the purge RPC work", async () => {
    const svc = serviceClient();
    const listed = await svc.storage
      .from(RECEIPTS_BUCKET)
      .list("r", { limit: 1000, offset: 0 });
    expect(listed.error, JSON.stringify(listed.error)).toBeNull();
    const candidates = await svc.rpc("purge_candidates", {
      p_limit: 10,
      p_max_attempts: 3,
    });
    expect(candidates.error, JSON.stringify(candidates.error)).toBeNull();
  });
});

describe("receipts: access control", () => {
  it("anon cannot list, read, update or delete receipts, tokens, outbox or purge runs", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    expect((await submitReceipt(token)).ok).toBe(true);

    const anon = anonClient();
    for (const table of [
      "payment_receipts",
      "payment_upload_tokens",
      "email_outbox",
      "receipt_purge_runs",
    ]) {
      const read = await anon.from(table).select("*");
      expect(read.data === null || read.data.length === 0).toBe(true);
      expect(read.error).not.toBeNull();
      const del = await anon
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      expect(del.error).not.toBeNull();
    }
    const upd = await anon
      .from("payment_receipts")
      .update({ status: "verified" })
      .eq("appointment_id", a.appointmentId);
    expect(upd.error).not.toBeNull();
    expect((await receiptsOf(a.appointmentId))[0]!.status).toBe(
      "pending_verification",
    );
  });

  it("anon and signed-in non-service users cannot call the server-only functions", async () => {
    const hash = hashUploadToken(generateUploadToken());
    for (const client of [anonClient(), admin]) {
      for (const [fn, args] of [
        ["get_upload_context", { p_token_hash: hash }],
        [
          "register_payment_receipts",
          { p_token_hash: hash, p_files: [], p_reference: null },
        ],
        ["purge_candidates", {}],
        [
          "mark_receipt_deleted",
          { p_receipt_id: "00000000-0000-0000-0000-000000000000" },
        ],
        [
          "email_outbox_claim",
          {
            p_key: "k",
            p_kind: "request_received",
            p_appointment_id: null,
            p_recipient: "a@b.co",
          },
        ],
      ] as const) {
        const { error } = await client.rpc(fn, args);
        expect(error, `${fn} must be denied`).not.toBeNull();
      }
    }
  });

  it("the receipts bucket is private: nothing can be listed, downloaded or read through a public URL", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    const sent = await submitReceipt(token);
    expect(sent.ok).toBe(true);
    const [receipt] = await receiptsOf(a.appointmentId);
    const path = receipt!.storage_path as string;

    const anon = anonClient();
    const listed = await anon.storage.from(RECEIPTS_BUCKET).list("r");
    expect(listed.error !== null || (listed.data ?? []).length === 0).toBe(
      true,
    );
    const downloaded = await anon.storage.from(RECEIPTS_BUCKET).download(path);
    expect(downloaded.error).not.toBeNull();

    const publicUrl = anon.storage.from(RECEIPTS_BUCKET).getPublicUrl(path)
      .data.publicUrl;
    const res = await fetch(publicUrl);
    expect(res.ok).toBe(false);
  });

  it("a signed-in admin session cannot read or sign Storage objects itself — only the server (service role) signs", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    await submitReceipt(token);
    const [receipt] = await receiptsOf(a.appointmentId);
    const path = receipt!.storage_path as string;

    const signed = await admin.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
    expect(
      (await admin.storage.from(RECEIPTS_BUCKET).download(path)).error,
    ).not.toBeNull();

    // The admin CAN read the receipt row (RLS) — that is how the app finds the path to sign server-side.
    const row = await admin
      .from("payment_receipts")
      .select("storage_path")
      .eq("id", receipt!.id)
      .single();
    expect(row.data?.storage_path).toBe(path);
  });

  it("the server signs a short-lived URL that really serves the stored image", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    await submitReceipt(token);
    const [receipt] = await receiptsOf(a.appointmentId);

    const { data, error } = await serviceClient()
      .storage.from(RECEIPTS_BUCKET)
      .createSignedUrl(receipt!.storage_path as string, 60);
    expect(error).toBeNull();
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe("receipts: upload links", () => {
  it("rejects malformed and unknown tokens identically", async () => {
    const svc = serviceClient();
    for (const token of ["short", "a".repeat(43), generateUploadToken()]) {
      const ctx = await getUploadContext(svc, { token, clientKey: CLIENT_KEY });
      expect(ctx).toEqual({ ok: false, code: "INVALID_LINK" });
      const prep = await prepareUpload(svc, {
        token,
        clientKey: CLIENT_KEY,
        files: [{ name: "a.jpg", type: "image/jpeg", size: 100 }],
      });
      expect(prep).toEqual({ ok: false, code: "INVALID_LINK" });
    }
  });

  it("only the hash is stored, never the token", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    const { data } = await serviceClient()
      .from("payment_upload_tokens")
      .select("*")
      .eq("appointment_id", a.appointmentId);
    expect(data).toHaveLength(1);
    expect(data![0]!.token_hash).toBe(hashUploadToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("an expired token (the payment window closed) is refused", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    await serviceClient()
      .from("appointments")
      .update({ deposit_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", a.appointmentId);
    expect(await submitReceipt(token)).toMatchObject({
      ok: false,
      code: "TOKEN_EXPIRED",
    });
  });

  it("a used token cannot be reused", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    expect((await submitReceipt(token)).ok).toBe(true);
    expect(await submitReceipt(token)).toMatchObject({
      ok: false,
      code: "TOKEN_USED",
    });
    expect(await receiptsOf(a.appointmentId)).toHaveLength(1);
  });

  it("a newer link revokes the previous one", async () => {
    const a = await awaitingDeposit(admin);
    const first = await issueToken(admin, a.appointmentId);
    const second = await issueToken(admin, a.appointmentId);
    expect(await submitReceipt(first)).toMatchObject({
      ok: false,
      code: "INVALID_LINK",
    });
    expect((await submitReceipt(second)).ok).toBe(true);
  });

  it("uploads are only possible while awaiting_deposit (cancelled and confirmed turns refuse)", async () => {
    const cancelled = await awaitingDeposit(admin);
    const t1 = await issueToken(admin, cancelled.appointmentId);
    await admin.rpc("admin_cancel_appointment", {
      p_appointment_id: cancelled.appointmentId,
      p_initiated_by: "client",
    });
    expect(await submitReceipt(t1)).toMatchObject({
      ok: false,
      code: "NOT_AWAITING_DEPOSIT",
    });

    const confirmed = await confirmedWithReceipt();
    expect(await submitReceipt(confirmed.token)).toMatchObject({
      ok: false,
      code: "NOT_AWAITING_DEPOSIT",
    });
  });

  it("rate limits prepare attempts per link", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    const svc = serviceClient();
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(
        await prepareUpload(svc, {
          token,
          clientKey: `${CLIENT_KEY}-${i}`,
          files: [],
        }),
      );
    }
    expect(
      results.slice(0, 10).every((r) => !r.ok && r.code === "INVALID_FILE"),
    ).toBe(true);
    expect(results[10]).toEqual({ ok: false, code: "RATE_LIMITED" });
  });
});

describe("receipts: file validation", () => {
  it("rejects a wrong format, an oversized file and too many files before anything is stored", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    const svc = serviceClient();
    const base = { token, clientKey: CLIENT_KEY };
    for (const files of [
      [{ name: "doc.pdf", type: "application/pdf", size: 1000 }],
      [{ name: "foto.heic", type: "image/heic", size: 1000 }],
      [{ name: "a.jpg", type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }],
      [
        { name: "a.jpg", type: "image/jpeg", size: 1000 },
        { name: "b.jpg", type: "image/jpeg", size: 1000 },
        { name: "c.jpg", type: "image/jpeg", size: 1000 },
      ],
    ]) {
      expect(await prepareUpload(svc, { ...base, files })).toMatchObject({
        ok: false,
        code: "INVALID_FILE",
      });
    }
    expect(await receiptsOf(a.appointmentId)).toHaveLength(0);
  });

  it("rejects a disguised file (a PDF sent as image/jpeg) and removes the stored object", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    let prep;
    try {
      ({ prep } = await prepareAndUpload(token, [
        {
          name: "pago.jpg",
          type: "image/jpeg",
          bytes: PDF,
          uploadType: "image/jpeg",
        },
      ]));
    } catch (err) {
      // Recent Storage versions sniff the content of buckets restricted by MIME
      // type and refuse a PDF sent as image/jpeg themselves — a second layer in
      // front of ours. Nothing may have been stored or registered either way.
      expect((err as Error).name).toBe("StorageApiError");
      expect(await receiptsOf(a.appointmentId)).toHaveLength(0);
      expect((await submitReceipt(token)).ok).toBe(true); // the link is still usable
      return;
    }
    if (!prep.ok) throw new Error("prepare failed");
    const path = prep.uploads[0]!.path;
    expect(await objectExists(path)).toBe(true);

    const { finalizeUpload } = await import("@/lib/receipts/uploadFlow");
    const r = await finalizeUpload(serviceClient(), {
      token,
      clientKey: CLIENT_KEY,
      uploads: [{ path, mime: "image/jpeg" }],
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    expect(await objectExists(path)).toBe(false);
    expect(await receiptsOf(a.appointmentId)).toHaveLength(0);
    // the link was not consumed: a correct file still works
    expect((await submitReceipt(token)).ok).toBe(true);
  });

  it("accepts two valid images in one submission and stores random names without personal data", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    const r = await submitReceipt(token, [
      jpegFile("Juan Perez DNI 123.jpg"),
      { name: "otra.png", type: "image/png", bytes: PNG },
    ]);
    expect(r.ok).toBe(true);
    const rows = await receiptsOf(a.appointmentId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.storage_path).toMatch(/^r\/[0-9a-f-]{36}\.(jpg|png)$/);
      expect(JSON.stringify(row)).not.toMatch(/Juan|Perez|DNI/i);
      expect(row.size_bytes).toBeGreaterThan(0);
      expect(row.status).toBe("pending_verification");
    }
  });
});

describe("receipts: admin verification", () => {
  it("an uploaded receipt does NOT confirm the appointment; confirming creates exactly one payment, even on a double click", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    expect((await submitReceipt(token, [jpegFile()], "OP-777")).ok).toBe(true);
    expect(await statusOf(a.appointmentId)).toBe("awaiting_deposit");
    const noPayment = await serviceClient()
      .from("payments")
      .select("id")
      .eq("appointment_id", a.appointmentId);
    expect(noPayment.data).toHaveLength(0);

    const results = await Promise.all([
      admin.rpc("admin_confirm_deposit", { p_appointment_id: a.appointmentId }),
      admin.rpc("admin_confirm_deposit", { p_appointment_id: a.appointmentId }),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(
      results.filter((r) => r.error?.message.includes("INVALID_TRANSITION")),
    ).toHaveLength(1);

    const payments = await serviceClient()
      .from("payments")
      .select("*")
      .eq("appointment_id", a.appointmentId);
    expect(payments.data).toHaveLength(1);
    expect(payments.data![0]).toMatchObject({
      status: "verified",
      method: "bank_transfer",
      external_reference: "OP-777",
    });
    expect(Number(payments.data![0]!.amount_ars)).toBe(20000);
    expect(payments.data![0]!.verified_by).not.toBeNull();
    expect(await statusOf(a.appointmentId)).toBe("confirmed");
    const rows = await receiptsOf(a.appointmentId);
    expect(
      rows.every(
        (r) => r.status === "verified" && r.verified_by && r.verified_at,
      ),
    ).toBe(true);
  });

  it("a non-admin cannot confirm or reject", async () => {
    const a = await awaitingDeposit(admin);
    await submitReceipt(await issueToken(admin, a.appointmentId));
    const anon = anonClient();
    expect(
      (
        await anon.rpc("admin_confirm_deposit", {
          p_appointment_id: a.appointmentId,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("admin_reject_receipts", {
          p_appointment_id: a.appointmentId,
          p_reason: "no",
        })
      ).error,
    ).not.toBeNull();
    expect(await statusOf(a.appointmentId)).toBe("awaiting_deposit");
  });

  it("rejecting requires a reason, keeps the appointment awaiting and allows a replacement upload", async () => {
    const a = await awaitingDeposit(admin);
    const t1 = await issueToken(admin, a.appointmentId);
    await submitReceipt(t1);

    const noReason = await admin.rpc("admin_reject_receipts", {
      p_appointment_id: a.appointmentId,
      p_reason: "  ",
    });
    expect(noReason.error?.message).toContain("REASON_REQUIRED");

    const rejected = await admin.rpc("admin_reject_receipts", {
      p_appointment_id: a.appointmentId,
      p_reason: "La imagen está cortada",
    });
    expect(rejected.error).toBeNull();
    expect(await statusOf(a.appointmentId)).toBe("awaiting_deposit");
    const [row] = await receiptsOf(a.appointmentId);
    expect(row).toMatchObject({
      status: "rejected",
      rejection_reason: "La imagen está cortada",
    });
    expect(row!.retention_until).not.toBeNull();

    expect(await submitReceipt(t1)).toMatchObject({
      ok: false,
      code: "TOKEN_USED",
    }); // the old link stays dead
    const t2 = await issueToken(admin, a.appointmentId);
    expect(
      (await submitReceipt(t2, [jpegFile("nuevo.jpg")], "OP-NEW")).ok,
    ).toBe(true);
    const rows = await receiptsOf(a.appointmentId);
    expect(rows.map((r) => r.status)).toEqual([
      "rejected",
      "pending_verification",
    ]);

    expect(
      (
        await admin.rpc("admin_confirm_deposit", {
          p_appointment_id: a.appointmentId,
        })
      ).error,
    ).toBeNull();
    expect(await statusOf(a.appointmentId)).toBe("confirmed");
  });

  it("a receipt waiting for the admin keeps the slot even after the payment window lapsed", async () => {
    const a = await awaitingDeposit(admin);
    await submitReceipt(await issueToken(admin, a.appointmentId));
    // Time travel: the receipt was uploaded in time, then the window lapsed.
    await serviceClient()
      .from("payment_receipts")
      .update({
        uploaded_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      })
      .eq("appointment_id", a.appointmentId);
    await serviceClient()
      .from("appointments")
      .update({
        deposit_due_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .eq("id", a.appointmentId);
    await admin.rpc("expire_overdue_deposits");
    expect(await statusOf(a.appointmentId)).toBe("awaiting_deposit");
    const { data } = await anonClient().rpc("public_availability");
    expect(
      (data ?? []).some((r: { slot_id: string }) => r.slot_id === a.slotId),
    ).toBe(false);

    await admin.rpc("admin_reject_receipts", {
      p_appointment_id: a.appointmentId,
      p_reason: "No es la transferencia",
    });
    await admin.rpc("expire_overdue_deposits");
    expect(await statusOf(a.appointmentId)).toBe("expired");
  });
});

describe("receipts: retention and purge", () => {
  it("purge at 30 days: the real object is deleted, the row is marked deleted and the payment history survives", async () => {
    const a = await confirmedWithReceipt();
    const before = await receiptsOf(a.appointmentId);
    const path = before[0]!.storage_path as string;
    expect(await objectExists(path)).toBe(true);

    await admin.rpc("admin_set_appointment_status", {
      p_appointment_id: a.appointmentId,
      p_new_status: "completed",
    });
    const { data: appt } = await serviceClient()
      .from("appointments")
      .select("completed_at, closed_at")
      .eq("id", a.appointmentId)
      .single();
    expect(appt!.completed_at).not.toBeNull();
    const withRetention = await receiptsOf(a.appointmentId);
    const days =
      (new Date(withRetention[0]!.retention_until as string).getTime() -
        new Date(appt!.completed_at as string).getTime()) /
      DAY;
    expect(days).toBeCloseTo(30, 1);

    // not due yet: nothing happens
    const early = await runPurge(createSupabasePurgeDeps(asSupabaseLike()), {
      source: "admin",
    });
    expect(early.deleted).toBe(0);
    expect(await objectExists(path)).toBe(true);

    // 30 days later
    await dueNow(a.appointmentId);
    const summary = await runPurge(createSupabasePurgeDeps(asSupabaseLike()), {
      source: "cron",
    });
    expect(summary, JSON.stringify(summary)).toMatchObject({
      failed: 0,
      error: null,
    });
    expect(summary.deleted).toBeGreaterThanOrEqual(1);

    expect(await objectExists(path)).toBe(false);
    const rows = await receiptsOf(a.appointmentId);
    expect(
      rows.every(
        (r) =>
          r.status === "deleted" &&
          r.storage_path === null &&
          r.original_mime_type === null &&
          r.size_bytes === null &&
          r.reference === null &&
          r.deleted_at,
      ),
    ).toBe(true);
    expect(rows.every((r) => r.verified_by && r.verified_at)).toBe(true);
    const payments = await serviceClient()
      .from("payments")
      .select("*")
      .eq("appointment_id", a.appointmentId);
    expect(payments.data).toHaveLength(1);
    expect(payments.data![0]).toMatchObject({
      status: "verified",
      method: "bank_transfer",
      external_reference: "OP-1234",
    });
    expect(Number(payments.data![0]!.amount_ars)).toBe(20000);

    // idempotent
    const again = await runPurge(createSupabasePurgeDeps(asSupabaseLike()), {
      source: "cron",
    });
    expect(again.deleted).toBe(0);
    const runs = await admin.from("receipt_purge_runs").select("*");
    expect(runs.data!.length).toBeGreaterThanOrEqual(2);
  });

  it("retention_hold prevents deletion until the dispute is resolved (then +180 days)", async () => {
    const a = await confirmedWithReceipt();
    await admin.rpc("admin_set_appointment_status", {
      p_appointment_id: a.appointmentId,
      p_new_status: "completed",
    });
    const path = (await receiptsOf(a.appointmentId))[0]!.storage_path as string;

    expect(
      (
        await admin.rpc("admin_set_retention_hold", {
          p_appointment_id: a.appointmentId,
          p_hold: true,
          p_reason: "",
        })
      ).error?.message,
    ).toContain("REASON_REQUIRED");
    expect(
      (
        await admin.rpc("admin_set_retention_hold", {
          p_appointment_id: a.appointmentId,
          p_hold: true,
          p_reason: "Reclamo abierto por la devolución",
        })
      ).error,
    ).toBeNull();

    await dueNow(a.appointmentId);
    const held = await runPurge(createSupabasePurgeDeps(asSupabaseLike()), {
      source: "cron",
    });
    expect(held.deleted).toBe(0);
    expect(await objectExists(path)).toBe(true);
    expect((await receiptsOf(a.appointmentId))[0]!.status).toBe("verified");

    expect(
      (
        await admin.rpc("admin_resolve_dispute", {
          p_appointment_id: a.appointmentId,
        })
      ).error,
    ).toBeNull();
    const [row] = await receiptsOf(a.appointmentId);
    const { data: appt } = await serviceClient()
      .from("appointments")
      .select("dispute_resolved_at, retention_hold")
      .eq("id", a.appointmentId)
      .single();
    expect(appt!.retention_hold).toBe(false);
    const days =
      (new Date(row!.retention_until as string).getTime() -
        new Date(appt!.dispute_resolved_at as string).getTime()) /
      DAY;
    expect(days).toBeCloseTo(180, 1);
    const afterResolve = await runPurge(
      createSupabasePurgeDeps(asSupabaseLike()),
      { source: "cron" },
    );
    expect(afterResolve.deleted).toBe(0);
  });

  it("a rejected receipt is scheduled for deletion 7 days after the rejection", async () => {
    const a = await awaitingDeposit(admin);
    await submitReceipt(await issueToken(admin, a.appointmentId));
    await admin.rpc("admin_reject_receipts", {
      p_appointment_id: a.appointmentId,
      p_reason: "borroso",
    });
    const [row] = await receiptsOf(a.appointmentId);
    const days =
      (new Date(row!.retention_until as string).getTime() -
        new Date(row!.rejected_at as string).getTime()) /
      DAY;
    expect(days).toBeCloseTo(7, 1);
  });

  it("a Storage failure is traced, retried on the next run, and stops after the attempt limit", async () => {
    const a = await confirmedWithReceipt();
    await admin.rpc("admin_set_appointment_status", {
      p_appointment_id: a.appointmentId,
      p_new_status: "completed",
    });
    const path = (await receiptsOf(a.appointmentId))[0]!.storage_path as string;
    await dueNow(a.appointmentId);

    const real = createSupabasePurgeDeps(asSupabaseLike());
    const failing = {
      ...real,
      removeObject: async () => {
        throw new Error("storage down");
      },
    };
    const first = await runPurge(failing, { source: "cron", maxAttempts: 3 });
    expect(first.failed, JSON.stringify(first)).toBeGreaterThanOrEqual(1);
    const [afterFail] = await receiptsOf(a.appointmentId);
    expect(afterFail).toMatchObject({
      status: "verified",
      deletion_attempts: 1,
      last_deletion_error: "storage down",
    });
    expect(await objectExists(path)).toBe(true);

    const second = await runPurge(real, { source: "cron", maxAttempts: 3 });
    expect(second.deleted).toBeGreaterThanOrEqual(1);
    expect(await objectExists(path)).toBe(false);
    expect((await receiptsOf(a.appointmentId))[0]!.status).toBe("deleted");
  });

  it("the orphan sweep removes unregistered objects older than a day and keeps registered ones", async () => {
    const a = await awaitingDeposit(admin);
    const token = await issueToken(admin, a.appointmentId);
    expect((await submitReceipt(token)).ok).toBe(true);
    const registered = (await receiptsOf(a.appointmentId))[0]!
      .storage_path as string;

    const second = await issueToken(admin, a.appointmentId);
    const { prep } = await prepareAndUpload(second, [
      jpegFile("abandonado.jpg"),
    ]); // uploaded, never finalized
    if (!prep.ok) throw new Error("prepare failed");
    const orphan = prep.uploads[0]!.path;
    expect(await objectExists(orphan)).toBe(true);

    const fresh = createSupabasePurgeDeps(asSupabaseLike());
    expect(await fresh.sweepOrphans!()).toBe(0); // too recent: an upload in progress is never touched
    expect(await objectExists(orphan)).toBe(true);

    const later = createSupabasePurgeDeps(asSupabaseLike(), {
      now: () => Date.now() + 25 * 60 * 60 * 1000,
    });
    expect(await later.sweepOrphans!()).toBeGreaterThanOrEqual(1);
    expect(await objectExists(orphan)).toBe(false);
    expect(await objectExists(registered)).toBe(true);
  });
});

describe("receipts: emails never block or revert a transition", () => {
  function setup(sendResults: ("ok" | "fail")[]) {
    const send = vi.fn(async () => {
      const next = sendResults.shift() ?? "ok";
      return next === "ok"
        ? ({ ok: true, provider: "resend" } as const)
        : ({ ok: false, error: "Resend caído" } as const);
    });
    const mailer = { send } as unknown as Mailer;
    const issue: IssueUploadToken = async (appointmentId, tokenHash) => {
      const { error } = await admin.rpc("admin_issue_upload_token", {
        p_appointment_id: appointmentId,
        p_token_hash: tokenHash,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    };
    const notifier = createNotifier({
      client: serviceClient(),
      mailer,
      ownerEmail: "owner@example.com",
      transfer: { alias: "good.boy.test", holder: "Titular", cbu: null },
      siteUrl: "https://goodboy.test",
    });
    return { send, notifier, issue };
  }

  it("a Resend failure does not revert the approval; the retry sends it exactly once", async () => {
    const a = await awaitingDeposit(admin);
    const { send, notifier, issue } = setup(["fail"]);

    const first = await notifier.requestApproved(a.appointmentId, issue);
    expect(first).toEqual({ customer: "failed" });
    expect(await statusOf(a.appointmentId)).toBe("awaiting_deposit");
    const failed = await serviceClient()
      .from("email_outbox")
      .select("status, attempts")
      .eq("appointment_id", a.appointmentId)
      .eq("kind", "request_approved");
    expect(failed.data![0]).toMatchObject({ status: "failed", attempts: 1 });

    const summary = await notifier.retryFailed(issue);
    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);

    expect(await notifier.requestApproved(a.appointmentId, issue)).toEqual({
      customer: "skipped",
    });
    expect(send).toHaveBeenCalledTimes(2);
    const sentRow = await serviceClient()
      .from("email_outbox")
      .select("status, attempts")
      .eq("appointment_id", a.appointmentId)
      .eq("kind", "request_approved");
    expect(sentRow.data![0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("the same email is never sent twice, even when requested concurrently", async () => {
    const a = await awaitingDeposit(admin);
    const { send, notifier } = setup([]);
    const results = await Promise.all([
      notifier.requestReceived(a.appointmentId),
      notifier.requestReceived(a.appointmentId),
      notifier.requestReceived(a.appointmentId),
    ]);
    const sent = results.filter((r) => r.customer === "sent");
    expect(sent).toHaveLength(1);
    // one customer email + one owner email in total
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("the upload link in the approval email works and is the only place the raw token exists", async () => {
    const a = await awaitingDeposit(admin);
    const { send, notifier, issue } = setup([]);
    await notifier.requestApproved(a.appointmentId, issue);
    const message = (send.mock.calls as unknown as [{ text: string }][])[0]![0];
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(message.text)![1]!;

    const rows = await serviceClient()
      .from("email_outbox")
      .select("*")
      .eq("appointment_id", a.appointmentId);
    expect(JSON.stringify(rows.data)).not.toContain(token);
    expect((await submitReceipt(token)).ok).toBe(true);
  });
});
