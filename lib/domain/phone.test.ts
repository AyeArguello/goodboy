import { describe, expect, it } from "vitest";
import { e164ToWhatsAppDigits, normalizePhoneAr } from "./phone";

describe("normalizePhoneAr", () => {
  it("accepts 10 digits and inserts the WhatsApp mobile 9 marker", () => {
    const result = normalizePhoneAr("351 123-4567");
    expect(result.valid).toBe(true);
    expect(result.nationalDigits).toBe("3511234567");
    expect(result.e164).toBe("+5493511234567");
    expect(result.display).toBe("+54 3511234567");
  });

  it("rejects fewer than 10 digits", () => {
    expect(normalizePhoneAr("351123").valid).toBe(false);
  });

  it("rejects more than 10 digits", () => {
    expect(normalizePhoneAr("03511234567890").valid).toBe(false);
  });

  it("shows the user's original input back when invalid, unmodified", () => {
    const result = normalizePhoneAr("abc");
    expect(result.display).toBe("abc");
  });
});

describe("e164ToWhatsAppDigits", () => {
  it("strips the leading plus sign for wa.me links", () => {
    expect(e164ToWhatsAppDigits("+5493511234567")).toBe("5493511234567");
  });
});
