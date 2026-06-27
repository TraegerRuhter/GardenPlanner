/**
 * Ground-plane renderer for the garden field. Paints the carve-able surface —
 * a living grass expanse with tonal variation + scattered flora, plus carved
 * soil/path/mulch/gravel/paver/rock — onto a 2D canvas the Konva layer blits as
 * one image (far cheaper than a node per cell on a large field). Pure pixel art,
 * straight-on; ambient motion (Phase 3) is layered separately, above this.
 *
 * Cells are GROUND_NATIVE px so they line up 1:1 with TILE_PX at zoom 1, like
 * the plant sprites.
 */

import type { GroundType } from "../types/models";

export const GROUND_NATIVE = 32;
const N = GROUND_NATIVE;

/** Deterministic per-cell RNG so a field looks varied but is stable per render. */
function rngFor(col: number, row: number, salt: number): () => number {
  let s = ((col * 73856093) ^ (row * 19349663) ^ (salt * 83492791)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRASS = { base: ["#6aa94f", "#63a449", "#71b056", "#5f9f46"], light: "#88c66c", dark: "#4f8c3c", deep: "#447a34" };
const SOIL = { base: "#7a5a3e", dark: "#5f452e", light: "#8c6a4a", clod: "#6a4d34" };
const PATH = { base: "#c4ad8b", light: "#d8c4a6", dark: "#a8906c" };
const MULCH = { base: "#6e4f35", dark: "#553c28", light: "#856544" };
const GRAVEL = { base: "#b5b0a4", light: "#cfcabd", dark: "#968d7d" };
const PAVER = { base: "#b0a79b", light: "#c4bcb2", seam: "#7a7064" };
const ROCK = { base: "#9aa0a6", light: "#bcc2c8", dark: "#787e84" };
const FLORA = { daisyPet: "#fbf6e9", daisyCtr: "#f2c12e", clover: "#4f9a3f", cloverHi: "#6cb85a", stone: "#9aa0a6", stoneHi: "#bcc2c8", butter: "#f4cb3a", butterCtr: "#e89c1f", puff: "#eef0e6" };

type Ctx = CanvasRenderingContext2D;
const dot = (ctx: Ctx, ox: number, oy: number, ax: number, ay: number, c: string) => {
  if (ax < 0 || ay < 0 || ax >= N || ay >= N) return;
  ctx.fillStyle = c;
  ctx.fillRect(ox + ax, oy + ay, 1, 1);
};
const ri = (r: () => number, n: number) => (r() * n) | 0;

function grass(ctx: Ctx, ox: number, oy: number, r: () => number) {
  ctx.fillStyle = GRASS.base[ri(r, GRASS.base.length)];
  ctx.fillRect(ox, oy, N, N);
  for (let i = 0; i < 56; i++) dot(ctx, ox, oy, ri(r, N), ri(r, N), r() < 0.5 ? GRASS.dark : GRASS.light);
  for (let i = 0; i < 26; i++) {
    const ax = ri(r, N), ay = 4 + ri(r, N - 8);
    dot(ctx, ox, oy, ax, ay, GRASS.deep);
    dot(ctx, ox, oy, ax, ay - 1, GRASS.light);
    dot(ctx, ox, oy, ax, ay - 2, GRASS.light);
  }
}
function soil(ctx: Ctx, ox: number, oy: number, r: () => number) {
  ctx.fillStyle = SOIL.base; ctx.fillRect(ox, oy, N, N);
  for (let i = 0; i < 95; i++) { const v = r(); dot(ctx, ox, oy, ri(r, N), ri(r, N), v < 0.4 ? SOIL.dark : v < 0.7 ? SOIL.clod : SOIL.light); }
  for (let ay = 3; ay < N; ay += 6) for (let ax = 0; ax < N; ax++) if (r() < 0.5) dot(ctx, ox, oy, ax, ay, SOIL.dark);
}
function speckle(ctx: Ctx, ox: number, oy: number, r: () => number, p: { base: string; light: string; dark: string }, n: number) {
  ctx.fillStyle = p.base; ctx.fillRect(ox, oy, N, N);
  for (let i = 0; i < n; i++) dot(ctx, ox, oy, ri(r, N), ri(r, N), r() < 0.5 ? p.light : p.dark);
}
function paver(ctx: Ctx, ox: number, oy: number, r: () => number) {
  ctx.fillStyle = PAVER.base; ctx.fillRect(ox, oy, N, N);
  ctx.fillStyle = PAVER.seam;
  ctx.fillRect(ox, oy, N, 1); ctx.fillRect(ox, oy + N / 2, N, 1);
  ctx.fillRect(ox, oy, 1, N); ctx.fillRect(ox + N / 2, oy, 1, N);
  for (let i = 0; i < 22; i++) dot(ctx, ox, oy, ri(r, N), ri(r, N), PAVER.light);
}
function rock(ctx: Ctx, ox: number, oy: number, r: () => number) {
  ctx.fillStyle = ROCK.base; ctx.fillRect(ox, oy, N, N);
  for (let k = 0; k < 5; k++) {
    const cx = 4 + ri(r, N - 8), cy = 4 + ri(r, N - 8), rad = 3 + ri(r, 4);
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad) dot(ctx, ox, oy, cx + x, cy + y, x + y < 0 ? ROCK.light : ROCK.dark);
  }
}

// flora (over a grass cell)
function daisy(ctx: Ctx, ox: number, oy: number, cx: number, cy: number) {
  for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, 1], [1, -1], [-1, 1]]) dot(ctx, ox, oy, cx + dx, cy + dy, FLORA.daisyPet);
  dot(ctx, ox, oy, cx, cy, FLORA.daisyCtr);
}
function clover(ctx: Ctx, ox: number, oy: number, cx: number, cy: number) {
  for (const [dx, dy] of [[0, -2], [-2, 1], [2, 1]]) { dot(ctx, ox, oy, cx + dx, cy + dy, FLORA.clover); dot(ctx, ox, oy, cx + dx, cy + dy - 1, FLORA.cloverHi); }
  dot(ctx, ox, oy, cx, cy + 2, FLORA.clover);
}
function buttercup(ctx: Ctx, ox: number, oy: number, cx: number, cy: number) {
  for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2]]) dot(ctx, ox, oy, cx + dx, cy + dy, FLORA.butter);
  dot(ctx, ox, oy, cx, cy, FLORA.butterCtr);
}
function stone(ctx: Ctx, ox: number, oy: number, cx: number, cy: number) {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) dot(ctx, ox, oy, cx + dx, cy + dy, FLORA.stone);
  dot(ctx, ox, oy, cx, cy, FLORA.stoneHi);
}
function puff(ctx: Ctx, ox: number, oy: number, cx: number, cy: number) {
  for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, 0]]) dot(ctx, ox, oy, cx + dx, cy + dy, FLORA.puff);
}
function scatterFlora(ctx: Ctx, ox: number, oy: number, col: number, row: number) {
  const r = rngFor(col, row, 7);
  const f = r();
  const cx = 6 + ri(r, 20), cy = 6 + ri(r, 18);
  if (f < 0.09) daisy(ctx, ox, oy, cx, cy);
  else if (f < 0.16) clover(ctx, ox, oy, cx, cy);
  else if (f < 0.21) buttercup(ctx, ox, oy, cx, cy);
  else if (f < 0.25) stone(ctx, ox, oy, cx, cy);
  else if (f < 0.285) puff(ctx, ox, oy, cx, cy);
}

export interface FieldGroundView {
  cols: number;
  rows: number;
  groundType: (col: number, row: number) => GroundType;
}

/** Paint the whole field's ground plane onto ctx at native resolution. */
export function paintField(ctx: Ctx, view: FieldGroundView, opts: { flora?: boolean } = {}): void {
  const flora = opts.flora ?? true;
  for (let row = 0; row < view.rows; row++) {
    for (let col = 0; col < view.cols; col++) {
      const ox = col * N, oy = row * N;
      const r = rngFor(col, row, 1);
      switch (view.groundType(col, row)) {
        case "grass": grass(ctx, ox, oy, r); if (flora) scatterFlora(ctx, ox, oy, col, row); break;
        case "soil": soil(ctx, ox, oy, r); break;
        case "path": speckle(ctx, ox, oy, r, PATH, 40); break;
        case "mulch": speckle(ctx, ox, oy, r, MULCH, 70); break;
        case "gravel": speckle(ctx, ox, oy, r, GRAVEL, 80); break;
        case "paver": paver(ctx, ox, oy, r); break;
        case "rock": rock(ctx, ox, oy, r); break;
      }
    }
  }
}
