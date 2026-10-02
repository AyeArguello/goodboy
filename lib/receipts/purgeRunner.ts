import "server-only";
import {
  createSupabasePurgeDeps,
  runPurge,
  type PurgeSummary,
  type SupabaseLike,
} from "@/supabase/functions/_shared/purge";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Manual purge for the admin's maintenance screen. It runs the exact same
 * core as the daily Edge Function (supabase/functions/_shared/purge.ts), so
 * there is one behaviour to reason about. Callers must authorize the admin
 * first — this uses the service role.
 */
export async function runReceiptPurgeNow(): Promise<PurgeSummary> {
  const client = getServiceSupabaseClient();
  return runPurge(createSupabasePurgeDeps(client as unknown as SupabaseLike), {
    source: "admin",
  });
}
