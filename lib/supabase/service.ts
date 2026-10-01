import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

/**
 * Service-role client — bypasses RLS entirely. Use only for trusted,
 * narrowly-scoped server-side jobs (e.g. the new-request owner notification)
 * that have no reason to go through a user session. Never send this client,
 * or anything derived from it, to a Client Component.
 */
export function getServiceSupabaseClient() {
  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
}
