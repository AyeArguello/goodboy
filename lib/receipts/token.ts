import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Receipt-upload link tokens: 256 random bits (base64url, 43 chars). The raw
 * token exists only in the email link; the database stores just its SHA-256
 * hex digest, so a database leak cannot be turned into working upload links.
 */
export const UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedUploadToken(token: unknown): token is string {
  return typeof token === "string" && UPLOAD_TOKEN_PATTERN.test(token);
}
