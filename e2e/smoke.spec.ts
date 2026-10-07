import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("landing loads with hero, nav and footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Peluquería canina",
    );
    await expect(
      page.getByRole("link", { name: /solicitar turno/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    const gecLink = page.getByRole("link", {
      name: /visitar el sitio de gec soluciones digitales/i,
    });
    await expect(gecLink).toBeVisible();
    await expect(gecLink).toHaveAttribute("href", "https://gecdigital.dev/");
    await expect(gecLink).toHaveAttribute("target", "_blank");
  });

  test("header CTA navigates to the turnero", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Solicitar turno" }).click();
    await expect(page).toHaveURL(/\/turnos$/);
    await expect(
      page.getByRole("heading", { name: "Elegí día y horario" }),
    ).toBeVisible();
  });

  test("turnero step 1 shows either the picker or the no-availability empty state", async ({
    page,
  }) => {
    await page.goto("/turnos");
    const hasEmptyState = page.getByText(
      "Por ahora no hay horarios publicados",
    );
    const hasDayPicker = page.getByRole("radiogroup", { name: "Día" });
    await expect(hasEmptyState.or(hasDayPicker)).toBeVisible();
  });

  test("status lookup page renders its form", async ({ page }) => {
    await page.goto("/turnos/estado");
    await expect(
      page.getByRole("heading", { name: "Consultar estado" }),
    ).toBeVisible();
    await expect(page.getByLabel("Código de solicitud")).toBeVisible();
  });

  test("FAQ accordion opens and closes a panel", async ({ page }) => {
    await page.goto("/");
    const question = page.getByRole("button", {
      name: "¿Puedo pedir turno para hoy?",
    });
    await question.scrollIntoViewIfNeeded();
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "false");
  });

  test("mobile menu opens and its links are reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Menú" })
        .getByRole("link", { name: "Servicios" }),
    ).toBeVisible();
  });

  test("admin routes redirect to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/admin/hoy");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(
      page.getByRole("heading", { name: "Entrar al panel" }),
    ).toBeVisible();
  });

  test("keyboard focus is visible on the primary CTA", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Solicitar un turno" }).first();
    await cta.focus();
    await expect(cta).toBeFocused();
  });
});
