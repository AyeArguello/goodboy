// Daily purge of expired payment receipts. Scheduled with Supabase Cron — see
// supabase/schedule-purge-payment-receipts.sql. Idempotent: running it twice,
// or concurrently with the admin's manual run, is safe.
//
// Auth: the schedule sends `Authorization: Bearer <PURGE_CRON_SECRET>`. The
// function is deployed with verify_jwt = false (see supabase/config.toml), so
// this shared secret is the only gate; if it is not configured the function
// refuses to run rather than running open.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createSupabasePurgeDeps,
  runPurge,
  type SupabaseLike,
} from "../_shared/purge.ts";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("PURGE_CRON_SECRET");
  if (!secret) return json({ error: "not_configured" }, 500);

  const provided = (request.headers.get("authorization") ?? "").replace(
    /^Bearer /i,
    "",
  );
  // Compare digests so the comparison time does not depend on a matching prefix.
  if ((await sha256Hex(provided)) !== (await sha256Hex(secret))) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const injectedSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  let serviceKey: string | undefined;

  if (injectedSecretKeys) {
    try {
      const parsed = JSON.parse(injectedSecretKeys) as Record<string, unknown>;
      serviceKey =
        typeof parsed.default === "string" && parsed.default.length > 0
          ? parsed.default
          : undefined;
    } catch {
      return json({ error: "not_configured" }, 500);
    }
  } else {
    // Local Supabase still injects only the legacy key. Keep this fallback for
    // local development and CI while production prefers the revocable key.
    serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!url || !serviceKey) return json({ error: "not_configured" }, 500);

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const summary = await runPurge(
    createSupabasePurgeDeps(client as unknown as SupabaseLike),
    { source: "cron" },
  );
  return json(summary, summary.error ? 500 : 200);
});
