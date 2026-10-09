import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";

// These are the well-known, publicly documented demo JWTs that `supabase
// start` prints for every local stack — not a secret, and only valid
// against a local instance. Override via env if your local setup differs.
export const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

/**
 * SAFETY GUARD. This suite creates users, slots, appointments and payments
 * with the service role, and `resetTestData()` DELETES whole tables. It must
 * only ever run against a disposable local stack (`pnpm supabase:start`), so
 * this throws unless the URL's hostname is exactly 127.0.0.1 or localhost.
 * Never point SUPABASE_TEST_URL at a hosted project.
 */
export function assertLocalSupabaseUrl(url: string = SUPABASE_URL): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("Integration tests: SUPABASE_TEST_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Integration tests refuse to run against "${hostname}": only 127.0.0.1 or localhost (a local Docker Supabase stack) is allowed.`,
    );
  }
}

export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function serviceClient() {
  assertLocalSupabaseUrl();
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";

export const RECEIPTS_BUCKET = "payment-receipts";

/**
 * `supabase start` creates the bucket from supabase/config.toml; this makes
 * the suite independent of that (and of migration/storage start-up order).
 */
export async function ensureReceiptsBucket(
  svc: ReturnType<typeof serviceClient> = serviceClient(),
): Promise<void> {
  const { data } = await svc.storage.getBucket(RECEIPTS_BUCKET);
  if (data) return;
  const { error } = await svc.storage.createBucket(RECEIPTS_BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/** Removes every object the previous test left in the (local) receipts bucket. */
async function emptyReceiptsBucket(
  svc: ReturnType<typeof serviceClient>,
): Promise<void> {
  const { data } = await svc.storage
    .from(RECEIPTS_BUCKET)
    .list("r", { limit: 1000 });
  const paths = (data ?? []).map((o) => `r/${o.name}`);
  if (paths.length > 0) await svc.storage.from(RECEIPTS_BUCKET).remove(paths);
}

/**
 * Deletes all test data, children before parents, using the service role.
 * Runs before every test (see ./setup.ts) so tests don't depend on each
 * other's leftovers or on the shared "unknown" rate-limit key. Deliberately
 * leaves `admin_profiles` (and `business_settings`) alone: the admin client
 * created in a suite's `beforeAll` must stay authorized.
 *
 * LOCAL ONLY — refuses to run unless the target is 127.0.0.1/localhost.
 */
export async function resetTestData(): Promise<void> {
  assertLocalSupabaseUrl();
  const svc = serviceClient();
  await ensureReceiptsBucket(svc);
  await emptyReceiptsBucket(svc);
  // Tests may bend the business rules to be independent of the day of the week.
  const { error: settingsError } = await svc
    .from("business_settings")
    .update({ min_lead_hours: 24, cancellation_cutoff_hours: 48 })
    .eq("id", true);
  if (settingsError) {
    throw new Error(
      `resetTestData: could not restore business_settings: ${settingsError.message}`,
    );
  }
  const tables = [
    ["email_outbox", "id", NO_MATCH_UUID],
    ["receipt_purge_runs", "id", NO_MATCH_UUID],
    ["payment_receipts", "id", NO_MATCH_UUID],
    ["payment_upload_tokens", "id", NO_MATCH_UUID],
    ["appointment_events", "id", NO_MATCH_UUID],
    ["payments", "id", NO_MATCH_UUID],
    ["appointments", "id", NO_MATCH_UUID],
    ["availability_slots", "id", NO_MATCH_UUID],
    ["blocked_dates", "id", NO_MATCH_UUID],
    ["request_throttle", "key", ""],
  ] as const;
  for (const [table, column, noMatch] of tables) {
    const { error } = await svc.from(table).delete().neq(column, noMatch);
    if (error) {
      throw new Error(
        `resetTestData: could not clear ${table}: ${error.message}`,
      );
    }
  }
}

let adminCounter = 0;

/**
 * `is_admin()` inside the RPCs checks `auth.uid()`, which the service-role
 * key does NOT populate (service role bypasses RLS, but it isn't a signed-in
 * user). To actually exercise admin RPCs in a test we need a real signed-in
 * session: create an Auth user + matching admin_profiles row via the service
 * role, then sign in as that user with the anon client.
 */
export async function createTestAdminClient() {
  const svc = serviceClient();
  const email = `test-admin-${Date.now()}-${adminCounter++}@example.com`;
  const password = "Test1234!";

  const { data: userData, error: createError } =
    await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError) throw createError;

  const { error: profileError } = await svc
    .from("admin_profiles")
    .insert({ id: userData.user.id, email });
  if (profileError) throw profileError;

  const signedInClient = anonClient();
  const { error: signInError } = await signedInClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  return signedInClient;
}

// Argentina has used a fixed UTC-3 offset with no DST since 2009 — safe to
// hardcode here without pulling in a full IANA tz library just for tests.
const CORDOBA_UTC_OFFSET_HOURS = 3;
const WEEKDAY_TIMES = ["09:00", "11:30", "13:30"];
const SATURDAY_TIMES = ["11:00"];

function cordobaWallClockParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    y: Number(lookup.year),
    m: Number(lookup.month),
    d: Number(lookup.day),
  };
}

