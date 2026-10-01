"use server";

import { siteUrl } from "@/lib/config/business";
import { getServerEnv } from "@/lib/env/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type SendLoginLinkResult = { ok: true } | { ok: false; error: string };

/**
 * Pre-checks the admin allowlist server-side, *before* ever calling Supabase
 * Auth — so a non-allowlisted email never gets an OTP sent (no orphan auth
 * user created, no wasted email quota, no way to spam an arbitrary inbox
 * through this form). Always returns the same generic success either way,
 * so the response itself can never be used to enumerate valid admin emails
 * (see docs/auditoria-seguridad-y-cumplimiento-good-boy.md P1 "Login
 * admin server-side"). The callback route still re-checks the allowlist
 * independently — see app/admin/auth/callback/route.ts.
 */
export async function sendAdminLoginLink(
  rawEmail: string,
): Promise<SendLoginLinkResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ingresá un correo válido." };
  }

  try {
    const service = getServiceSupabaseClient();
    const { error } = await service.rpc("enforce_rate_limit", {
      p_key: `login:${email}`,
      p_max_per_window: 5,
      p_window: "15 minutes",
    });
    if (error) throw error;
  } catch {
    // Same generic response as a disallowed email — never reveal *why* a
    // request didn't go through, rate limit included.
    return { ok: true };
  }

  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return { ok: true };
  }

  const supabase = await getServerSupabaseClient();
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/admin/auth/callback` },
  });

  return { ok: true };
}
