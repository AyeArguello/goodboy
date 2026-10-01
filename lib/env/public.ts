import { z } from "zod";

/**
 * Public env vars are inlined into the client bundle at build time, so this
 * schema only covers values that are safe to ship to the browser.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .default("local-dev-anon-key"),
  NEXT_PUBLIC_FEATURE_DEPOSIT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_FEATURE_TURNSTILE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
});

/**
 * Parsed lazily (not at module load, and not cached) so `next dev` can boot
 * for pure front-end work before Supabase/env vars exist, and so tests can
 * exercise different env combinations in the same process.
 */
export function getPublicEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_FEATURE_DEPOSIT: process.env.NEXT_PUBLIC_FEATURE_DEPOSIT,
    NEXT_PUBLIC_FEATURE_TURNSTILE: process.env.NEXT_PUBLIC_FEATURE_TURNSTILE,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  });
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno públicas inválidas:\n${parsed.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  return parsed.data;
}