/** 0 = Sunday .. 6 = Saturday, from the Cordoba wall-clock calendar date. */
function cordobaWeekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Builds the UTC instant for a given Cordoba wall-clock date + "HH:MM". */
function cordobaWallClockToUtc(
  y: number,
  m: number,
  d: number,
  hhmm: string,
): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh! + CORDOBA_UTC_OFFSET_HOURS, mm!));
}

/**
 * Finds the first grid-valid slot start time (weekday 09:00/11:30/13:30,
 * Saturday 11:00 only, Sunday closed) whose offset from now falls within
 * `[minHoursFromNow, maxHoursFromNow]`. Needed because every
 * `availability_slots` write is now guarded by a day-of-week/time trigger
 * (see 20260101000006_v3_hardening.sql) — an arbitrary timestamp a fixed
 * number of hours from now almost never lands on an allowed time.
 */
export function nextValidSlotStartsAt(
  minHoursFromNow: number,
  maxHoursFromNow = minHoursFromNow + 24 * 10,
): string {
  const now = Date.now();
  const { y, m, d } = cordobaWallClockParts(new Date(now));

  // Scan up to 30 calendar days forward — comfortably more than enough to
  // find a match even across the largest possible gap (Sat 11:00 -> Mon 09:00).
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const candidateDate = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const parts = cordobaWallClockParts(candidateDate);
    const weekday = cordobaWeekday(parts.y, parts.m, parts.d);
    const times =
      weekday === 6 ? SATURDAY_TIMES : weekday === 0 ? [] : WEEKDAY_TIMES;

    for (const time of times) {
      const candidate = cordobaWallClockToUtc(parts.y, parts.m, parts.d, time);
      const hoursFromNow = (candidate.getTime() - now) / 3_600_000;
      if (hoursFromNow >= minHoursFromNow && hoursFromNow <= maxHoursFromNow) {
        return candidate.toISOString();
      }
    }
  }
  throw new Error(
    `nextValidSlotStartsAt: no grid-valid time found in [${minHoursFromNow}, ${maxHoursFromNow}]h from now`,
  );
}

/**
 * Finds a Monday-Friday date key (YYYY-MM-DD, Cordoba calendar) whose 09:00
 * slot falls within `[minHoursFromNow, maxHoursFromNow]` — for tests that
 * need to fill in *all three* of a specific weekday's grid times, which
 * `nextValidSlotStartsAt` alone can't guarantee (it may return a Saturday).
 */
