import { describe, expect, it } from "vitest";
import {
  anonClient,
  createFutureSlot,
  serviceClient,
  validAppointmentPayload,
} from "./helpers";

let userCounter = 0;

/** A signed-in user that is NOT an administrator (no admin_profiles row). */
async function createPlainUserClient() {
  const svc = serviceClient();
  const email = `test-plain-${Date.now()}-${userCounter++}@example.com`;
  const password = "Test1234!";
  const { error: createError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

const rateLimitArgs = (key: string) => ({
  p_key: key,
  p_max_per_window: 5,
  p_window: "10 minutes",
});

describe("enforce_rate_limit privileges", () => {
  it("anonymous callers cannot execute it directly", async () => {
    const { error } = await anonClient().rpc(
      "enforce_rate_limit",
      rateLimitArgs("direct:anon"),
    );
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("a signed-in non-admin user cannot execute it directly", async () => {
    const user = await createPlainUserClient();
    const { error } = await user.rpc(
      "enforce_rate_limit",
      rateLimitArgs("direct:user"),
    );
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("nothing was written to the throttle table by the denied calls", async () => {
    const { data } = await serviceClient()
      .from("request_throttle")
      .select("key")
      .like("key", "direct:%");
    expect(data ?? []).toEqual([]);
  });

  it("the service role keeps access", async () => {
    const svc = serviceClient();
    const { error } = await svc.rpc(
      "enforce_rate_limit",
      rateLimitArgs("direct:service"),
    );
    expect(error).toBeNull();
    const { data } = await svc
      .from("request_throttle")
      .select("count")
      .eq("key", "direct:service")
      .single();
    expect(data?.count).toBe(1);
  });

  it("only the service role holds EXECUTE on the effective grants", async () => {
    const svc = serviceClient();
    // Effective privileges as PostgREST sees them: call through each role.
    const asAnon = await anonClient().rpc("enforce_rate_limit", {
      ...rateLimitArgs("direct:grants"),
    });
    const asService = await svc.rpc("enforce_rate_limit", {
      ...rateLimitArgs("direct:grants"),
    });
    expect(asAnon.error?.code).toBe("42501");
    expect(asService.error).toBeNull();
  });
});

describe("rate limiting through the public RPCs", () => {
  it("request_appointment still works for anonymous callers", async () => {
    const slotId = await createFutureSlot(48);
    const { error } = await anonClient().rpc("request_appointment", {
      ...validAppointmentPayload(slotId),
      p_client_key: "rl-works",
    });
    expect(error).toBeNull();
  });

  it("legitimate limits still apply: the 6th booking in the window is rate limited", async () => {
    // Only requests that succeed count: a failing request rolls back its own
    // throttle increment, so the attempts here must all be valid bookings.
    const anon = anonClient();
    const results: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      const slotId = await createFutureSlot(48 + i * 24);
      const { error } = await anon.rpc("request_appointment", {
        ...validAppointmentPayload(slotId),
        p_client_key: "rl-legit",
      });
      results.push(error?.message);
    }
    expect(results.slice(0, 5)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(results[5]).toContain("RATE_LIMITED");
  });

  it("a different client key has its own window", async () => {
    const anon = anonClient();
    const slotId = await createFutureSlot(48);
    const { error } = await anon.rpc("request_appointment", {
      ...validAppointmentPayload(slotId),
      p_client_key: "rl-other",
    });
    expect(error).toBeNull();
  });

  it("get_appointment_status keeps rate limiting by client key", async () => {
    const anon = anonClient();
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 11; i++) {
      const { error } = await anon.rpc("get_appointment_status", {
        p_code: "GB-AAAAAAAA",
        p_client_key: "rl-status",
      });
      codes.push(error?.message);
    }
    expect(codes.slice(0, 10).every((m) => m === undefined)).toBe(true);
    expect(codes[10]).toContain("RATE_LIMITED");
  });

  it("concurrent first calls for one key neither fail with a raw unique violation nor exceed the limit", async () => {
    const attempts = 14;
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        anonClient().rpc("get_appointment_status", {
          p_code: "GB-AAAAAAAA",
          p_client_key: "rl-concurrent",
        }),
      ),
    );
    const messages = results.map((r) => r.error?.message ?? "ok");
    expect(messages.filter((m) => /duplicate key|unique/i.test(m))).toEqual([]);
    expect(messages.filter((m) => m === "ok")).toHaveLength(10);
    expect(messages.filter((m) => m.includes("RATE_LIMITED"))).toHaveLength(
      attempts - 10,
    );
  });
});
