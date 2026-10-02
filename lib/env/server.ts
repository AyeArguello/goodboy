import "server-only";
import { z } from "zod";

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

/**
 * Server-only secrets. Never import this file from a Client Component or
 * anything that could end up in the browser bundle — the `server-only`
 * import above makes that a build-time error if it happens by accident.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1)
    .default("local-dev-service-role-key"),
  /** HMACs the caller IP before it's used as a rate-limit key — see lib/security/rateLimitKey.ts. */
  RATE_LIMIT_HMAC_SECRET: z.string().min(1).default("local-dev-hmac-secret"),
  ADMIN_EMAIL_ALLOWLIST: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  OWNER_NOTIFICATION_EMAIL: z.string().email().optional(),
  /** Bank-transfer details shown in the approval email and on the upload page. Business data: never invented here. */
  DEPOSIT_TRANSFER_ALIAS: optionalText,
  DEPOSIT_TRANSFER_HOLDER: optionalText,
  DEPOSIT_TRANSFER_CBU: optionalText,
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export function getServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RATE_LIMIT_HMAC_SECRET: process.env.RATE_LIMIT_HMAC_SECRET,
    ADMIN_EMAIL_ALLOWLIST: process.env.ADMIN_EMAIL_ALLOWLIST,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    OWNER_NOTIFICATION_EMAIL: process.env.OWNER_NOTIFICATION_EMAIL,
    DEPOSIT_TRANSFER_ALIAS: process.env.DEPOSIT_TRANSFER_ALIAS,
    DEPOSIT_TRANSFER_HOLDER: process.env.DEPOSIT_TRANSFER_HOLDER,
    DEPOSIT_TRANSFER_CBU: process.env.DEPOSIT_TRANSFER_CBU,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno de servidor inválidas:\n${parsed.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  return parsed.data;
}
