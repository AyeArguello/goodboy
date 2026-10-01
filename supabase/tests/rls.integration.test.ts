import { describe, expect, it } from "vitest";
import { anonClient, createFutureSlot } from "./helpers";

describe("RLS: anonymous access", () => {
  it("cannot select appointments directly", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("appointments").select("*");
    // RLS denies the read outright: either an error, or (per PostgREST's
    // default behavior with no matching policy) an empty result set. Either
    // way, no rows may leak.
    expect(data === null || data.length === 0).toBe(true);
    if (!error) expect(data).toEqual([]);
  });

  it("cannot select availability_slots directly (must use public_availability())", async () => {
    const anon = anonClient();
    const { data } = await anon.from("availability_slots").select("*");
    expect(data === null || data.length === 0).toBe(true);
  });

  it("cannot select admin_profiles", async () => {
    const anon = anonClient();
    const { data } = await anon.from("admin_profiles").select("*");
    expect(data === null || data.length === 0).toBe(true);
  });

  it("cannot select payments", async () => {
    const anon = anonClient();
    const { data } = await anon.from("payments").select("*");
    expect(data === null || data.length === 0).toBe(true);
  });

  it("rejects deposit RPCs for anonymous callers", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("admin_record_deposit_payment", {
      p_appointment_id: "00000000-0000-0000-0000-000000000000",
      p_amount_ars: 20000,
      p_method: "cash",
    });
    expect(error).not.toBeNull();
  });

  it("can read anonymized availability via the RPC", async () => {
    await createFutureSlot(48);
    const anon = anonClient();
    const { data, error } = await anon.rpc("public_availability");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual([
        "date_key",
        "slot_id",
        "starts_at",
      ]);
    }
  });

  it("rejects admin-only RPCs for anonymous callers", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("admin_publish_slot", {
      p_starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
