import { expect, test, type Page } from "@playwright/test";

const skipIntro = (page: Page) =>
  page.addInitScript(() => sessionStorage.setItem("gb-intro", "1"));

test.describe("first-visit intro", () => {
  test("shows the animated logo with the business line, closes on click and is not repeated", async ({
    page,
  }) => {
    await page.goto("/");
    const intro = page.getByRole("status", { name: /peluquería canina/i });

    await expect(intro).toBeVisible();
    // The line is spelled out letter by letter (hidden from assistive technology)
    // next to a plain-text copy for screen readers, so two nodes carry the text.
    await expect(intro.getByText("Peluquería canina").first()).toBeVisible();
    await expect(intro.getByText("Baño, secado y corte")).toBeVisible();
    await expect(intro.getByRole("img")).toBeVisible();

    await intro.click();
    await expect(intro).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Peluquería canina",
    );

    // Same session, same tab: it does not come back.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(intro).toHaveCount(0);
  });

  test("closes by itself once the page has loaded", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByRole("status", { name: /peluquería canina/i });
    await expect(intro).toBeVisible();
    await expect(intro).toBeHidden({ timeout: 10_000 });
  });

  test("can be dismissed with the keyboard", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByRole("status", { name: /peluquería canina/i });
    await expect(intro).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(intro).toBeHidden();
  });

  test("never covers the other pages", async ({ page }) => {
    await page.goto("/turnos", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("status", { name: /peluquería canina/i }),
    ).toHaveCount(0);
  });
});

test.describe("home layout and motion", () => {
  test("has no horizontal scroll from phone to desktop widths", async ({
    page,
  }) => {
    await skipIntro(page);
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `width ${width}`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("the hero shows all of its content, including with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // With reduced motion the intro is only a short fade and the hero is static.
    await expect(
      page.getByRole("status", { name: /peluquería canina/i }),
    ).toBeHidden({ timeout: 10_000 });

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText("Peluquería canina");
    await expect(h1).toContainText("con atención personalizada en");
    await expect(h1).toContainText("Córdoba Capital");
    // The request and WhatsApp buttons are not in the first screen: they come
    // after how it works, what is done and the prices.
    const hero = page.locator("#inicio");
    await expect(
      hero.getByRole("link", { name: "Solicitar un turno" }),
    ).toHaveCount(0);
    await expect(
      hero.getByRole("link", { name: "Hablar por WhatsApp" }),
    ).toHaveCount(0);
    await expect(page.getByAltText(/perro recién bañado/i)).toBeVisible();
  });

  test("content below the fold is readable once scrolled to", async ({
    page,
  }) => {
    await skipIntro(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const heading = page.getByRole("heading", {
      name: "Cinco pasos, con tiempo",
    });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
    await expect(page.getByText("Elegís un horario")).toBeVisible();
  });

  test("the footer credit is a single link holding the logo and the text", async ({
    page,
  }) => {
    await skipIntro(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const credit = page.getByRole("link", {
      name: /sitio realizado por gec soluciones digitales/i,
    });
    await credit.scrollIntoViewIfNeeded();
    await expect(credit).toBeVisible();
    await expect(credit.locator("img")).toBeVisible();
    await expect(credit.getByText("GEC Soluciones Digitales")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /gec soluciones digitales/i }),
    ).toHaveCount(1);
  });
});

test.describe("home reading order", () => {
  test("how it works, what is done and prices come before the contact buttons", async ({
    page,
  }) => {
    await page.addInitScript(() => sessionStorage.setItem("gb-intro", "1"));
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const order = await page.evaluate(() =>
      ["inicio", "como-funciona", "servicios", "precios", "acciones"].map(
        (id) => document.getElementById(id)?.getBoundingClientRect().top ?? NaN,
      ),
    );
    expect(order.every((top) => Number.isFinite(top))).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // The contact block holds both buttons. (The gallery section is left out of
    // the order check: it only exists when the database has photos.)
    const actions = page.locator("#acciones");
    await expect(
      actions.getByRole("link", { name: "Solicitar un turno" }),
    ).toBeAttached();
    await expect(
      actions.getByRole("link", { name: "Hablar por WhatsApp" }),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: /Escribinos por WhatsApp/ }),
    ).toHaveCount(0);

    // Once the reader gets there, the floating button shows up.
    await actions.scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("link", { name: /Escribinos por WhatsApp/ }),
    ).toBeVisible();
  });
});
