import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatDayLabel } from "../lib/domain/datetime";
import { createHash, randomBytes } from "node:crypto";
import {
  anonClient,
  createTestAdminClient,
  nextWeekdayDateKey,
  serviceClient,
  validAppointmentPayload,
} from "../supabase/tests/helpers";

/**
 * Full customer journey, driven through the real UI on desktop and mobile:
 * request -> (admin approves) -> upload receipt with the secure link ->
 * pending verification -> (admin confirms) -> confirmed.
 *
 * The admin steps and the "email" are done directly against the database
 * (production password login and real email delivery aren't exercised): the test
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

// Booking (5 / 10 min) and status lookups (10 / min) are rate limited by caller
// IP; every test attempt gets its own address so retries and the two projects
// running in parallel never starve each other.
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
});

/**
 * Looks a code up on the status page. next dev hydrates late on a cold route, and a
 * click before hydration submits the form natively (and empties it), so the
 * fill + click + check is retried until the interactive page answers.
 */
async function lookupStatus(page: Page, code: string, expected: () => Locator) {
  await expect(async () => {
    await page.getByLabel("Código de solicitud").fill(code);
    await page.getByRole("button", { name: "Consultar" }).click();
    await expect(expected()).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 60_000 });
}

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
  const day = page.getByRole("radio", {
    name: new RegExp(`^${dayLabel}`, "i"),
  });
  if (!(await day.isVisible())) {
    // The picker shows one month at a time: switch to the day's month.
    const month = new Intl.DateTimeFormat("es-AR", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${dateKey}T12:00:00Z`));
    await page
      .getByRole("radiogroup", { name: "Mes" })
      .getByRole("radio", { name: new RegExp(`^${month}`, "i") })
      .click();
  }
  await day.click();
  await page.getByRole("radio", { name: new RegExp(`^${time}`) }).click();
}

/** Another person's request for the same turn, straight to the database. */
async function anonRpc(slotId: string) {
  return anonClient().rpc("request_appointment", {
    ...validAppointmentPayload(slotId),
    p_client_key: `e2e-other-person-${crypto.randomUUID()}`,
  });
}

async function fillWizard(page: Page, email: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nombre del perro").fill("Luna E2E");
  await page.getByRole("radio", { name: /Mediano/ }).click();
  await page
    .getByRole("radio", { name: /Pelos de crecimiento continuo/ })
    .click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("radio", { name: /Lo llevo yo/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Tu nombre").fill("Carolina E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("3511234567");
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
        .getByRole("radio", { name: /Pelos de crecimiento continuo/ })
        .click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("radio", { name: /Lo llevo yo/ }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByLabel("Tu nombre").fill("Carolina");
      await page.getByLabel("WhatsApp", { exact: true }).fill("3511234567");
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
      await lookupStatus(page, code, () =>
        page.getByText("Pendiente de revisión").first(),
      );

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

      await lookupStatus(page, code, () =>
        page.getByText("Esperando seña").first(),
      );

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
      await lookupStatus(page, code, () =>
        page
          .getByText(/Comprobante recibido, pendiente de verificación/)
          .first(),
      );

      // 6. The admin verifies and confirms.
      expect(
        (
          await admin.rpc("admin_confirm_deposit", {
            p_appointment_id: appt!.id,
          })
        ).error,
      ).toBeNull();
      await lookupStatus(page, code, () =>
        page.getByText("Confirmado").first(),
      );
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

  test("when somebody else takes the turn first, the second person is told and picks another", async ({
    page,
  }, info) => {
    requireSupabase();
    const mobile = info.project.name === "mobile-chrome";
    // Own day per project so the two projects never fight over the same slots.
    const dateKey = mobile
      ? nextWeekdayDateKey(430, 550)
      : nextWeekdayDateKey(300, 420);
    const takenTime = "09:00";
    const otherTime = "13:30";
    const svc = serviceClient();
    const makeSlot = async (time: string) => {
      const startsAt = `${dateKey}T${time}:00-03:00`;
      await svc.from("availability_slots").delete().eq("starts_at", startsAt);
      const { data } = await svc
        .from("availability_slots")
        .insert({ starts_at: startsAt, is_published: true })
        .select("id")
        .single();
      return data!.id as string;
    };
    const takenSlot = await makeSlot(takenTime);
    const otherSlot = await makeSlot(otherTime);
    const email = `e2e-race-${info.project.name}-${Date.now()}@example.com`;

    try {
      // The second person chooses the turn and fills in the whole request...
      await pickSlot(page, dateKey, takenTime);
      await fillWizard(page, email);

      // ...but somebody else requests that very turn first.
      const first = await anonRpc(takenSlot);
      expect(first.error).toBeNull();

      // Sending now is refused: the person is told, with the way back.
      await page.getByRole("button", { name: "Enviar solicitud" }).click();
      const notice = page.getByRole("alert").filter({
        hasText: "Ese turno ya fue tomado",
      });
      await expect(notice).toBeVisible({ timeout: 20_000 });
      await expect(notice).toContainText("Tus datos quedan guardados");
      await expect(
        page.getByRole("button", { name: "Elegir otro horario" }),
      ).toBeVisible();

      // The taken turn is gone from the list; another one is still there.
      await expect(
        page.getByRole("radio", { name: new RegExp(`^${takenTime}`) }),
      ).toHaveCount(0);
      await page
        .getByRole("radio", { name: new RegExp(`^${otherTime}`) })
        .click();

      // The data they had typed is still there: they can finish the request.
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByLabel("Nombre del perro")).toHaveValue("Luna E2E");
      for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: "Continuar" }).click();
      }
      await page.getByRole("button", { name: "Enviar solicitud" }).click();
      await expect(
        page.getByRole("heading", { name: "Recibimos tu solicitud" }),
      ).toBeVisible({ timeout: 20_000 });

      // Each turn ended up with exactly one request.
      for (const slotId of [takenSlot, otherSlot]) {
        const { count } = await svc
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("slot_id", slotId);
        expect(count).toBe(1);
      }
    } finally {
      await svc
        .from("appointments")
        .delete()
        .in("slot_id", [takenSlot, otherSlot]);
      await svc
        .from("availability_slots")
        .delete()
        .in("id", [takenSlot, otherSlot]);
    }
  });

  test("never indexes the personal link", async ({ page }) => {
    await page.goto("/turnos/comprobante");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
