import { describe, expect, it, type TestContext } from "vitest";
import { ANON_KEY, createTestAdminClient, serviceClient } from "./helpers";
import {
  awaitingDeposit,
  issueToken,
  objectExists,
  receiptsOf,
  submitReceipt,
} from "./receiptHelpers";

/**
 * Runs the REAL Edge Function (Deno, via `supabase functions serve`) against
 * the local stack. CI starts it and sets EDGE_FUNCTION_URL/PURGE_CRON_SECRET;
 * locally it is skipped unless you serve the function yourself. In CI a missing
 * function is a failure, not a skip.
 */
const URL_ = process.env.EDGE_FUNCTION_URL;
const SECRET = process.env.PURGE_CRON_SECRET;

function requireFunction(ctx: TestContext) {
  if (URL_ && SECRET) return;
  if (process.env.CI) {
    throw new Error(
      "CI must serve the purge Edge Function (EDGE_FUNCTION_URL / PURGE_CRON_SECRET).",
    );
  }
  ctx.skip();
}

const call = (init: RequestInit & { secret?: string | null } = {}) => {
  const { secret, ...rest } = init;
  return fetch(URL_!, {
    method: "POST",
    ...rest,
    headers: {
      apikey: ANON_KEY,
      "content-type": "application/json",
      ...(secret === null
        ? {}
        : { authorization: `Bearer ${secret ?? SECRET}` }),
    },
    body: "{}",
  });
};

describe("purge-payment-receipts Edge Function (Deno)", () => {
  it("refuses wrong methods and wrong or missing secrets, and touches nothing", async (ctx) => {
    requireFunction(ctx);
    const get = await fetch(URL_!, { headers: { apikey: ANON_KEY } });
    expect(get.status).toBe(405);
    expect((await call({ secret: null })).status).toBe(401);
    expect((await call({ secret: "not-the-secret" })).status).toBe(401);
  });

  it("deletes expired receipts for real through the Storage API, records the run, and is idempotent", async (ctx) => {
    requireFunction(ctx);
    const admin = await createTestAdminClient();
    const a = await awaitingDeposit(admin);
    expect(
      (await submitReceipt(await issueToken(admin, a.appointmentId))).ok,
    ).toBe(true);
    expect(
      (
        await admin.rpc("admin_confirm_deposit", {
          p_appointment_id: a.appointmentId,
        })
      ).error,
    ).toBeNull();
    await admin.rpc("admin_set_appointment_status", {
      p_appointment_id: a.appointmentId,
      p_new_status: "completed",
    });
    const [receipt] = await receiptsOf(a.appointmentId);
    const path = receipt!.storage_path as string;
    expect(await objectExists(path)).toBe(true);

    // 30 days after completion
    await serviceClient()
      .from("payment_receipts")
      .update({ retention_until: new Date(Date.now() - 1000).toISOString() })
      .eq("appointment_id", a.appointmentId);

    const res = await call();
    const body = (await res.json()) as {
      deleted: number;
      failed: number;
      source: string;
      error: string | null;
    };
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ failed: 0, source: "cron", error: null });
    expect(body.deleted).toBeGreaterThanOrEqual(1);

    expect(await objectExists(path)).toBe(false);
    expect((await receiptsOf(a.appointmentId))[0]).toMatchObject({
      status: "deleted",
      storage_path: null,
    });
    const runs = await serviceClient()
      .from("receipt_purge_runs")
      .select("source, deleted")
      .eq("source", "cron");
    expect(runs.data!.length).toBeGreaterThanOrEqual(1);

    const again = (await (await call()).json()) as { deleted: number };
    expect(again.deleted).toBe(0);
  });

  it("does not delete a receipt whose retention_hold is on", async (ctx) => {
    requireFunction(ctx);
    const admin = await createTestAdminClient();
    const a = await awaitingDeposit(admin);
    expect(
      (await submitReceipt(await issueToken(admin, a.appointmentId))).ok,
    ).toBe(true);
    await admin.rpc("admin_confirm_deposit", {
      p_appointment_id: a.appointmentId,
    });
    await admin.rpc("admin_set_appointment_status", {
      p_appointment_id: a.appointmentId,
      p_new_status: "completed",
    });
    await admin.rpc("admin_set_retention_hold", {
      p_appointment_id: a.appointmentId,
      p_hold: true,
      p_reason: "Reclamo abierto",
    });
    const path = (await receiptsOf(a.appointmentId))[0]!.storage_path as string;
    await serviceClient()
      .from("payment_receipts")
      .update({ retention_until: new Date(Date.now() - 1000).toISOString() })
      .eq("appointment_id", a.appointmentId);

    const res = await call();
    expect(res.status).toBe(200);
    expect(await objectExists(path)).toBe(true);
    expect((await receiptsOf(a.appointmentId))[0]!.status).toBe("verified");
  });
});
