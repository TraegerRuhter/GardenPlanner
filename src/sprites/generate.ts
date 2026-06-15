/**
 * Procedural sprite generator (§13.5 redesign). Builds a 32×32 grid of palette
 * SLOT ids for a given shape archetype + growth stage, plus the slot→hex palette
 * derived from a plant's resolved colors. Pure (no DOM) so it is unit-testable;
 * sprites.ts renders the grid to a cached canvas. Cozy/Stardew styling: soft
 * shading ramps + a dark unifying outline.
 *
 * Slot ids: leaf lh/lm/ll/ld · fruit fh/fm/fl/fd/fs(spec) · stem sh/sm/sl ·
 * root rh/rm/rl · soil kh/kl · wood wh/wl · senescent yh/ym/yl · outline ol.
 */
import type { StageKey } from "../types/models";
import type { SpriteShape } from "./shapes";

export const GRID_SIZE = 32;

type Slot = string;
type Grid = (Slot | null)[][];
interface Produce {
  fruit?: boolean;
  bloom?: boolean;
}

/** Colors needed to derive the slot palette (structurally a subset of Palette). */
export interface SourcePalette {
  l: string;
  L: string;
  f: string;
  F: string;
  s: string;
  m: string;
  M: string;
  y: string;
  w: string;
}

// ---------------- color helpers ----------------
const hexToRgb = (h: string): [number, number, number] => {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
};
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const k = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [k(p, q, h + 1 / 3) * 255, k(p, q, h) * 255, k(p, q, h - 1 / 3) * 255];
}
/** Shift a hex color in HSL space (lightness, saturation, hue deltas). */
function shift(hex: string, dL: number, dS = 0, dH = 0): string {
  const [r, g, b] = hexToRgb(hex);
  let [h, s, l] = rgbToHsl(r, g, b);
  h = (h + dH + 1) % 1;
  s = Math.max(0, Math.min(1, s + dS));
  l = Math.max(0, Math.min(1, l + dL));
  const [R, G, B] = hslToRgb(h, s, l);
  return rgbToHex(R, G, B);
}

/** Derive the full slot palette from a plant's resolved colors. */
export function buildSlotPalette(p: SourcePalette): Record<Slot, string> {
  return {
    lh: shift(p.l, +0.1), lm: p.l, ll: p.L, ld: shift(p.L, -0.12),
    fh: shift(p.f, +0.1), fm: p.f, fl: p.F, fd: shift(p.F, -0.12), fs: shift(p.f, +0.34, -0.12),
    sh: shift(p.s, +0.1), sm: p.s, sl: shift(p.s, -0.13),
    rh: shift(p.f, +0.12), rm: p.f, rl: p.F,
    kh: p.m, kl: p.M,
    wh: shift(p.w, +0.1), wl: shift(p.w, -0.13),
    yh: shift(p.y, +0.1), ym: p.y, yl: shift(p.y, -0.14),
    ol: "#241813",
  };
}

// ---------------- grid + shape helpers ----------------
const SZ = GRID_SIZE;
const newGrid = (): Grid => Array.from({ length: SZ }, () => Array<Slot | null>(SZ).fill(null));
const set = (g: Grid, x: number, y: number, s: Slot) => {
  x |= 0; y |= 0;
  if (x >= 0 && x < SZ && y >= 0 && y < SZ && s) g[y][x] = s;
};

