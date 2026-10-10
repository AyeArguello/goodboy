import "server-only";
import { getServerEnv } from "@/lib/env/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  RECOVERY_COOKIE_MAX_AGE_SECONDS,
  safeRecoveryDiagnostic,
  type RecoveryProblem,
} from "./recovery";

/** Attributes of the recovery marker cookie (HTTP-only, same-site only). */
export function recoveryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/admin",
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Called once Supabase has verified a recovery link and opened a session.
 * Only an allowlisted address may continue, and its admin_profiles row is
 * (re)created with the service role, exactly like the password login does.
 * Returns the problem to show, or null when the session may reset its password.
 */
export async function authorizeRecoveryUser(user: {
  id: string;
  email?: string | null;
}): Promise<RecoveryProblem | null> {
  const email = user.email?.toLowerCase();
  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!email || !ADMIN_EMAIL_ALLOWLIST.includes(email)) return "not_allowed";

  const { error } = await getServiceSupabaseClient()
    .from("admin_profiles")
    .upsert({ id: user.id, email });
  if (error) {
    console.error("Admin recovery profile bootstrap failed", {
      code: safeRecoveryDiagnostic(error).code,
    });
    return "failed";
  }
  return null;
}
