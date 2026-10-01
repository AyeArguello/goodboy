import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { getServerEnv } from "@/lib/env/server";

/**
 * Magic-link landing point. This — not Supabase's own signup gate — is the
 * real access-control checkpoint: an admin_profiles row (which is_admin()
 * checks) is only ever created here, and only for an allowlisted email.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await getServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      const email = data.user.email.toLowerCase();
      const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();

      if (ADMIN_EMAIL_ALLOWLIST.includes(email)) {
        const service = getServiceSupabaseClient();
        await service
          .from("admin_profiles")
          .upsert({ id: data.user.id, email });
        return NextResponse.redirect(new URL("/admin", url.origin));
      }

      await supabase.auth.signOut();
    }
  }

  return NextResponse.redirect(
    new URL("/admin/login?error=not_allowed", url.origin),
  );
}
