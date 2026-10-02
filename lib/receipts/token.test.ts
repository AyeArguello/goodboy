import { describe, expect, it } from "vitest";
import {
  generateUploadToken,
  hashUploadToken,
  isWellFormedUploadToken,
} from "./token";

describe("upload tokens", () => {
  it("generates 256-bit url-safe tokens that are never repeated", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateUploadToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(t, "base64url")).toHaveLength(32);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it("hashes to a 64-char hex SHA-256 that differs from the token", () => {
    const t = generateUploadToken();
    const h = hashUploadToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashUploadToken(t)).toBe(h);
    expect(hashUploadToken(generateUploadToken())).not.toBe(h);
  });

  it("matches the SHA-256 of a known value", () => {
    expect(hashUploadToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("recognises only well-formed tokens", () => {
    expect(isWellFormedUploadToken(generateUploadToken())).toBe(true);
    expect(isWellFormedUploadToken("short")).toBe(false);
    expect(isWellFormedUploadToken("a".repeat(44))).toBe(false);
    expect(isWellFormedUploadToken("a".repeat(42) + "!")).toBe(false);
    expect(isWellFormedUploadToken(undefined)).toBe(false);
    expect(isWellFormedUploadToken(123)).toBe(false);
  });
});
