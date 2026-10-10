import { NextResponse } from "next/server";
import {
  RECOVERY_COOKIE,
  classifyRecoveryError,
  recoveryErrorParam,
  safeRecoveryDiagnostic,
  type RecoveryProblem,
} from "@/lib/auth/recovery";
import {
  authorizeRecoveryUser,
  recoveryCookieOptions,
} from "@/lib/auth/recoverySession";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Landing point of a recovery link sent with Supabase's default template (PKCE:
 * the link carries `?code=` and only the browser that requested the recovery
 * holds the matching verifier cookie). The customised template points at
 * /admin/auth/confirm instead, which does not depend on that cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const toLogin = (problem: RecoveryProblem) =>
    NextResponse.redirect(
      new URL(`/admin/login?error=${recoveryErrorParam(problem)}`, url.origin),
    );

  // An expired or already-used link comes back as ?error_code=otp_expired
  // (with no `code`), which is a different problem from a missing parameter.
  const linkError = url.searchParams.get("error_code");
  if (linkError) {
    console.error("Admin password-recovery link rejected", {
      code: linkError,
    });
    return toLogin(classifyRecoveryError({ code: linkError }));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    console.error("Admin password-recovery link opened without a code");
    return toLogin("failed");
  }

  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error(
      "Admin password-recovery code exchange failed",
      safeRecoveryDiagnostic(error),
    );
    await supabase.auth.signOut();
    return toLogin(classifyRecoveryError(error));
  }

  const problem = await authorizeRecoveryUser(data.user);
  if (problem) {
    await supabase.auth.signOut();
    return toLogin(problem);
  }

  const response = NextResponse.redirect(
    new URL("/admin/restablecer", url.origin),
  );
  response.cookies.set(RECOVERY_COOKIE, "allowed", recoveryCookieOptions());
  return response;
}