export function nextWeekdayDateKey(
  minHoursFromNow: number,
  maxHoursFromNow: number,
): string {
  const now = Date.now();
  const { y, m, d } = cordobaWallClockParts(new Date(now));

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const candidateDate = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const parts = cordobaWallClockParts(candidateDate);
    const weekday = cordobaWeekday(parts.y, parts.m, parts.d);
    if (weekday === 0 || weekday === 6) continue;

    const morning = cordobaWallClockToUtc(parts.y, parts.m, parts.d, "09:00");
    const hoursFromNow = (morning.getTime() - now) / 3_600_000;
    if (hoursFromNow >= minHoursFromNow && hoursFromNow <= maxHoursFromNow) {
      return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    }
  }
  throw new Error(
    `nextWeekdayDateKey: no weekday found in [${minHoursFromNow}, ${maxHoursFromNow}]h from now`,
  );
}

/** Same as nextWeekdayDateKey, but for the next Saturday (checked at 11:00). */
export function nextSaturdayDateKey(
  minHoursFromNow: number,
  maxHoursFromNow: number,
): string {
  const now = Date.now();
  const { y, m, d } = cordobaWallClockParts(new Date(now));

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const candidateDate = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const parts = cordobaWallClockParts(candidateDate);
    if (cordobaWeekday(parts.y, parts.m, parts.d) !== 6) continue;

    const morning = cordobaWallClockToUtc(parts.y, parts.m, parts.d, "11:00");
    const hoursFromNow = (morning.getTime() - now) / 3_600_000;
    if (hoursFromNow >= minHoursFromNow && hoursFromNow <= maxHoursFromNow) {
      return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    }
  }
  throw new Error(
    `nextSaturdayDateKey: no Saturday found in [${minHoursFromNow}, ${maxHoursFromNow}]h from now`,
  );
}

/**
 * Creates a published, schedule-valid slot whose offset from now falls
 * within `[minHoursFromNow, maxHoursFromNow]` and returns its id. Defaults
 * to a generous 10-day search window when only a minimum is given — pass an
 * explicit `maxHoursFromNow` when a test needs the offset to stay on one
 * side of a specific threshold (e.g. the 48h cancellation cutoff).
 */
export async function createFutureSlot(
  minHoursFromNow = 48,
  maxHoursFromNow?: number,
): Promise<string> {
  const svc = serviceClient();
  const searchMaxHours = maxHoursFromNow ?? minHoursFromNow + 24 * 10;
  let searchMinHours = minHoursFromNow;

  // Two calls in one test must not collide on the same grid time. Advance
  // beyond the exact occupied instant instead of adding one hour at a time:
  // outside business hours, many consecutive hourly offsets resolve to the
  // same next grid slot (for example, Thursday afternoon -> Monday 09:00).
  for (let step = 0; step < 40; step++) {
    const startsAt = nextValidSlotStartsAt(searchMinHours, searchMaxHours);
    const { data, error } = await svc
      .from("availability_slots")
      .insert({ starts_at: startsAt, is_published: true })
      .select("id")
      .single();
    if (!error) return data.id as string;
    if (error.code !== "23505") throw error;

    const occupiedOffsetHours =
      (new Date(startsAt).getTime() - Date.now()) / 3_600_000;
    // One second is enough to exclude the occupied instant while preserving
    // every later schedule-valid time inside the caller's fixed window.
    searchMinHours = occupiedOffsetHours + 1 / 3_600;
  }
  throw new Error("createFutureSlot: no free grid slot in the window");
}

export const validAppointmentPayload = (slotId: string) => ({
  p_slot_id: slotId,
  p_dog_name: "Test",
  p_size_bucket: "mediano" as const,
  p_breed: null,
  p_coat_state: "largo" as const,
  p_service_package: "crecimiento_continuo" as const,
  p_notes: null,
  p_logistics_mode: "self" as const,
  p_neighborhood: null,
  p_pickup_address: null,
  p_owner_name: "Tester",
  p_phone_e164: "+5493511234567",
  p_email: "tester@example.com",
  p_consents: [
    {
      key: "orientative_price",
      version: 2,
      accepted_at: new Date().toISOString(),
    },
    {
      key: "deposit_and_cancellation",
      version: 2,
      accepted_at: new Date().toISOString(),
    },
    { key: "privacy", version: 2, accepted_at: new Date().toISOString() },
  ],
});
