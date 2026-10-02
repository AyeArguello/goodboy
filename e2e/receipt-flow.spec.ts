import { expect, test, type Page } from "@playwright/test";
import { formatDayLabel } from "../lib/domain/datetime";
import { createHash, randomBytes } from "node:crypto";
import {
  createTestAdminClient,
  nextWeekdayDateKey,
  serviceClient,
} from "../supabase/tests/helpers";

/**
 * Full customer journey, driven through the real UI on desktop and mobile:
 * request -> (admin approves) -> upload receipt with the secure link ->
 * pending verification -> (admin confirms) -> confirmed.
 *
 * The admin steps and the "email" are done directly against the database
 * (magic-link login and real email delivery can't be automated): the test
 * issues the upload link exactly like the app does when it sends the email.
 * Needs a reachable Supabase (the local Docker stack in CI); it skips itself
 * when there isn't one so `pnpm test:e2e` still runs anywhere.
 */

// Playwright cannot import the app's server-only modules, so the link token is
// generated here exactly like lib/receipts/token.ts does (256 random bits,
// only the SHA-256 hex digest is sent to the database).
const generateUploadToken = () => randomBytes(32).toString("base64url");
const hashUploadToken = (t: string) =>
  createHash("sha256").update(t, "utf8").digest("hex");
const JPEG = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01,
  ...Array.from({ length: 2048 }, (_, i) => i % 251),
]);
const PDF = new TextEncoder().encode("%PDF-1.7 not an image");

const TIMES: Record<string, string> = {
  chromium: "09:00",
  "mobile-chrome": "13:30",
};

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

/**
 * Locally the journey skips itself when there is no Supabase; in CI a missing
 * stack is a FAILURE, never a silent skip.
 */
function requireSupabase() {
  if (supabaseUp) return;
  if (process.env.CI) {
    throw new Error(
      "CI must run the receipt journey against the local Supabase stack, but it is unreachable.",
    );
  }
  test.skip(true, "Needs a local Supabase stack");
}

async function pickSlot(page: Page, dateKey: string, time: string) {
  const dayLabel = formatDayLabel(new Date(`${dateKey}T12:00:00-03:00`));
  await page.goto("/turnos");
  await page
    .getByRole("radio", { name: new RegExp(`^${dayLabel}`, "i") })
    .click();
  await page.getByRole("radio", { name: new RegExp(`^${time}`) }).click();
}

