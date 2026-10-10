import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/config/business", () => ({
  siteUrl: () => "https://goodboy.com.ar",
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("@/lib/security/clientKey", () => ({
  getClientKey: async () => "hashed-client",
}));
vi.mock("@/lib/security/rateLimitKey", () => ({
  hashClientKey: (raw: string) => `hashed:${raw}`,
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

import { requestAdminPasswordRecovery } from "./actions";

describe("requestAdminPasswordRecovery", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.getServerEnv.mockReturnValue({
      ADMIN_EMAIL_ALLOWLIST: ["admin@example.com"],
    });
  });

  it("does not send recovery email to a non-allowlisted address", async () => {
    await expect(
      requestAdminPasswordRecovery("other@example.com"),
    ).resolves.toEqual({ ok: true });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("uses the dedicated reset callback for an authorized address", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(
      requestAdminPasswordRecovery("ADMIN@example.com"),
    ).resolves.toEqual({ ok: true });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "admin@example.com",
      { redirectTo: "https://goodboy.com.ar/admin/auth/reset" },
    );
  });

  it("reports Supabase email throttling instead of pretending the email was sent", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });

    const result = await requestAdminPasswordRecovery("admin@example.com");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: expect.stringContaining("límite de envíos"),
    });
  });

  it("reports any other delivery failure", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "unexpected_failure", status: 500 },
    });

    await expect(
      requestAdminPasswordRecovery("admin@example.com"),
    ).resolves.toEqual({
      ok: false,
      error: "No pudimos enviar el correo. Intentá más tarde.",
    });
  });

  it("asks the owner to wait when the same address is requested again within a minute", async () => {
    mocks.rpc.mockImplementation(
      async (_fn: string, args: { p_key: string }) =>
        args.p_key.includes(":email:")
          ? { error: { message: "RATE_LIMITED" } }
          : { error: null },
    );

    const result = await requestAdminPasswordRecovery("admin@example.com");
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("Esperá un minuto"),
    });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("applies the same cooldown to an unknown address, so the answer reveals nothing", async () => {
    mocks.rpc.mockImplementation(
      async (_fn: string, args: { p_key: string }) =>
        args.p_key.includes(":email:")
          ? { error: { message: "RATE_LIMITED" } }
          : { error: null },
    );

    const known = await requestAdminPasswordRecovery("admin@example.com");
    const unknown = await requestAdminPasswordRecovery("other@example.com");
    expect(unknown).toEqual(known);
  });

  it("keys the cooldown on the HMAC of the normalised address", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestAdminPasswordRecovery("ADMIN@example.com");

    const keys = mocks.rpc.mock.calls.map(
      (call) => (call[1] as { p_key: string }).p_key,
    );
    // The test double of hashClientKey prefixes "hashed:"; the real one is an
    // HMAC-SHA256 hex digest, so the address itself never reaches the database.
    expect(keys).toContain(
      "admin-password-recovery:email:hashed:admin@example.com",
    );
  });

  it("fails closed when the cooldown limiter is unavailable", async () => {
    mocks.rpc.mockImplementation(
      async (_fn: string, args: { p_key: string }) =>
        args.p_key.includes(":email:")
          ? { error: { message: "boom" } }
          : { error: null },
    );

    const result = await requestAdminPasswordRecovery("admin@example.com");
    expect(result.ok).toBe(false);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
