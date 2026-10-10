/**
 * Shared pieces of the admin password-recovery flow. Pure on purpose (no
 * server-only imports) so they are unit-testable and safe to import from the
 * login page; the privileged work lives in `recoverySession.ts`.
 */

export type RecoveryProblem = "expired" | "verifier" | "not_allowed" | "failed";

/** Short-lived HTTP-only marker that lets the reset form change the password. */
export const RECOVERY_COOKIE = "admin-password-recovery";
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 10 * 60;

interface AuthErrorLike {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
}

/**
 * Maps a Supabase Auth failure to a problem the owner can act on. Anything
 * unrecognised is "failed": the safe, generic answer.
 */
export function classifyRecoveryError(error: unknown): RecoveryProblem {
  const candidate = (
    typeof error === "object" && error !== null ? error : {}
  ) as AuthErrorLike;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string"
      ? candidate.message.toLowerCase()
      : "";

  if (
    name === "AuthPKCECodeVerifierMissingError" ||
    /code verifier/.test(message)
  ) {
    return "verifier";
  }
  if (
    ["otp_expired", "flow_state_expired", "flow_state_not_found"].includes(
      code,
    ) ||
    /expired|invalid|not found|already been used|has been used/.test(message)
  ) {
    return "expired";
  }
  return "failed";
}

const MESSAGES: Record<RecoveryProblem, string> = {
  expired: "El enlace de recuperación venció o ya se usó. Pedí uno nuevo.",
  verifier:
    "Abrí el enlace en el mismo navegador donde pediste la recuperación, o pedí uno nuevo.",
  not_allowed: "La sesión no es válida o no tiene acceso al panel.",
  failed: "No pudimos validar el enlace de recuperación. Pedí uno nuevo.",
};

export function recoveryProblemMessage(problem: RecoveryProblem): string {
  return MESSAGES[problem];
}

/** Value of the `?error=` query parameter on /admin/login for a problem. */
export function recoveryErrorParam(problem: RecoveryProblem): string {
  return `recovery_${problem}`;
}

/**
 * Reads the login page's `?error=` value. The legacy `recovery` value (links
 * produced before the specific codes existed) means "failed".
 */
export function parseRecoveryErrorParam(
  value: string | undefined,
): RecoveryProblem | null {
  if (value === "recovery") return "failed";
  const match = /^recovery_(expired|verifier|not_allowed|failed)$/.exec(
    value ?? "",
  );
  return match ? (match[1] as RecoveryProblem) : null;
}

/**
 * Diagnostics that are safe to log: error class, Auth code and HTTP status
 * only. Never the token, the code, the email or the message text (which can
 * echo user input).
 */
export function safeRecoveryDiagnostic(error: unknown): {
  name?: string;
  code?: string;
  status?: number;
} {
  const candidate = (
    typeof error === "object" && error !== null ? error : {}
  ) as AuthErrorLike;
  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  };
}
