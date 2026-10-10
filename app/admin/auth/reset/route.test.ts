import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  authorizeRecoveryUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("@/lib/auth/recoverySession", () => ({
  authorizeRecoveryUser: mocks.authorizeRecoveryUser,
  recoveryCookieOptions: () => ({
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 600,
  }),
}));

import { GET } from "./route";

const call = (query: string) =>
  GET(new Request(`https://goodboy.com.ar/admin/auth/reset${query}`));

describe("GET /admin/auth/reset", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.authorizeRecoveryUser.mockResolvedValue(null);
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges the code and sends the owner to the password form with the marker cookie", async () => {
    const response = await call("?code=abc");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://goodboy.com.ar/admin/restablecer",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "admin-password-recovery=allowed",
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("explains an expired link instead of showing a bare login", async () => {
    const response = await call("?error=access_denied&error_code=otp_expired");

    expect(response.headers.get("location")).toBe(
      "https://goodboy.com.ar/admin/login?error=recovery_expired",
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("explains a link opened in another browser (missing verifier)", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthPKCECodeVerifierMissingError", status: 400 },
    });

    const response = await call("?code=abc");
    expect(response.headers.get("location")).toBe(
      "https://goodboy.com.ar/admin/login?error=recovery_verifier",
    );
    expect(mocks.signOut).toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reports a link without a code as a generic failure", async () => {
    const response = await call("");
    expect(response.headers.get("location")).toBe(
      "https://goodboy.com.ar/admin/login?error=recovery_failed",
    );
  });

  it("signs out and refuses an address that is not allowlisted", async () => {
    mocks.authorizeRecoveryUser.mockResolvedValue("not_allowed");

    const response = await call("?code=abc");
    expect(response.headers.get("location")).toBe(
      "https://goodboy.com.ar/admin/login?error=recovery_not_allowed",
    );
    expect(mocks.signOut).toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
