import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../supabase/tests/helpers";
import { createAdmin, loginAs, removeAdmin } from "./adminSession";

// The gallery is one shared list (and the journey fills it up), so this runs
// in a single project; the layout on phones is covered by the unit tests.
const EMAIL = "ci-gallery-admin@example.com";
const MARK = "eeeeeeee-eeee-4eee-8eee-";
const CAPTION_PREFIX = "Foto de prueba E2E";
// Unique per run, so a photo left behind by an interrupted run never gets in the way.
const CAPTION = `${CAPTION_PREFIX} ${Date.now()}`;

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "shared gallery state");

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A small solid-colour PNG, built in memory so no fixture file is needed. */
function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [180, 140, 200]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function counter(page: Page): Promise<number> {
  const text = await page.getByText(/^\d+ de 25 fotos$/).innerText();
  return Number(text.split(" ")[0]);
}

/** Removes any photo this spec uploaded, files included. */
async function removeUploadedPhotos() {
  const db = serviceClient();
  const { data } = await db
    .from("gallery_photos")
    .select("id, storage_path")
    .like("caption", `${CAPTION_PREFIX}%`);
  if (!data?.length) return;
  await db.storage.from("gallery").remove(data.map((p) => p.storage_path));
  await db
    .from("gallery_photos")
    .delete()
    .in(
      "id",
      data.map((p) => p.id),
    );
}

async function removeMarkerRows() {
  await serviceClient()
    .from("gallery_photos")
    .delete()
    .like("storage_path", `g/${MARK}%`);
}

// One sign-in for both journeys (the project does not log in twice in a row).
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== "chromium") return;
  await removeUploadedPhotos();
  await createAdmin(EMAIL);
  page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await loginAs(page, EMAIL);
});

test.afterAll(async ({}, testInfo) => {
  // The phone project skips this file; it must not remove the admin the other one is using.
  if (testInfo.project.name !== "chromium") return;
  await page?.close();
  await removeMarkerRows();
  await removeUploadedPhotos();
  await removeAdmin(EMAIL);
});

test("the admin adds a photo, it shows on the site, and removing it deletes the file", async () => {
  await page.goto("/admin/galeria");
  const before = await counter(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "perro.png",
    mimeType: "image/png",
    buffer: solidPng(120, 180),
  });
  await page.getByLabel(/^Descripción/).fill(CAPTION);
  await page.getByRole("button", { name: "Subir a la galería" }).click();

  await expect(page.getByText("Foto agregada a la galería.")).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => counter(page)).toBe(before + 1);
  const thumb = page.getByRole("img", { name: CAPTION });
  await expect(thumb).toBeVisible();
  const src = await thumb.getAttribute("src");

  // The photo is stored in the public bucket and served from there.
  const stored = await page.request.get(src!);
  expect(stored.ok()).toBe(true);
  expect(stored.headers()["content-type"]).toMatch(/image\/(webp|jpeg)/);

  // The public gallery shows it.
  await page.goto("/galeria");
  await expect(page.getByRole("img", { name: CAPTION })).toBeAttached();

  // Removing it takes it out of the gallery and out of Storage.
  await page.goto("/admin/galeria");
  await page.getByRole("button", { name: `Quitar foto: ${CAPTION}` }).click();
  await page.getByRole("button", { name: "Sí, quitar" }).click();
  await expect(page.getByText("Foto quitada de la galería.")).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => counter(page)).toBe(before);
  await expect(page.getByRole("img", { name: CAPTION })).toHaveCount(0);
  await expect
    .poll(async () => (await page.request.get(src!)).ok())
    .toBe(false);
});

test("no more than 25 photos can be added", async () => {
  const db = serviceClient();
  const { count } = await db
    .from("gallery_photos")
    .select("id", { count: "exact", head: true });
  const rows = Array.from(
    { length: Math.max(0, 25 - (count ?? 0)) },
    (_, i) => ({
      storage_path: `g/${MARK}${String(i + 1).padStart(12, "0")}.webp`,
      caption: "relleno",
      width: 100,
      height: 100,
    }),
  );
  if (rows.length > 0) {
    const { error } = await db.from("gallery_photos").insert(rows);
    expect(error, JSON.stringify(error)).toBeNull();
  }

  await page.goto("/admin/galeria");

  // The first visit compiles the page when the dev server is busy.
  await expect(page.getByText("25 de 25 fotos")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("La galería está completa")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Subir a la galería" }),
  ).toHaveCount(0);

  await removeMarkerRows();
});