function mound(g: Grid) {
  for (let x = 8; x < 24; x++) set(g, x, 30, "kl");
  for (let x = 10; x < 22; x++) set(g, x, 29, "kh");
  for (let x = 13; x < 19; x++) set(g, x, 28, "kl");
}
function soilBand(g: Grid, y: number) {
  for (let x = 4; x < 28; x++) { set(g, x, y, "kh"); set(g, x, y + 1, "kl"); }
}
function stem(g: Grid, x0: number, yBot: number, yTop: number) {
  for (let y = yTop; y <= yBot; y++) { set(g, x0 - 1, y, "sh"); set(g, x0, y, "sm"); set(g, x0 + 1, y, "sl"); }
}
function foliage(g: Grid, lobes: number[][], cx: number, cy: number) {
  const inL = (x: number, y: number) => lobes.some(([lx, ly, lr]) => (x - lx) ** 2 + (y - ly) ** 2 <= lr * lr);
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      if (!inL(x, y)) continue;
      const t = (x - cx) / 11 + (y - cy) / 11;
      let s = t < -0.5 ? "lh" : t > 0.55 ? "ll" : "lm";
      if (!inL(x - 1, y) || !inL(x + 1, y) || !inL(x, y - 1) || !inL(x, y + 1)) s = t > 0 ? "ld" : "lh";
      set(g, x, y, s);
    }
}
function disc(g: Grid, cx: number, cy: number, r: number, slots: [Slot, Slot, Slot], spec?: boolean) {
  const [hi, mid, lo] = slots;
  for (let y = -Math.ceil(r); y <= r; y++)
    for (let x = -Math.ceil(r); x <= r; x++) {
      if (x * x + y * y > r * r + 0.6) continue;
      const t = x + y;
      set(g, cx + x, cy + y, t <= -1 ? hi : t >= 2 ? lo : mid);
    }
  if (spec) set(g, cx - Math.round(r * 0.4), cy - Math.round(r * 0.4), "fs");
}
function blades(g: Grid, cx: number, yTop: number, yBot: number, dxs: number[], topSlot: Slot, midSlot: Slot) {
  for (const dx of dxs)
    for (let y = yTop; y <= yBot; y++) {
      const lean = Math.round((dx * 0.18 * (yBot - y)) / (yBot - yTop) * 3);
      set(g, cx + dx + lean, y, y < yTop + 3 ? topSlot : midSlot);
    }
}
function fruits(g: Grid, list: number[][], r = 2) {
  for (const [fx, fy] of list) {
    disc(g, fx, fy, r + 1, ["ld", "ld", "ld"]);
    disc(g, fx, fy, r, ["fh", "fm", "fl"], true);
  }
}
function blooms(g: Grid, list: number[][]) {
  for (const [fx, fy] of list) { set(g, fx, fy, "fm"); set(g, fx, fy - 1, "fh"); set(g, fx + 1, fy, "fl"); }
}
function outline(g: Grid) {
  const f = (x: number, y: number) => x >= 0 && x < SZ && y >= 0 && y < SZ && g[y][x] && g[y][x] !== "ol";
  const add: [number, number][] = [];
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++)
      if (!g[y][x] && (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) g[y][x] = "ol";
}
/** Shrink mature content toward bottom-center by factor t (growth scaling). */
function scaleGrid(src: Grid, t: number): Grid {
  if (t >= 0.999) return src;
  const dst = newGrid();
  const cx = 16, by = 30;
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      const sx = Math.round(cx + (x - cx) / t), sy = Math.round(by - (by - y) / t);
      if (sx >= 0 && sx < SZ && sy >= 0 && sy < SZ && src[sy][sx]) dst[y][x] = src[sy][sx];
    }
  return dst;
}
const LEAF_TO_SENESCENT: Record<string, string> = { lh: "yh", lm: "ym", ll: "yl", ld: "yl" };
function senesce(g: Grid) {
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      const s = g[y][x];
      if (s && LEAF_TO_SENESCENT[s]) g[y][x] = LEAF_TO_SENESCENT[s];
    }
}

