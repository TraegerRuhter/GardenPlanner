import { describe, expect, it } from "vitest";
import {
  addDays,
  addWeeks,
  dayOfYear,
  diffDays,
  fromDayOfYear,
  inYear,
  monthDayOf,
  percentile,
} from "./dates";

describe("date helpers (UTC-noon, DST-proof)", () => {
  it("adds days across month and year bounds", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST day
  });

  it("adds weeks (negative = before)", () => {
    expect(addWeeks("2026-04-15", -6)).toBe("2026-03-04");
    expect(addWeeks("2026-04-15", 2)).toBe("2026-04-29");
  });

  it("diffs and day-of-year round-trip", () => {
    expect(diffDays("2026-04-01", "2026-04-15")).toBe(14);
    expect(dayOfYear("2025-01-01")).toBe(1);
    expect(dayOfYear("2025-12-31")).toBe(365);
    expect(fromDayOfYear(2025, dayOfYear("2025-04-20"))).toBe("2025-04-20");
  });

  it("materializes month-days in a year", () => {
    expect(inYear("04-15", 2026)).toBe("2026-04-15");
    expect(monthDayOf("2026-04-15")).toBe("04-15");
  });

  it("interpolates percentiles", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });
});
