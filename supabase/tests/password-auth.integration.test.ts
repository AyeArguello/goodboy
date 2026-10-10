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

  it("a recovery token hash opens a session that can set a new password, once", async () => {
    const service = serviceClient();
    const email = `recovery-admin-${Date.now()}@example.com`;
    const oldPassword = "OldLocalTest2026!";
    const newPassword = "NewLocalTest2026!";
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password: oldPassword,
        email_confirm: true,
      });
    expect(createError).toBeNull();

    try {
      // The token_hash is what the customised "Reset password" email template
      // puts in the link; generateLink returns the same value without sending mail.
      const { data: link, error: linkError } =
        await service.auth.admin.generateLink({ type: "recovery", email });
      expect(linkError).toBeNull();
      const tokenHash = link?.properties?.hashed_token;
      expect(tokenHash).toBeTruthy();

      // Another browser/device: a brand-new client with no PKCE verifier.
      const recovery = anonClient();
      const verified = await recovery.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash!,
      });
      expect(verified.error).toBeNull();
      expect(verified.data.session).not.toBeNull();
      expect(verified.data.user?.email).toBe(email);

      const updated = await recovery.auth.updateUser({ password: newPassword });
      expect(updated.error).toBeNull();

      const reused = await anonClient().auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash!,
      });
      expect(reused.error).not.toBeNull();

      const oldLogin = await anonClient().auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      expect(oldLogin.error).not.toBeNull();
      const newLogin = await anonClient().auth.signInWithPassword({
        email,
        password: newPassword,
      });
      expect(newLogin.error).toBeNull();
    } finally {
      if (created.user) {
        await service.auth.admin.deleteUser(created.user.id);
      }
    }
  });
});
