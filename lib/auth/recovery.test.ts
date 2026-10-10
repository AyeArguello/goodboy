import { describe, expect, it } from "vitest";
import {
  classifyRecoveryError,
  parseRecoveryErrorParam,
  recoveryErrorParam,
  recoveryProblemMessage,
  safeRecoveryDiagnostic,
} from "./recovery";

describe("classifyRecoveryError", () => {
  it("recognises an expired or already used link", () => {
    expect(classifyRecoveryError({ code: "otp_expired" })).toBe("expired");
    expect(classifyRecoveryError({ code: "flow_state_not_found" })).toBe(
      "expired",
    );
    expect(
      classifyRecoveryError({
        message: "Email link is invalid or has expired",
      }),
    ).toBe("expired");
  });

  it("recognises a link opened in a different browser (missing PKCE verifier)", () => {
    expect(
      classifyRecoveryError({ name: "AuthPKCECodeVerifierMissingError" }),
    ).toBe("verifier");
    expect(
      classifyRecoveryError({
        message: "PKCE code verifier not found in storage",
      }),
    ).toBe("verifier");
  });

  it("falls back to a generic failure for anything else", () => {
    expect(classifyRecoveryError(null)).toBe("failed");
    expect(classifyRecoveryError(undefined)).toBe("failed");
    expect(classifyRecoveryError({ code: "unexpected_failure" })).toBe(
      "failed",
    );
    expect(classifyRecoveryError("boom")).toBe("failed");
  });
});

describe("recovery error query parameter", () => {
  it("round-trips every specific problem", () => {
    for (const problem of [
      "expired",
      "verifier",
      "not_allowed",
      "failed",
    ] as const) {
      expect(parseRecoveryErrorParam(recoveryErrorParam(problem))).toBe(
        problem,
      );
    }
  });

  it("treats the legacy value as a generic failure and ignores unrelated values", () => {
    expect(parseRecoveryErrorParam("recovery")).toBe("failed");
    expect(parseRecoveryErrorParam("not_allowed")).toBeNull();
    expect(parseRecoveryErrorParam("recovery_<script>")).toBeNull();
    expect(parseRecoveryErrorParam(undefined)).toBeNull();
  });

  it("has a distinct, actionable message per problem", () => {
    const messages = (
      ["expired", "verifier", "not_allowed", "failed"] as const
    ).map(recoveryProblemMessage);
    expect(new Set(messages).size).toBe(4);
    expect(recoveryProblemMessage("expired")).toMatch(/venció|ya se usó/);
    expect(recoveryProblemMessage("verifier")).toMatch(/mismo navegador/);
  });
});

describe("safeRecoveryDiagnostic", () => {
  it("keeps only the error class, code and status", () => {
    expect(
      safeRecoveryDiagnostic({
        name: "AuthApiError",
        code: "otp_expired",
        status: 403,
        message: "token abc123 for user@example.com expired",
        token: "abc123",
      }),
    ).toEqual({ name: "AuthApiError", code: "otp_expired", status: 403 });
  });

  it("tolerates non-objects", () => {
    expect(safeRecoveryDiagnostic(null)).toEqual({
      name: undefined,
      code: undefined,
      status: undefined,
    });
  });
});
