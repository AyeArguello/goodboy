import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";

/**
 * Anon-key client for Server Components that only ever read anonymized,
 * public data (available slots, FAQ-adjacent content). RLS denies this role
 * everything except the SECURITY DEFINER RPCs explicitly granted to `anon`
 * — see supabase/migrations. Never use this for anything that touches
 * `appointments` directly.
 */
export function getPublicSupabaseClient() {
  const env = getPublicEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
    },
  );
}
