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
 * through this form). Disallowed addresses receive the same generic success,
 * so the normal response cannot be used to enumerate valid admin emails
 * (see docs/auditoria-seguridad-y-cumplimiento-good-boy.md P1 "Login
 * admin server-side"). Disallowed addresses still receive the same apparent
 * success; operational delivery errors are shown only after the allowlist
 * check so the real administrator is not left with a false confirmation. The
 * callback route still re-checks the allowlist independently — see
 * app/admin/auth/callback/route.ts.
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
    if (error) {
      if (error.message.includes("RATE_LIMITED")) return { ok: true };
      throw error;
    }
  } catch (error) {
    // Supabase Auth applies its own email/OTP limits. If the private limiter
    // is temporarily unavailable, continue with that provider-side backstop
    // instead of claiming that a link was sent when Auth was never called.
    console.error("Admin login pre-limit unavailable", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }

  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return { ok: true };
  }

  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/admin/auth/callback` },
  });

  if (error) {
    console.error("Admin magic-link delivery failed", {
      code: error.code,
      status: error.status,
    });
    return {
      ok: false,
      error:
        "No pudimos enviar el enlace. Esperá un minuto y volvé a intentarlo.",
    };
  }

  return { ok: true };
}
