import { describe, expect, it } from "vitest";
import { generateAppointmentCode, isValidAppointmentCodeFormat } from "./code";

describe("generateAppointmentCode", () => {
  it("matches GB-XXXX with no ambiguous characters", () => {
    const code = generateAppointmentCode();
    expect(code).toMatch(/^GB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  });

  it("never contains 0, O, 1 or I", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAppointmentCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("is not sequential across many generations (basic entropy sanity check)", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateAppointmentCode()),
    );
    // With 32^8 ≈ 1.1 * 10^12 possibilities, 100 draws should not collide in practice.
    expect(codes.size).toBeGreaterThan(95);
  });
});

describe("isValidAppointmentCodeFormat", () => {
  it("accepts a well-formed code", () => {
    expect(isValidAppointmentCodeFormat("GB-7K4QW2ZP")).toBe(true);
  });

  it("rejects codes with ambiguous characters", () => {
    expect(isValidAppointmentCodeFormat("GB-0O1IW2ZP")).toBe(false);
  });

  it("rejects wrong length or missing prefix", () => {
    expect(isValidAppointmentCodeFormat("GB-7K4Q")).toBe(false);
    expect(isValidAppointmentCodeFormat("7K4QW2ZP")).toBe(false);
  });
});
