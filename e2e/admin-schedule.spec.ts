import { expect, test, type Page } from "@playwright/test";
import { anonClient, serviceClient } from "../supabase/tests/helpers";
import {
  ADMIN_EMAILS,
  createAdmin,
  loginAs,
  removeAdmin,
  waitForHydration,
} from "./adminSession";

/**
 * The owner's schedule, driven through the real panel: the grid is already
 * there (nothing to publish by hand), she removes a slot and a whole day,
 * puts them back, and books a turn by hand on a free slot of the agenda.
 * Needs a reachable Supabase (the local Docker stack in CI); skips itself
 * when there isn't one so `pnpm test:e2e` still runs anywhere.
 */

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
      "CI must run the schedule journey against the local Supabase stack, but it is unreachable.",
    );
  }
  test.skip(true, "Needs a local Supabase stack");
}

const TZ = "America/Argentina/Cordoba";
function localParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    weekday: get("weekday"),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** The three slots of the first `weekday` at least 8 days ahead. */
async function slotsOfFirst(weekday: string) {
  const svc = serviceClient();
  await svc.rpc("ensure_default_slots", {});
  const { data } = await svc
    .from("availability_slots")
    .select("id, starts_at")
    .gt("starts_at", new Date(Date.now() + 8 * 24 * 3600_000).toISOString())
    .order("starts_at")
    .limit(120);
  const rows = (data ?? []).filter(
    (s) => localParts(s.starts_at).weekday === weekday,
  );
  const date = localParts(rows[0]!.starts_at).date;
  return {
    date,
    slots: rows.filter((s) => localParts(s.starts_at).date === date),
  };
}

async function publicSlotIds(): Promise<Set<string>> {
  const { data } = await anonClient().rpc("public_availability");
  return new Set((data ?? []).map((r: { slot_id: string }) => r.slot_id));
}

async function openDay(page: Page, dateKey: string) {
  await page.goto(`/admin/horarios?day=${dateKey}`);
  await expect(
    page.getByRole("heading", { name: "Horarios", level: 1 }),
  ).toBeVisible();
  await waitForHydration(page, 'button[role="switch"]');
}

test.describe("admin schedule", () => {
  // Both journeys sign in as the same account of their project.
  test.describe.configure({ mode: "serial" });

  test("the grid is already loaded; the owner removes and restores a slot and a day", async ({
    page,
  }, info) => {
    requireSupabase();
    const email = ADMIN_EMAILS[info.project.name]!;
    const svc = serviceClient();
    // Chromium works on a Tuesday and mobile on a Wednesday: the projects run
    // in parallel against one database.
    const { date, slots } = await slotsOfFirst(
      info.project.name === "chromium" ? "Tue" : "Wed",
    );
    expect(slots).toHaveLength(3);
    await createAdmin(email);

    try {
      await loginAs(page, email);
      await openDay(page, date);

      // Nothing was published by hand: all three times are there and offered.
      for (const time of ["09:00", "11:30", "13:30"]) {
        await expect(
          page.getByRole("switch", { name: new RegExp(`^${time}: atender`) }),
        ).toBeVisible();
      }
      const open = await publicSlotIds();
      for (const slot of slots) expect(open.has(slot.id)).toBe(true);

      // Remove one time: it disappears from the public list; restore it.
      await page.getByRole("switch", { name: /^11:30: atender/ }).click();
      await expect(
        page.getByRole("switch", { name: /^11:30: quitado/ }),
      ).toBeVisible();
      await expect(page.getByText("Quitado: no se ve en la web")).toBeVisible();
      expect((await publicSlotIds()).has(slots[1]!.id)).toBe(false);

      await page.getByRole("switch", { name: /^11:30: quitado/ }).click();
      await expect(
        page.getByRole("switch", { name: /^11:30: atender/ }),
      ).toBeVisible();
      expect((await publicSlotIds()).has(slots[1]!.id)).toBe(true);

      // Remove the whole day with a reason; reopen it.
      await page.getByRole("button", { name: "No atiendo este día" }).click();
      await page.getByLabel("Motivo (opcional)").fill("Feriado de prueba");
      await page.getByRole("button", { name: "Quitar el día" }).click();
      await expect(page.getByText("Este día está quitado")).toBeVisible();
      await expect(page.getByText(/Feriado de prueba/)).toBeVisible();
      const afterBlock = await publicSlotIds();
      for (const slot of slots) expect(afterBlock.has(slot.id)).toBe(false);

      await page.getByRole("button", { name: "Volver a abrir el día" }).click();
      await expect(page.getByText("Este día está quitado")).toHaveCount(0);
      const afterOpen = await publicSlotIds();
      for (const slot of slots) expect(afterOpen.has(slot.id)).toBe(true);
    } finally {
      await svc.from("blocked_dates").delete().eq("blocked_date", date);
      await svc
        .from("availability_slots")
        .update({ is_published: true })
        .in(
          "id",
          slots.map((s) => s.id),
        );
      await removeAdmin(email);
    }
  });

  test("the owner books a turn by hand on a free slot and the agenda reflects it", async ({
    page,
  }, info) => {
    requireSupabase();
    const email = ADMIN_EMAILS[info.project.name]!;
    const svc = serviceClient();
    const owner = `Marta E2E ${info.project.name}`;
    const { date, slots } = await slotsOfFirst(
      info.project.name === "chromium" ? "Thu" : "Fri",
    );
    const target = slots[0]!;
    await createAdmin(email);

    try {
      await loginAs(page, email);
      await page.goto(`/admin/turnos/nuevo?slot=${target.id}`);
      await expect(
        page.getByRole("heading", { name: "Cargar un turno a mano" }),
      ).toBeVisible();
      await waitForHydration(page, 'button[type="submit"]');

      // The slot arrives chosen, and only free times are offered.
      await expect(
        page.getByRole("radio", { name: /09:00/, checked: true }),
      ).toBeVisible();

      await page.getByLabel("Nombre del perro").fill("Toby E2E");
      await page.getByLabel("Nombre y apellido").fill(owner);
      await page.getByLabel(/^Teléfono/).fill("3511234567");
      await page.getByRole("button", { name: "Cargar turno" }).click();

      await page.waitForURL(/\/admin\/solicitudes\/[0-9a-f-]{36}/, {
        timeout: 30_000,
      });
      await expect(page.getByText("Toby E2E").first()).toBeVisible();

      const { data: appt } = await svc
        .from("appointments")
        .select("id, status, email, slot_id, owner_name")
        .eq("owner_name", owner)
        .single();
      expect(appt).toMatchObject({
        status: "confirmed",
        email: null,
        slot_id: target.id,
      });
      expect((await publicSlotIds()).has(target.id)).toBe(false);

      // The agenda shows it on that slot, and the slot can no longer be booked.
      await page.goto(`/admin/horarios?day=${date}`);
      await expect(page.getByRole("link", { name: /Toby E2E/ })).toBeVisible();
      await page.goto(`/admin/turnos/nuevo?slot=${target.id}`);
      await expect(
        page.getByRole("radio", { name: /09:00/, disabled: true }),
      ).toBeVisible();
    } finally {
      await svc.from("appointments").delete().eq("owner_name", owner);
      await removeAdmin(email);
    }
  });
});