async function fillWizard(page: Page, email: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nombre del perro").fill("Luna E2E");
  await page.getByRole("radio", { name: /Mediano/ }).click();
  await page
    .getByRole("radio", { name: /Mantos de crecimiento continuo/ })
    .click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("radio", { name: /Lo llevo yo/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Tu nombre").fill("Carolina E2E");
  await page.getByLabel("WhatsApp").fill("3511234567");
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("button", { name: "Continuar" }).click();
  for (const name of [
    /Precio orientativo/,
    /Seña y cancelación/,
    /Privacidad/,
  ]) {
    await page.getByRole("checkbox", { name }).click();
  }
  await page.getByRole("button", { name: "Continuar" }).click();
}

test.describe("receipt journey (needs Supabase)", () => {
  test.describe.configure({ mode: "serial" });

  test("the email is required to request a turn", async ({ page }, info) => {
    requireSupabase();
    const time = TIMES[info.project.name]!;
    const dateKey = nextWeekdayDateKey(120, 240);
    const svc = serviceClient();
    const startsAt = `${dateKey}T${time}:00-03:00`;
    await svc.from("availability_slots").delete().eq("starts_at", startsAt);
    const { data: slot } = await svc
      .from("availability_slots")
      .insert({ starts_at: startsAt, is_published: true })
      .select("id")
      .single();

    try {
      await pickSlot(page, dateKey, time);
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByLabel("Nombre del perro").fill("Luna");
      await page.getByRole("radio", { name: /Mediano/ }).click();
      await page
        .getByRole("radio", { name: /Mantos de crecimiento continuo/ })
        .click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("radio", { name: /Lo llevo yo/ }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByLabel("Tu nombre").fill("Carolina");
      await page.getByLabel("WhatsApp").fill("3511234567");
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByText(/Escribí tu correo/)).toBeVisible();
      await page.getByLabel("Correo").fill("no-es-un-correo");
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByText(/Revisá el correo/)).toBeVisible();
    } finally {
      await svc.from("availability_slots").delete().eq("id", slot!.id);
    }
  });

  test("request -> approve -> upload receipt -> verify -> confirmed", async ({
    page,
  }, info) => {
    requireSupabase();
    const time = TIMES[info.project.name]!;
    const dateKey = nextWeekdayDateKey(120, 240);
    const startsAt = `${dateKey}T${time}:00-03:00`;
    const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
    const svc = serviceClient();
    const admin = await createTestAdminClient();

    await svc.from("availability_slots").delete().eq("starts_at", startsAt);
    const { data: slot } = await svc
      .from("availability_slots")
      .insert({ starts_at: startsAt, is_published: true })
      .select("id")
      .single();

    try {
      // 1. The customer requests the turn through the real wizard.
      await pickSlot(page, dateKey, time);
      await fillWizard(page, email);
      await page.getByRole("button", { name: "Enviar solicitud" }).click();
      await expect(
        page.getByRole("heading", { name: "Recibimos tu solicitud" }),
      ).toBeVisible();
      await expect(
        page.getByText("Pendiente de revisión").first(),
      ).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      const code = (
        await page
          .getByText(/^GB-[A-Z0-9]{8}$/)
          .first()
          .innerText()
      ).trim();

      const { data: appt } = await svc
        .from("appointments")
        .select("id, status, email")
        .eq("code", code)
        .single();
      expect(appt).toMatchObject({ status: "pending_review", email });

      // 2. Status page: pending review.
      await page.goto("/turnos/estado");
      await page.getByLabel("Código de solicitud").fill(code);
      await page.getByRole("button", { name: "Consultar" }).click();
      await expect(
        page.getByText("Pendiente de revisión").first(),
      ).toBeVisible();

      // 3. The admin approves; the app would now email the link — issue it the same way.
      expect(
        (
          await admin.rpc("admin_approve_request", {
            p_appointment_id: appt!.id,
          })
        ).error,
      ).toBeNull();
      const token = generateUploadToken();
      expect(
        (
          await admin.rpc("admin_issue_upload_token", {
            p_appointment_id: appt!.id,
            p_token_hash: hashUploadToken(token),
          })
        ).error,
      ).toBeNull();

      await page.getByLabel("Código de solicitud").fill(code);
      await page.getByRole("button", { name: "Consultar" }).click();
      await expect(page.getByText("Esperando seña").first()).toBeVisible();

      // 4. Secure link: a bad file is rejected with a clear message, then a real image is uploaded.
      await page.goto(`/turnos/comprobante#t=${token}`);
      await expect(
        page.getByRole("heading", { name: "Comprobante de la seña" }),
      ).toBeVisible();
      await expect(page.getByText("Luna E2E")).toBeVisible();
      await expect(page.getByText("ARS 20.000").first()).toBeVisible();

      await page.getByLabel("Imagen del comprobante").setInputFiles({
        name: "documento.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(PDF),
      });
      await expect(page.getByText(/JPG, PNG o WebP/).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Enviar comprobante" }),
      ).toBeDisabled();
      await page.getByRole("button", { name: /Quitar documento\.pdf/ }).click();

      await page.getByLabel("Imagen del comprobante").setInputFiles({
        name: "transferencia.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(JPEG),
      });
      await page.getByLabel(/Referencia de la operación/).fill("OP-E2E-1");
      await page.getByRole("button", { name: "Enviar comprobante" }).click();
      await expect(
        page
          .getByText("Comprobante recibido, pendiente de verificación")
          .first(),
      ).toBeVisible({ timeout: 20_000 });

      // The upload alone did NOT confirm anything.
      const { data: pending } = await svc
        .from("appointments")
        .select("status")
        .eq("id", appt!.id)
        .single();
      expect(pending!.status).toBe("awaiting_deposit");
      const { data: receipts } = await svc
        .from("payment_receipts")
        .select("status, reference, storage_path")
        .eq("appointment_id", appt!.id);
      expect(receipts).toHaveLength(1);
      expect(receipts![0]).toMatchObject({
        status: "pending_verification",
        reference: "OP-E2E-1",
      });
      expect(receipts![0]!.storage_path).toMatch(/^r\/[0-9a-f-]{36}\.jpg$/);

      // The link is single-use: reopening it shows the pending state, not the form.
      await page.reload();
      await expect(
        page
          .getByText("Comprobante recibido, pendiente de verificación")
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Enviar comprobante" }),
      ).toHaveCount(0);

      // 5. Status page now says so.
      await page.goto("/turnos/estado");
      await page.getByLabel("Código de solicitud").fill(code);
      await page.getByRole("button", { name: "Consultar" }).click();
      await expect(
        page
          .getByText(/Comprobante recibido, pendiente de verificación/)
          .first(),
      ).toBeVisible();

      // 6. The admin verifies and confirms.
      expect(
        (
          await admin.rpc("admin_confirm_deposit", {
            p_appointment_id: appt!.id,
          })
        ).error,
      ).toBeNull();
      await page.getByLabel("Código de solicitud").fill(code);
      await page.getByRole("button", { name: "Consultar" }).click();
      await expect(page.getByText("Confirmado").first()).toBeVisible();
      await expect(page.getByText(/Turno confirmado/).first()).toBeVisible();

      // The old link now says the turn is already confirmed.
      await page.goto(`/turnos/comprobante#t=${token}`);
      await expect(page.getByText("Turno confirmado").first()).toBeVisible();
    } finally {
      await svc.from("appointments").delete().eq("email", email);
      await svc.from("availability_slots").delete().eq("id", slot!.id);
    }
  });
});

test.describe("receipt page without a valid link", () => {
  test("shows a clear message when the link is missing", async ({ page }) => {
    await page.goto("/turnos/comprobante");
    await expect(
      page.getByRole("heading", { name: "Comprobante de la seña" }),
    ).toBeVisible();
    await expect(page.getByText("Falta el enlace")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar comprobante" }),
    ).toHaveCount(0);
  });

  test("shows a clear message when the link is malformed", async ({ page }) => {
    await page.goto("/turnos/comprobante#t=not-a-real-token");
    await expect(page.getByText("No pudimos abrir este enlace")).toBeVisible();
    await expect(
      page.getByText(/no es válido o está incompleto/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar comprobante" }),
    ).toHaveCount(0);
  });

  test("never indexes the personal link", async ({ page }) => {
    await page.goto("/turnos/comprobante");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
