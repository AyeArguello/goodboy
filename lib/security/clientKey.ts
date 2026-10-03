import "server-only";
import { headers } from "next/headers";
import { hashClientKey } from "@/lib/security/rateLimitKey";

/**
 * Best-effort caller identity for rate limiting — never used for anything
 * security-critical beyond that. HMACed before it ever leaves this process,
 * so the raw IP never reaches the database (see lib/security/rateLimitKey.ts).
 *
 * Where the address comes from depends on where the code runs:
 *  - On Netlify (`NETLIFY=true`) ONLY `x-nf-client-connection-ip` is used. The
 *    platform sets it itself, so a client cannot forge it. `x-forwarded-for`
 *    and `x-real-ip` are never trusted there — any caller can send them — so if
 *    the Netlify header is missing every such request shares the "unknown"
 *    bucket (fail closed) instead of picking its own identity.
 *  - Anywhere else (local development, CI, tests) there is no such platform, so
 *    `x-forwarded-for` (first entry) and `x-real-ip` remain available.
 */
export async function getClientKey(): Promise<string> {
  const h = await headers();
  const netlifyIp = h.get("x-nf-client-connection-ip")?.trim();
  const raw =
    process.env.NETLIFY === "true"
      ? netlifyIp || "unknown"
      : netlifyIp ||
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        "unknown";
  return hashClientKey(raw);
}
