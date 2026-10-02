import "server-only";
import { headers } from "next/headers";
import { hashClientKey } from "@/lib/security/rateLimitKey";

/**
 * Best-effort caller identity for rate limiting — never used for anything
 * security-critical beyond that. HMACed before it ever leaves this process,
 * so the raw IP never reaches the database (see lib/security/rateLimitKey.ts).
 */
export async function getClientKey(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return hashClientKey(raw);
}
