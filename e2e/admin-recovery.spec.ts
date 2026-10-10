import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../supabase/tests/helpers";

/**
 * Password recovery of the admin panel, driven through the real UI.
 *
 * The recovery email itself is not read: the test asks Supabase for the same
 * one-time `token_hash` the customised "Reset password" template puts in the
 * link (admin.generateLink returns it without sending anything) and opens
 * /admin/auth/confirm with it, exactly like the owner does from the email.
 * Needs a reachable Supabase (the local Docker stack in CI); it skips itself
 * when there isn't one so `pnpm test:e2e` still runs anywhere.
 *
 * Each Playwright project signs in as its own allowlisted address so the two
 * projects, which run in parallel, never touch the same account. CI lists both
 * in ADMIN_EMAIL_ALLOWLIST.
 */
const EMAILS: Record<string, string> = {
  chromium: "ci-admin@example.com",
  "mobile-chrome": "ci-admin-mobile@example.com",
};
const OLD_PASSWORD = "OldPassword-2026-Local!";
const NEW_PASSWORD = "BrandNewPassword-2026-Local!";

// Booking, status lookups and the password endpoints are rate limited by caller
// IP; every test attempt gets its own address.
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
});

let supabaseUp = false;
test.beforeAll(async () => {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321"}/rest/v1/`,
      { signal: AbortSignal.timeout(2500) },
    );
    supabaseUp = res.status < 500;
  } catch {
    supabaseUp = false;
  }
});

function requireSupabase() {
  if (supabaseUp) return;
  if (process.env.CI) {
    throw new Error(
      "CI must run the admin recovery journey against the local Supabase stack, but it is unreachable.",
    );
  }
  test.skip(true, "Needs a local Supabase stack");
}

/**
 * Waits until React has hydrated the control. next dev hydrates late on a cold
 * route and a click or fill before that is lost (a token-spending click must
 * never be retried, so it cannot be wrapped in a retry loop either).
 */
async function waitForHydration(page: Page, role: "button", name: string) {
  const handle = await page.getByRole(role, { name }).elementHandle();
  await page.waitForFunction(
    (element) =>
      Object.keys(element as Element).some((key) =>
        key.startsWith("__reactProps"),
      ),
    handle,
    { timeout: 30_000 },
  );
}

/** The error box of the page, not Next's (empty) route announcer. */
const alertBox = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function removeAdmin(email: string) {
  const svc = serviceClient();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email?.toLowerCase() !== email) continue;
    await svc.from("admin_profiles").delete().eq("id", user.id);
    await svc.auth.admin.deleteUser(user.id);
  }
}

test.describe("admin password recovery", () => {
  test("recovery link -> confirm -> new password -> sign in; the link works once", async ({
    page,
  }, info) => {
    requireSupabase();
    const email = EMAILS[info.project.name]!;
    const svc = serviceClient();

    await removeAdmin(email);
    const { error: createError } = await svc.auth.admin.createUser({
      email,
      password: OLD_PASSWORD,
      email_confirm: true,
    });
    expect(createError).toBeNull();

    try {
      const { data: link, error: linkError } =
        await svc.auth.admin.generateLink({ type: "recovery", email });
      expect(linkError).toBeNull();
      const tokenHash = link?.properties?.hashed_token;
      expect(tokenHash).toBeTruthy();
      const confirmUrl = `/admin/auth/confirm?token_hash=${tokenHash}&type=recovery`;

      // Opening the link (what a mail scanner does) must not spend it.
      await page.goto(confirmUrl);
      await expect(
        page.getByRole("heading", { name: "Crear contraseña nueva" }),
      ).toBeVisible();
      await waitForHydration(page, "button", "Continuar");
      await page.getByRole("button", { name: "Continuar" }).click();

      // The owner now sets the password.
      await expect(page).toHaveURL(/\/admin\/restablecer/);
      await waitForHydration(page, "button", "Guardar contraseña");
      await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
      await page.getByLabel("Repetir contraseña").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();

      await expect(page).toHaveURL(/\/admin\/login\?reset=done/);
      await expect(page.getByText("Contraseña actualizada")).toBeVisible();

      // The old password is dead; the new one opens the panel.
      await waitForHydration(page, "button", "Ingresar");
      await page.getByLabel("Correo").fill(email);
      await page.getByLabel("Contraseña").fill(OLD_PASSWORD);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(
        page.getByText("Correo o contraseña incorrectos."),
      ).toBeVisible();

      await page.getByLabel("Contraseña").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/admin\/hoy/);

      // The same link cannot be used again, and says so clearly.
      await page.goto(confirmUrl);
      await waitForHydration(page, "button", "Continuar");
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(alertBox(page)).toContainText("venció o ya se usó");
      await expect(
        page.getByRole("link", { name: "Pedir un enlace nuevo" }),
      ).toHaveAttribute("href", "/admin/recuperar");
    } finally {
      await removeAdmin(email);
    }
  });

  test("an unknown or incomplete link explains itself instead of showing a bare login", async ({
    page,
  }) => {
    await page.goto("/admin/auth/confirm");
    await expect(alertBox(page)).toContainText("incompleto");

    await page.goto("/admin/login?error=recovery_expired");
    await expect(alertBox(page)).toContainText("venció o ya se usó");
    await expect(
      page.getByRole("link", { name: "Pedir un enlace nuevo" }),
    ).toBeVisible();

    await page.goto("/admin/login?error=recovery_verifier");
    await expect(alertBox(page)).toContainText("mismo navegador");
  });

  test("the confirm page is public but never indexable", async ({ page }) => {
    await page.goto("/admin/auth/confirm?token_hash=abc&type=recovery");
    await expect(page).toHaveURL(/\/admin\/auth\/confirm/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      "content",
      "no-referrer",
    );
  });
});
