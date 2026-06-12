import { describe, expect, it } from "vitest";
import {
  depressionDepthCm,
  depressionFactor,
  waterloggingRisk,
} from "./waterlogging";

describe("waterlogging risk (§31.2, §27.10)", () => {
  it("dry week on any drainage: none", () => {
    expect(
      waterloggingRisk({
        drainage: "poor",
        recentRainMm: 10,
        forecastRainMm: 0,
        depressionDepthCm: 0,
      }),
    ).toBe("none");
  });

  it("a Pacific storm front on poor drainage: high", () => {
    expect(
      waterloggingRisk({
        drainage: "poor",
        recentRainMm: 70,
        forecastRainMm: 20,
        depressionDepthCm: 0,
      }),
    ).toBe("high");
  });

  it("same storm drains away on fast soil", () => {
    expect(
      waterloggingRisk({
        drainage: "fast",
        recentRainMm: 70,
        forecastRainMm: 20,
        depressionDepthCm: 0,
      }),
    ).toBe("none");
  });

  it("a depression amplifies a borderline load", () => {
    const base = {
      drainage: "moderate",
      recentRainMm: 110,
      forecastRainMm: 10,
    } as const;
    expect(waterloggingRisk({ ...base, depressionDepthCm: 0 })).toBe("elevated");
    expect(waterloggingRisk({ ...base, depressionDepthCm: 10 })).toBe("high");
  });

  it("depression factor is clamped 1..2 and depth derives from neighbors", () => {
    expect(depressionFactor(0)).toBe(1);
    expect(depressionFactor(25)).toBe(2);
    expect(depressionDepthCm(0, [10, 10, 10, 10])).toBe(10);
    expect(depressionDepthCm(15, [10, 10])).toBe(0); // raised tile
    expect(depressionDepthCm(0, [])).toBe(0);
  });
});
