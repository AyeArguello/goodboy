import { describe, expect, it } from "vitest";
import {
  daysThroughEndOfMonth,
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

describe("daysThroughEndOfMonth", () => {
  it("reaches the end of the month after next", () => {
    // 10 Oct .. 31 Dec 2026: 22 + 30 + 31 days.
    expect(daysThroughEndOfMonth("2026-10-10", 2)).toBe(83);
    expect(daysThroughEndOfMonth("2026-10-01", 2)).toBe(92);
    expect(daysThroughEndOfMonth("2026-10-31", 2)).toBe(62);
  });

  it("rolls over into next year: in December it covers January and February", () => {
    // 1 Dec 2026 .. 28 Feb 2027: 31 + 31 + 28 days.
    expect(daysThroughEndOfMonth("2026-12-01", 2)).toBe(90);
    // 2028 is a leap year.
    expect(daysThroughEndOfMonth("2027-12-15", 2)).toBe(17 + 31 + 29);
  });

  it("counts only today when there are no months ahead", () => {
    expect(daysThroughEndOfMonth("2026-10-10", 0)).toBe(22);
  });
});
