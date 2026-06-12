import { describe, expect, it } from "vitest";
import { newArea, setTile } from "../db/gardenRepo";
import { solarPosition, sunMapForArea, tileKey } from "./sunModel";

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
  it("an empty flat bed gets uniform full sun", () => {
    const area = newArea("bed", 6, 4);
    const map = sunMapForArea(area, { latDeg: 45, northBearingDeg: 0 });
    const hours = [...map.values()];
    expect(Math.min(...hours)).toBeGreaterThan(8); // daylight averaged over solstice+equinox
    expect(new Set(hours).size).toBe(1); // uniform
  });

  it("a tall south fence shades the tile just north of it", () => {
    // screen-up = north (bearing 0); south = larger row index.
    const area = newArea("bed", 5, 5);
    for (let c = 0; c < 5; c++)
      setTile(area, c, 4, { type: "structure", structure: "fence", heightCm: 200 });
    const map = sunMapForArea(area, { latDeg: 45, northBearingDeg: 0 });
    const shaded = map.get(tileKey(2, 3))!; // immediately north of fence
    const open = map.get(tileKey(2, 0))!; // far side of the bed
    expect(shaded).toBeLessThan(open - 2);
  });

  it("rotating the garden 180° gives the fence-side tile its sun back (§12.2 orientation)", () => {
    const area = newArea("bed", 5, 5);
    for (let c = 0; c < 5; c++)
      setTile(area, c, 4, { type: "structure", structure: "fence", heightCm: 200 });
    const south = sunMapForArea(area, { latDeg: 45, northBearingDeg: 0 }); // fence on plot's south
    const north = sunMapForArea(area, { latDeg: 45, northBearingDeg: 180 }); // fence on plot's north
    const beside = tileKey(2, 3);
    // A south fence blocks the dominant midday arc; a north fence only costs
    // the brief NE/NW summer shoulders. Same layout, ≥2h difference.
    expect(north.get(beside)!).toBeGreaterThan(south.get(beside)! + 2);
  });

  it("placed plants block by their mature height", () => {
    const area = newArea("bed", 5, 5);
    setTile(area, 2, 4, { type: "plant", instanceId: "corn1" });
    const map = sunMapForArea(area, {
      latDeg: 45,
      northBearingDeg: 0,
      plantHeightCm: () => 220,
    });
    expect(map.get(tileKey(2, 3))!).toBeLessThan(map.get(tileKey(0, 0))! - 1);
  });

  it("a raised tile sees over a blocker that shades lower ground", () => {
    const area = newArea("bed", 5, 5);
    for (let c = 0; c < 5; c++)
      setTile(area, c, 4, { type: "structure", structure: "fence", heightCm: 150 });
    setTile(area, 2, 3, { type: "empty" }, 120); // raised bed/berm tile
    const map = sunMapForArea(area, { latDeg: 45, northBearingDeg: 0 });
    const raised = map.get(tileKey(2, 3))!;
    const lowNeighbor = map.get(tileKey(1, 3))!;
    expect(raised).toBeGreaterThan(lowNeighbor);
  });
});
