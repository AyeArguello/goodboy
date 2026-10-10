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

  it("treats Supabase email throttling as a neutral success", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });

    await expect(
      requestAdminPasswordRecovery("admin@example.com"),
    ).resolves.toEqual({ ok: true });
  });
});
