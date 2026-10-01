import { describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  collectProductionEnvProblems,
} from "./productionGate";

const validEnv = {
  NEXT_PUBLIC_SITE_URL: "https://goodboy.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-not-real",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-real",
  ADMIN_EMAIL_ALLOWLIST: "owner@example.com",
  RATE_LIMIT_HMAC_SECRET: "test-hmac-secret-not-real-0123456789abcdef",
};

function problemsWith(overrides: Record<string, string | undefined>) {
  return collectProductionEnvProblems({ ...validEnv, ...overrides });
}

describe("collectProductionEnvProblems", () => {
  it("accepts a fully valid production env", () => {
    expect(collectProductionEnvProblems(validEnv)).toEqual([]);
    expect(() => assertProductionEnv(validEnv)).not.toThrow();
  });

  it("accepts several comma-separated allowlist emails", () => {
    expect(
      problemsWith({ ADMIN_EMAIL_ALLOWLIST: "a@example.com, b@example.com" }),
    ).toEqual([]);
  });

  it.each([
    ["NEXT_PUBLIC_SITE_URL", undefined],
    ["NEXT_PUBLIC_SITE_URL", "http://goodboy.example.com"],
    ["NEXT_PUBLIC_SITE_URL", "goodboy.com.ar"],
    ["NEXT_PUBLIC_SUPABASE_URL", undefined],
    ["NEXT_PUBLIC_SUPABASE_URL", "http://abcdefgh.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://127.0.0.1"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://localhost"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-dev-anon-key"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "two words"],
    ["SUPABASE_SERVICE_ROLE_KEY", undefined],
    ["SUPABASE_SERVICE_ROLE_KEY", "local-dev-service-role-key"],
    ["ADMIN_EMAIL_ALLOWLIST", undefined],
    ["ADMIN_EMAIL_ALLOWLIST", " , "],
    ["ADMIN_EMAIL_ALLOWLIST", "not-an-email"],
    ["ADMIN_EMAIL_ALLOWLIST", "ok@example.com, broken"],
    ["RATE_LIMIT_HMAC_SECRET", undefined],
    ["RATE_LIMIT_HMAC_SECRET", "local-dev-hmac-secret"],
    ["RATE_LIMIT_HMAC_SECRET", "too-short"],
  ])("rejects %s = %s", (name, value) => {
    const problems = problemsWith({ [name]: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });

  it("reports every problem at once when nothing is configured", () => {
    expect(collectProductionEnvProblems({})).toHaveLength(6);
  });

  it("never leaks a secret value in the error message", () => {
    const secret = "local-dev-service-role-key";
    expect(() =>
      assertProductionEnv({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: secret }),
    ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY sigue en el valor de desarrollo/);
    try {
      assertProductionEnv({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: secret });
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});