// ---------------- archetype builders: build(g, o) where o = {fruit, bloom} ----
const BUILDERS: Record<SpriteShape, (g: Grid, o: Produce) => void> = {
  bush(g, o) {
    stem(g, 16, 28, 15);
    foliage(g, [[16, 12, 9], [9, 12, 5.5], [23, 12, 5.5], [11, 7, 4.8], [21, 7, 4.8], [16, 5, 5.2], [8, 17, 4.6], [24, 17, 4.6], [16, 20, 6.2]], 16, 13);
    if (o.bloom) blooms(g, [[10, 13], [22, 12], [16, 8]]);
    if (o.fruit) fruits(g, [[10, 18], [22, 16], [16, 22], [23, 22], [13, 13]]);
  },
  root(g) {
    soilBand(g, 21);
    for (let y = 16; y < 29; y++) { const w = Math.max(0, Math.round(5 - (y - 16) * 0.42)); for (let x = -w; x <= w; x++) set(g, 16 + x, y, x <= -2 ? "rh" : x >= 2 ? "rl" : "rm"); }
    for (const ry of [19, 22, 25]) for (let x = -3; x <= 3; x += 2) set(g, 16 + x, ry, "rl");
    foliage(g, [[16, 11, 3.4], [12, 12, 2.6], [20, 12, 2.6], [14, 8, 2.4], [18, 8, 2.4], [16, 7, 2.8]], 16, 10);
    for (const [dx, dy] of [[-4, -1], [4, -1], [0, -4], [-2, -3], [2, -3]]) set(g, 16 + dx, 8 + dy, "lh");
  },
  vine(g, o) {
    for (let x = 8; x < 24; x++) set(g, x, 16, "sl");
    foliage(g, [[11, 13, 3], [16, 11, 3.5], [21, 13, 3], [14, 15, 2.4], [19, 15, 2.4]], 16, 12);
    if (o.fruit) {
      for (const [vx, vy] of [[16, 17], [15, 18], [14, 19], [13, 20]]) set(g, vx, vy, "sl");
      for (let i = 0; i < 12; i++) { const x = 9 + i, y = 25 - Math.round(i * 0.4); set(g, x, y, "fm"); set(g, x, y - 1, i > 0 && i < 11 ? "fh" : "fm"); set(g, x, y + 1, "fl"); }
      for (let i = 2; i < 10; i += 3) set(g, 9 + i, 24 - Math.round(i * 0.4), "fl");
    }
  },
  tall(g, o) {
    stem(g, 16, 28, 6);
    for (const [sy, dir] of [[22, -1], [18, 1], [14, -1], [10, 1]]) foliage(g, [[16 + dir * 4, sy, 3.6]], 16 + dir * 4, sy);
    if (o.bloom || o.fruit) { disc(g, 16, 7, 5, ["fh", "fm", "fl"]); disc(g, 16, 7, 2, ["fd", "fd", "fd"]); }
  },
  leafy(g) {
    foliage(g, [[16, 18, 7], [9, 17, 4.5], [23, 17, 4.5], [12, 14, 4.5], [20, 14, 4.5], [16, 13, 5]], 16, 16);
    for (const [dx, dy] of [[-5, -2], [5, -2], [-6, 1], [6, 1], [0, -4]]) for (let i = 0; i < 5; i++) set(g, 16 + Math.round(dx * i / 5), 16 + Math.round(dy * i / 5), "ld");
  },
  herb(g, o) {
    stem(g, 16, 28, 18);
    foliage(g, [[16, 15, 4.5], [12, 16, 3], [20, 16, 3], [14, 12, 2.8], [18, 12, 2.8], [16, 11, 3]], 16, 14);
    if (o.bloom || o.fruit) blooms(g, [[13, 11], [19, 11], [16, 9]]);
  },
  flower(g, o) {
    stem(g, 16, 28, 12);
    foliage(g, [[12, 20, 3], [20, 20, 3]], 16, 20);
    if (o.bloom || o.fruit) {
      for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; disc(g, 16 + Math.round(Math.cos(ang) * 4), 9 + Math.round(Math.sin(ang) * 4), 1.7, ["fh", "fm", "fl"]); }
      disc(g, 16, 9, 2, ["fd", "fd", "fd"]);
    } else {
      foliage(g, [[16, 11, 3]], 16, 11);
    }
  },
  bulb(g) {
    soilBand(g, 22);
    blades(g, 16, 6, 21, [-3, -1, 1, 3], "lh", "lm");
    disc(g, 16, 24, 4, ["rh", "rm", "rl"], true);
  },
  climbing(g, o) {
    for (let y = 4; y < 29; y++) { set(g, 11, y, "wh"); set(g, 21, y, "wl"); }
    for (const ry of [8, 16, 24]) for (let x = 11; x <= 21; x++) set(g, x, ry, "wl");
    foliage(g, [[13, 10, 3], [19, 14, 3], [13, 20, 3], [19, 22, 2.8], [16, 7, 3]], 16, 14);
    if (o.fruit) for (const [fx, fy] of [[15, 18], [18, 11]]) for (let i = 0; i < 4; i++) set(g, fx, fy + i, i < 1 ? "fh" : "fm");
  },
  grass(g, o) {
    blades(g, 16, 9, 28, [-7, -5, -3, -1, 1, 3, 5, 7], "lh", "lm");
    if (o.fruit) for (const dx of [-7, -3, 1, 5]) disc(g, 16 + dx, 7, 1.7, ["fh", "fm", "fl"]);
  },
  cob(g, o) {
    stem(g, 16, 28, 5);
    for (const dir of [-1, 1]) for (let i = 0; i < 8; i++) set(g, 16 + dir * (1 + i), 12 + i + Math.round(i * i * 0.06), i < 5 ? "lm" : "ll");
    if (o.fruit) {
      for (let y = 11; y < 23; y++) for (let x = 16; x <= 22; x++) { const dx = (x - 19) / 3.4, dy = (y - 17) / 6.2; if (dx * dx + dy * dy <= 1) set(g, x, y, y % 2 === 0 ? "fh" : "fm"); }
      for (let y = 12; y < 23; y++) set(g, 22, y, "fl");
      set(g, 19, 22, "fl");
      for (let i = 0; i < 5; i++) { set(g, 16 + i, 21 + Math.round(i * 0.3), "lm"); set(g, 16 + i, 22 + Math.round(i * 0.3), "ll"); }
      for (const dx of [0, 1, 2]) set(g, 19 + dx, 10, "yh");
      for (const dx of [-2, -1, 0, 1, 2]) { set(g, 16 + dx, 4, "yh"); set(g, 16 + dx, 3, "yl"); }
    }
  },
  head(g) {
    foliage(g, [[16, 16, 9]], 16, 16);
    disc(g, 16, 16, 7, ["lh", "lm", "ll"]);
    disc(g, 16, 16, 5, ["lm", "lm", "ll"]);
    disc(g, 16, 16, 3, ["lh", "lm", "ll"]);
    for (let i = 0; i < 6; i++) { set(g, 16, 10 + i, "ld"); set(g, 10 + i, 16, "ld"); }
  },
  gourd(g, o) {
    for (let x = 6; x < 22; x++) set(g, x, 16, "sl");
    foliage(g, [[9, 12, 3.5], [14, 13, 3], [8, 15, 2.4], [13, 15, 2.4]], 10, 13);
    if (o.fruit) { disc(g, 20, 22, 6, ["fh", "fm", "fl"], true); for (const dx of [-3, 0, 3]) for (let y = -5; y <= 5; y++) if (dx * dx + y * y <= 36) set(g, 20 + dx, 22 + y, "fl"); }
  },
  crown(g, o) {
    stem(g, 16, 28, 16);
    foliage(g, [[10, 22, 3.5], [22, 22, 3.5], [12, 19, 3], [20, 19, 3]], 16, 21);
    if (o.fruit) {
      foliage(g, [[16, 12, 6], [11, 13, 3.5], [21, 13, 3.5], [13, 9, 3], [19, 9, 3], [16, 8, 3.5]], 16, 12);
      for (let i = 0; i < 22; i++) { const x = 10 + ((i * 7) % 14), y = 8 + ((i * 5) % 9); if ((x - 16) ** 2 + (y - 12) ** 2 < 36) set(g, x, y, "ld"); }
    } else {
      foliage(g, [[16, 15, 3.5]], 16, 15);
    }
  },
  berry(g, o) {
    foliage(g, [[16, 16, 7], [10, 16, 4], [22, 16, 4], [13, 12, 3.5], [19, 12, 3.5], [16, 11, 4]], 16, 15);
    if (o.bloom) blooms(g, [[11, 16], [19, 16], [15, 13]]);
    if (o.fruit) fruits(g, [[11, 20], [15, 21], [19, 20], [13, 18], [17, 18], [22, 19]], 1.4);
  },
};

