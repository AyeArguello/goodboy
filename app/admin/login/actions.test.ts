import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  serviceUpsert: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  profileMaybeSingle: vi.fn(),
  getServerEnv: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("@/lib/security/clientKey", () => ({
  getClientKey: async () => "hashed-client",
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabaseClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ upsert: mocks.serviceUpsert }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
      }),
    }),
  }),
}));

import { loginAdmin } from "./actions";

describe("loginAdmin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getServerEnv.mockReturnValue({
      ADMIN_EMAIL_ALLOWLIST: ["admin@example.com"],
    });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
      error: null,
    });
  });

  it("fails closed when the private brute-force limiter is unavailable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({
      error: {
        code: "PGRST301",
        message: "invalid api key",
        hint: "check server credentials",
        details: "must not be logged",
      },
    });

    await expect(
      loginAdmin("admin@example.com", "Secret1234!abcd"),
    ).resolves.toEqual({
      ok: false,
      error:
        "No pudimos iniciar sesión. Esperá unos minutos y volvé a intentarlo.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Admin password-login pre-limit unavailable",
      {
        code: "PGRST301",
        message: "invalid api key",
        hint: "check server credentials",
      },
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not submit a non-allowlisted address to Auth", async () => {
    await expect(
      loginAdmin("other@example.com", "Secret1234!abcd"),
    ).resolves.toEqual({
      ok: false,
      error: "Correo o contraseña incorrectos.",
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns the same generic error for invalid credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });

    await expect(
      loginAdmin("admin@example.com", "Wrong1234!abcd"),
    ).resolves.toEqual({
      ok: false,
      error: "Correo o contraseña incorrectos.",
    });
  });

  it("creates the authorized profile only after a valid password login", async () => {
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.serviceUpsert.mockResolvedValue({ error: null });

    await expect(
      loginAdmin("ADMIN@example.com", "Secret1234!abcd"),
    ).resolves.toEqual({ ok: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "Secret1234!abcd",
    });
    expect(mocks.serviceUpsert).toHaveBeenCalledWith({
      id: "user-1",
      email: "admin@example.com",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });
});
