import { describe, expect, it } from "vitest";
import type { GroundCell } from "../types/models";
import { solarPosition, sunMapForField, tileKey, type Blocker } from "./sunModel";

const DEFAULT_CELL = 30.48;
function field(cols: number, rows: number, ground: GroundCell[] = []) {
  return { cols, rows, cellSizeCm: DEFAULT_CELL, ground };
}
function fence(cols: number, row: number, heightCm: number): Blocker[] {
  return Array.from({ length: cols }, (_, c) => ({ col: c, row, heightCm }));
}

describe("solar position (§27.5)", () => {
  it("summer solstice noon at 45°N: high sun, due south", () => {
    const sun = solarPosition(45, 172, 12);
    expect(sun.altitudeDeg).toBeGreaterThan(60);
    expect(sun.altitudeDeg).toBeLessThan(72);
    expect(Math.abs(sun.azimuthDeg - 180)).toBeLessThan(2);
  });

  it("morning sun rises in the east, evening sets west", () => {
    expect(solarPosition(45, 172, 7).azimuthDeg).toBeLessThan(120);
    expect(solarPosition(45, 172, 18).azimuthDeg).toBeGreaterThan(240);
  });

  it("winter sun is low; polar night below horizon", () => {
    expect(solarPosition(45, 355, 12).altitudeDeg).toBeLessThan(25);
    expect(solarPosition(80, 355, 12).altitudeDeg).toBeLessThan(0);
  });
});

describe("sun map with obstruction casting (§27.6, §12.8)", () => {
  it("an empty flat field gets uniform full sun", () => {
    const map = sunMapForField(field(6, 4), [], { latDeg: 45, northBearingDeg: 0 });
    const hours = [...map.values()];
    expect(Math.min(...hours)).toBeGreaterThan(8); // daylight averaged over solstice+equinox
    expect(new Set(hours).size).toBe(1); // uniform
  });

  it("a tall south fence shades the cell just north of it", () => {
    // screen-up = north (bearing 0); south = larger row index.
    const map = sunMapForField(field(5, 5), fence(5, 4, 200), { latDeg: 45, northBearingDeg: 0 });
    const shaded = map.get(tileKey(2, 3))!; // immediately north of fence
    const open = map.get(tileKey(2, 0))!; // far side of the field
    expect(shaded).toBeLessThan(open - 2);
  });

  it("rotating the garden 180° gives the fence-side cell its sun back (§12.2 orientation)", () => {
    const blockers = fence(5, 4, 200);
    const south = sunMapForField(field(5, 5), blockers, { latDeg: 45, northBearingDeg: 0 }); // fence on plot's south
    const north = sunMapForField(field(5, 5), blockers, { latDeg: 45, northBearingDeg: 180 }); // fence on plot's north
    const beside = tileKey(2, 3);
    // A south fence blocks the dominant midday arc; a north fence only costs
    // the brief NE/NW summer shoulders. Same layout, ≥2h difference.
    expect(north.get(beside)!).toBeGreaterThan(south.get(beside)! + 2);
  });

  it("placed plants block by their mature height", () => {
    const map = sunMapForField(field(5, 5), [{ col: 2, row: 4, heightCm: 220 }], { latDeg: 45, northBearingDeg: 0 });
    expect(map.get(tileKey(2, 3))!).toBeLessThan(map.get(tileKey(0, 0))! - 1);
  });

  it("a raised cell sees over a blocker that shades lower ground", () => {
    const ground: GroundCell[] = [{ col: 2, row: 3, type: "grass", elevationCm: 120 }];
    const map = sunMapForField(field(5, 5, ground), fence(5, 4, 150), { latDeg: 45, northBearingDeg: 0 });
    const raised = map.get(tileKey(2, 3))!;
    const lowNeighbor = map.get(tileKey(1, 3))!;
    expect(raised).toBeGreaterThan(lowNeighbor);
  });
});
