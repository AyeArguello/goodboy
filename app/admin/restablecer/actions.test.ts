import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabaseClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { updateAdminPassword } from "./actions";

describe("updateAdminPassword", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.cookieGet.mockReturnValue({ value: "allowed" });
    mocks.getServerEnv.mockReturnValue({
      ADMIN_EMAIL_ALLOWLIST: ["admin@example.com"],
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
    });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("requires the short-lived HTTP-only recovery marker", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(
      updateAdminPassword("StrongSecret2026!", "StrongSecret2026!"),
    ).resolves.toEqual({
      ok: false,
      error: "El enlace de recuperación venció. Solicitá uno nuevo.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a password without a symbol", async () => {
    const result = await updateAdminPassword(
      "PasswordWithoutSymbol2026",
      "PasswordWithoutSymbol2026",
    );
    expect(result).toEqual({
      ok: false,
      error: "Incluí al menos un símbolo.",
    });
  });

  it("updates the password and revokes all recovery sessions", async () => {
    await expect(
      updateAdminPassword("StrongSecret2026!", "StrongSecret2026!"),
    ).resolves.toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "StrongSecret2026!",
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("admin-password-recovery");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
