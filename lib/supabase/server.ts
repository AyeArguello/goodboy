import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

/**
 * Session-aware client for Server Actions and Server Components under
 * /admin. Forwards the signed-in user's cookies so RLS/RPC functions like
 * `is_admin()` see the real `auth.uid()` — this is what makes admin RPC
 * calls authorized without ever touching the service role key.
 */
export async function getServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — middleware.ts refreshes the
            // session cookie on the next request instead. Safe to ignore.
          }
        },
      },
    },
  );
}
