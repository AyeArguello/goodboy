import { describe, expect, it } from "vitest";
import {
  formatDayLabel,
  formatDurationHM,
  formatTimeLabel,
  isAtLeastLeadHoursAhead,
  isWithinWarnGap,
  toDateKey,
} from "./datetime";

describe("formatDurationHM", () => {
  it("formats a duration with leftover minutes", () => {
    expect(formatDurationHM(150)).toBe("2 h 30 min");
    expect(formatDurationHM(210)).toBe("3 h 30 min");
  });

  it("omits minutes when the duration is a whole number of hours", () => {
    expect(formatDurationHM(180)).toBe("3 h");
  });
});

describe("isAtLeastLeadHoursAhead (24h rule)", () => {
  const now = new Date("2026-09-23T12:00:00-03:00");

  it("rejects a slot less than 24h away", () => {
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    expect(isAtLeastLeadHoursAhead(in23h, now)).toBe(false);
  });

  it("accepts a slot exactly 24h away", () => {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(isAtLeastLeadHoursAhead(in24h, now)).toBe(true);
  });

  it("rejects a slot in the past", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isAtLeastLeadHoursAhead(yesterday, now)).toBe(false);
  });
});

describe("isWithinWarnGap (150 min warning)", () => {
  it("warns when two slots are less than 150 minutes apart", () => {
    const a = new Date("2026-09-25T09:00:00-03:00");
    const b = new Date("2026-09-25T11:00:00-03:00"); // 120 min
    expect(isWithinWarnGap(a, b)).toBe(true);
  });

  it("does not warn at exactly 150 minutes", () => {
    const a = new Date("2026-09-25T09:00:00-03:00");
    const b = new Date("2026-09-25T11:30:00-03:00"); // 150 min
    expect(isWithinWarnGap(a, b)).toBe(false);
  });
});

describe("timezone formatting (America/Argentina/Buenos_Aires)", () => {
  it("formats the day label regardless of server-local timezone", () => {
    const date = new Date("2026-09-24T17:00:00.000Z"); // 14:00 ART
    expect(formatDayLabel(date)).toContain("jueves");
    expect(formatDayLabel(date)).toContain("24");
  });

  it("formats the time label in 24h ART", () => {
    const date = new Date("2026-09-24T17:00:00.000Z");
    expect(formatTimeLabel(date)).toBe("14:00");
  });

  it("derives a stable date key across a UTC day boundary", () => {
    // 2026-09-24 21:30 ART == 2026-09-25 00:30 UTC — must still key as the 24th.
    const date = new Date("2026-09-25T00:30:00.000Z");
    expect(toDateKey(date)).toBe("2026-09-24");
  });
});
