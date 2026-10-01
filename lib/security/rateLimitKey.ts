import "server-only";
import { createHmac } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

/**
 * HMACs a caller identity (typically an IP address) before it's ever stored
 * or sent anywhere, so raw IPs never end up in `request_throttle` — see
 * docs/auditoria-seguridad-y-cumplimiento-good-boy.md P1 "Rate limiter
 * privado". The secret is rotatable via `RATE_LIMIT_HMAC_SECRET`; rotating it
 * simply resets everyone's rate-limit window instead of leaking anything.
 */
export function hashClientKey(raw: string): string {
  const { RATE_LIMIT_HMAC_SECRET } = getServerEnv();
  return createHmac("sha256", RATE_LIMIT_HMAC_SECRET).update(raw).digest("hex");
}
