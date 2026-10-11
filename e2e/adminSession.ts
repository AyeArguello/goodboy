import type { Page } from "@playwright/test";
import { serviceClient } from "../supabase/tests/helpers";

/**
 * Shared by the admin journeys: a real Auth user per Playwright project (the
 * two projects run in parallel, so they must not share an account), signed in
 * through the real login form. Each journey file has its own pair of
 * addresses (files also run in parallel); CI lists all of them in
 * ADMIN_EMAIL_ALLOWLIST and a local .env.local needs them too.
 */
export const ADMIN_EMAILS: Record<string, string> = {
  chromium: "ci-schedule-admin@example.com",
  "mobile-chrome": "ci-schedule-admin-mobile@example.com",
};
export const ADMIN_PASSWORD = "E2E-Admin-Password-2026!";

export async function removeAdmin(email: string) {
  const svc = serviceClient();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email?.toLowerCase() !== email) continue;
    await svc.from("admin_profiles").delete().eq("id", user.id);
    await svc.auth.admin.deleteUser(user.id);
  }
}

export async function createAdmin(email: string) {
  await removeAdmin(email);
  const { error } = await serviceClient().auth.admin.createUser({
    email,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
}

/** Waits until React has hydrated the element (a click or fill before that is lost). */
export async function waitForHydration(page: Page, selector: string) {
  const handle = await page.locator(selector).first().elementHandle();
  await page.waitForFunction(
    (element) =>
      Object.keys(element as Element).some((key) =>
        key.startsWith("__reactProps"),
      ),
    handle,
    { timeout: 30_000 },
  );
}

export async function loginAs(page: Page, email: string) {
  await page.addInitScript(() => sessionStorage.setItem("gb-intro", "1"));
  await page.goto("/admin/login");
  await waitForHydration(page, 'button[type="submit"]');
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/admin\/hoy/, { timeout: 30_000 });
}