// shared young/late stages (archetype-independent)
function seed(g: Grid) { mound(g); set(g, 15, 27, "ol"); set(g, 16, 27, "sl"); set(g, 16, 26, "sm"); }
function sprout0(g: Grid) { mound(g); set(g, 16, 27, "sm"); set(g, 16, 26, "sm"); set(g, 16, 25, "lm"); set(g, 15, 25, "lh"); set(g, 17, 26, "ll"); }
function sprout1(g: Grid) { mound(g); stem(g, 16, 28, 24); foliage(g, [[14, 23, 2.2], [18, 23, 2.2]], 16, 23); }
function stub(g: Grid) { mound(g); for (let y = 22; y < 29; y++) { set(g, 15, y, "wh"); set(g, 16, y, "wl"); } }

// ---------------- stage model ----------------
type Growth =
  | { kind: "seed" | "sprout0" | "sprout1" | "stub" | "senesce" }
  | { kind: "grow"; t: number; o: Produce };

const GROWTH: Record<StageKey, Growth> = {
  planted: { kind: "seed" },
  germination: { kind: "sprout0" },
  sprout: { kind: "sprout1" },
  seedling: { kind: "grow", t: 0.55, o: {} },
  vegetative: { kind: "grow", t: 0.78, o: {} },
  budding: { kind: "grow", t: 0.9, o: { bloom: true } },
  flowering: { kind: "grow", t: 0.96, o: { bloom: true } },
  fruiting: { kind: "grow", t: 0.99, o: { fruit: true } },
  harvest: { kind: "grow", t: 1, o: { fruit: true } },
  senescence: { kind: "senesce" },
  dormant: { kind: "stub" },
};

/** Build the 32×32 slot grid for a shape archetype at a growth stage. */
export function generateGrid(shape: SpriteShape, stage: StageKey): Grid {
  const G = GROWTH[stage];
  switch (G.kind) {
    case "seed": { const g = newGrid(); seed(g); outline(g); return g; }
    case "sprout0": { const g = newGrid(); sprout0(g); outline(g); return g; }
    case "sprout1": { const g = newGrid(); sprout1(g); outline(g); return g; }
    case "stub": { const g = newGrid(); stub(g); outline(g); return g; }
    case "senesce": {
      const m = newGrid();
      BUILDERS[shape](m, { fruit: false, bloom: false });
      senesce(m);
      const g = scaleGrid(m, 0.9);
      mound(g); outline(g);
      return g;
    }
    case "grow": {
      // build mature (no mound), scale toward soil, add mound, outline
      const m = newGrid();
      BUILDERS[shape](m, G.o);
      const g = scaleGrid(m, G.t);
      mound(g); outline(g);
      return g;
    }
  }
}
