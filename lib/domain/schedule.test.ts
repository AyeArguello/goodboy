import { describe, expect, it } from "vitest";
import {
  getMaxActivePerDayFor,
  getSlotTimesFor,
  isSaturday,
  isSunday,
} from "./schedule";

// 2026-09-28 = Monday, 2026-10-03 = Saturday, 2026-10-04 = Sunday.
const MONDAY = "2026-09-28";
const SATURDAY = "2026-10-03";
const SUNDAY = "2026-10-04";

describe("isSaturday / isSunday", () => {
  it("identifies Saturday", () => {
    expect(isSaturday(SATURDAY)).toBe(true);
    expect(isSaturday(MONDAY)).toBe(false);
    expect(isSaturday(SUNDAY)).toBe(false);
  });

  it("identifies Sunday", () => {
    expect(isSunday(SUNDAY)).toBe(true);
    expect(isSunday(MONDAY)).toBe(false);
    expect(isSunday(SATURDAY)).toBe(false);
  });
});

describe("getSlotTimesFor", () => {
  it("returns the full weekday grid on a weekday", () => {
    expect(getSlotTimesFor(MONDAY)).toEqual(["09:00", "11:30", "13:30"]);
  });

  it("returns only 11:00 on Saturday", () => {
    expect(getSlotTimesFor(SATURDAY)).toEqual(["11:00"]);
  });

  it("returns no times on Sunday (closed)", () => {
    expect(getSlotTimesFor(SUNDAY)).toEqual([]);
  });
});

describe("getMaxActivePerDayFor", () => {
  it("allows up to 3 on a weekday", () => {
    expect(getMaxActivePerDayFor(MONDAY)).toBe(3);
  });

  it("allows only 1 on Saturday", () => {
    expect(getMaxActivePerDayFor(SATURDAY)).toBe(1);
  });

  it("allows 0 on Sunday", () => {
    expect(getMaxActivePerDayFor(SUNDAY)).toBe(0);
  });
});
