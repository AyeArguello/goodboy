import { describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./helpers";

describe("closed password authentication", () => {
  it("allows a provisioned user to sign in but rejects public signup", async () => {
    const service = serviceClient();
    const email = `password-admin-${Date.now()}@example.com`;
    const password = "LocalOnlyTest2026!";
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    expect(createError).toBeNull();

    try {
      const login = await anonClient().auth.signInWithPassword({
        email,
        password,
      });
      expect(login.error).toBeNull();
      expect(login.data.user?.email).toBe(email);

      const signup = await anonClient().auth.signUp({
        email: `blocked-signup-${Date.now()}@example.com`,
        password: "BlockedSignup2026!",
      });
      expect(signup.error?.message).toMatch(/signup|disabled|not allowed/i);
      expect(signup.data.user).toBeNull();
    } finally {
      if (created.user) {
        await service.auth.admin.deleteUser(created.user.id);
      }
    }
  });
});
