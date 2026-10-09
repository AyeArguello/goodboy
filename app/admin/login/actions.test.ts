import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signInWithOtp: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/config/business", () => ({
  siteUrl: () => "https://goodboy.com.ar",
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: { signInWithOtp: mocks.signInWithOtp },
  }),
}));

import { sendAdminLoginLink } from "./actions";

describe("sendAdminLoginLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.rpc.mockReset();
    mocks.signInWithOtp.mockReset();
    mocks.getServerEnv.mockReturnValue({
      ADMIN_EMAIL_ALLOWLIST: ["admin@example.com"],
    });
  });

  it("continues with Supabase Auth if the private pre-limit is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({ error: new Error("invalid api key") });
    mocks.signInWithOtp.mockResolvedValue({ error: null });

    await expect(sendAdminLoginLink("admin@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "admin@example.com",
      options: {
        emailRedirectTo: "https://goodboy.com.ar/admin/auth/callback",
      },
    });
  });

  it("reports an Auth delivery failure instead of claiming success", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.signInWithOtp.mockResolvedValue({
      error: { code: "smtp_failed", status: 500 },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await sendAdminLoginLink("admin@example.com");
    expect(result).toEqual({
      ok: false,
      error:
        "No pudimos enviar el enlace. Esperá un minuto y volvé a intentarlo.",
    });
  });

  it("does not call Auth for an address outside the allowlist", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    await expect(sendAdminLoginLink("other@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
});
