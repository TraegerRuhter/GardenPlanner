import { describe, expect, it } from "vitest";
import {
  cToF,
  fToC,
  formatDepthMm,
  formatLength,
  formatRange,
  formatTemp,
} from "./units";

describe("unit rendering (§0: metric storage, dual display)", () => {
  it("converts temperatures both ways", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
    expect(fToC(32)).toBe(0);
    expect(fToC(212)).toBe(100);
  });

  it("renders lengths in both systems with sensible unit steps", () => {
    expect(formatLength(45, "metric")).toBe("45 cm");
    expect(formatLength(150, "metric")).toBe("1.5 m");
    expect(formatLength(30.48, "imperial")).toBe("12 in");
    expect(formatLength(91.44, "imperial")).toBe("3 ft");
  });

  it("renders water depth", () => {
    expect(formatDepthMm(25, "metric")).toBe("25 mm");
    expect(formatDepthMm(25.4, "imperial")).toBe("1 in");
  });

  it("renders temperature and ranges", () => {
    expect(formatTemp(15.5, "imperial")).toBe("59.9°F");
    expect(formatRange(55, 90, (v) => `${v}d`)).toBe("55d–90d");
    expect(formatRange(7, 7, (v) => `${v}d`)).toBe("7d");
  });
});
