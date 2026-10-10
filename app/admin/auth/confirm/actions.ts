"use server";

import { cookies } from "next/headers";
import {
  RECOVERY_COOKIE,
  classifyRecoveryError,
  recoveryProblemMessage,
  safeRecoveryDiagnostic,
  type RecoveryProblem,
} from "@/lib/auth/recovery";
import {
  authorizeRecoveryUser,
  recoveryCookieOptions,
} from "@/lib/auth/recoverySession";
import { getClientKey } from "@/lib/security/clientKey";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type ConfirmRecoveryResult =
  { ok: true } | { ok: false; problem: RecoveryProblem; error: string };

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;

function failure(problem: RecoveryProblem): ConfirmRecoveryResult {
  return { ok: false, problem, error: recoveryProblemMessage(problem) };
}

/**
 * Exchanges the one-time `token_hash` of a recovery email for a session.
 * It runs from a button on /admin/auth/confirm, not on page load: mail
 * scanners and link previews open links with GET and would otherwise burn the
 * single-use token before the owner clicks. The token hash is verified by
 * Supabase (`verifyOtp`), so, unlike the PKCE code, it works when the email
 * is opened on another device or browser.
 */
export async function confirmAdminRecovery(
  tokenHash: string,
  type: string,
): Promise<ConfirmRecoveryResult> {
  if (type !== "recovery" || !TOKEN_HASH_PATTERN.test(tokenHash)) {
    return failure("expired");
  }

  try {
    const clientKey = await getClientKey();
    const { error } = await getServiceSupabaseClient().rpc(
      "enforce_rate_limit",
      {
        p_key: `admin-recovery-confirm:ip:${clientKey}`,
        p_max_per_window: 10,
        p_window: "15 minutes",
      },
    );
    if (error) throw error;
  } catch (error) {
    // Fails closed, like the password endpoints.
    console.error(
      "Admin recovery-confirm pre-limit unavailable",
      safeRecoveryDiagnostic(error),
    );
    return failure("failed");
  }

  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (error || !data.user) {
    console.error(
      "Admin password-recovery token verification failed",
      safeRecoveryDiagnostic(error),
    );
    await supabase.auth.signOut();
    return failure(classifyRecoveryError(error));
  }

  const problem = await authorizeRecoveryUser(data.user);
  if (problem) {
    await supabase.auth.signOut();
    return failure(problem);
  }

  (await cookies()).set(RECOVERY_COOKIE, "allowed", recoveryCookieOptions());
  return { ok: true };
}
