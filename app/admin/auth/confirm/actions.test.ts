import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  cookieSet: vi.fn(),
  authorizeRecoveryUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock("@/lib/security/clientKey", () => ({
  getClientKey: async () => "hashed-client",
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/auth/recoverySession", () => ({
  authorizeRecoveryUser: mocks.authorizeRecoveryUser,
  recoveryCookieOptions: () => ({ httpOnly: true, path: "/admin" }),
}));

import { confirmAdminRecovery } from "./actions";

const TOKEN_HASH = "pkce_0123456789abcdef0123456789abcdef";

describe("confirmAdminRecovery", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
      error: null,
    });
    mocks.authorizeRecoveryUser.mockResolvedValue(null);
  });

  it("verifies the token hash server side and opens the password-reset window", async () => {
    await expect(confirmAdminRecovery(TOKEN_HASH, "recovery")).resolves.toEqual(
      { ok: true },
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: TOKEN_HASH,
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "admin-password-recovery",
      "allowed",
      expect.objectContaining({ httpOnly: true, path: "/admin" }),
    );
  });

  it("rejects a link of another type or with a malformed hash without calling Supabase", async () => {
    for (const [hash, type] of [
      [TOKEN_HASH, "magiclink"],
      ["", "recovery"],
      ["short", "recovery"],
      ["has spaces and <script>", "recovery"],
    ] as const) {
      await expect(confirmAdminRecovery(hash, type)).resolves.toMatchObject({
        ok: false,
        problem: "expired",
      });
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("reports an expired or used token and leaves no session behind", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { code: "otp_expired", status: 403, name: "AuthApiError" },
    });

    await expect(confirmAdminRecovery(TOKEN_HASH, "recovery")).resolves.toEqual(
      expect.objectContaining({ ok: false, problem: "expired" }),
    );
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("signs out and refuses an address that is not allowlisted", async () => {
    mocks.authorizeRecoveryUser.mockResolvedValue("not_allowed");

    await expect(confirmAdminRecovery(TOKEN_HASH, "recovery")).resolves.toEqual(
      expect.objectContaining({ ok: false, problem: "not_allowed" }),
    );
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("fails closed when the private limiter is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "boom" } });

    await expect(confirmAdminRecovery(TOKEN_HASH, "recovery")).resolves.toEqual(
      expect.objectContaining({ ok: false, problem: "failed" }),
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("never puts the token in the logs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { code: "otp_expired", message: `bad ${TOKEN_HASH}`, status: 403 },
    });

    await confirmAdminRecovery(TOKEN_HASH, "recovery");
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN_HASH);
    logged.mockRestore();
  });
});
