import { describe, expect, it } from "vitest";
import { addOverlaySegment, newField, overlayPassesCell, removeOverlayAt } from "./gardenRepo";

describe("field overlays (sub-cell infrastructure)", () => {
  it("a drip line passes through the cells along its run, not off to the side", () => {
    const f = newField(10, 10);
    const o = addOverlaySegment(f, "drip", "line", { col: 2, row: 3 }, { col: 6, row: 3 });
    expect(f.overlays).toHaveLength(1);
    expect(o.path).toEqual([{ x: 2.5, y: 3.5 }, { x: 6.5, y: 3.5 }]); // cell centers
    expect(overlayPassesCell(o, 4, 3)).toBe(true); // mid-run
    expect(overlayPassesCell(o, 2, 3)).toBe(true); // start
    expect(overlayPassesCell(o, 6, 3)).toBe(true); // end
    expect(overlayPassesCell(o, 4, 5)).toBe(false); // two rows away
  });

  it("a plant cell and a drip cell can coexist (independent planes)", () => {
    const f = newField(10, 10);
    const o = addOverlaySegment(f, "drip", "line", { col: 0, row: 2 }, { col: 9, row: 2 });
    // the overlay lives on the field; placing a plant at (4,2) is unaffected
    expect(overlayPassesCell(o, 4, 2)).toBe(true);
  });

  it("removeOverlayAt removes an overlay the cell lies on", () => {
    const f = newField(8, 8);
    addOverlaySegment(f, "walkway", "strip", { col: 1, row: 1 }, { col: 1, row: 5 }, 45);
    expect(removeOverlayAt(f, 1, 3)).toBe(true); // on the run
    expect(f.overlays).toHaveLength(0);
    expect(removeOverlayAt(f, 4, 4)).toBe(false); // nothing there
  });
});
