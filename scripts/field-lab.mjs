// Scratch FIELD lab — NOT wired into the app. Prototypes the grass-field ground
// system for the redesigned garden builder: a continuous expanse of living grass
// you CARVE into (soil beds, paths), plus a layered OVERLAY plane for sub-cell
// infrastructure (drip lines through cell centers, walkways between cells) that
// coexists with plants. Renders a contact sheet for review.
import { createCanvas } from "canvas";
import { writeFileSync } from "node:fs";

// deterministic per-tile RNG so a field looks varied but is stable across renders
function rngFor(col, row, salt = 0) {
  let s = (col * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  s >>>= 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const P = 4;            // display px per art-pixel
const TILE = 16;        // art-pixels per tile
const TPX = TILE * P;   // display px per tile (64)

// palettes
const GRASS = { base: ["#6aa94f", "#63a449", "#71b056", "#5f9f46"], light: "#88c66c", dark: "#4f8c3c", deep: "#447a34" };
const SOIL = { base: "#7a5a3e", dark: "#5f452e", light: "#8c6a4a", clod: "#6a4d34" };
const GRAVEL = { base: "#bcb4a4", light: "#d2ccbf", dark: "#968d7d" };
const DRIP = "#4f8fc4", DRIP_HI = "#82b7e2", EMIT = "#bfe0f5";
const FLORA = { daisyPet: "#fbf6e9", daisyCtr: "#f2c12e", clover: "#4f9a3f", cloverHi: "#6cb85a", stone: "#9aa0a6", stoneHi: "#bcc2c8", butter: "#f4cb3a" };

const px = (ctx, gx, gy, ax, ay, c) => { ctx.fillStyle = c; ctx.fillRect(gx + ax * P, gy + ay * P, P, P); };

function grassTile(ctx, gx, gy, r) {
  const base = GRASS.base[(r() * GRASS.base.length) | 0];
  ctx.fillStyle = base; ctx.fillRect(gx, gy, TPX, TPX);
  for (let i = 0; i < 14; i++) { const ax = (r() * 16) | 0, ay = (r() * 16) | 0; px(ctx, gx, gy, ax, ay, r() < 0.5 ? GRASS.dark : GRASS.light); }
  for (let i = 0; i < 8; i++) { const ax = (r() * 16) | 0, ay = 3 + ((r() * 12) | 0); px(ctx, gx, gy, ax, ay, GRASS.deep); px(ctx, gx, gy, ax, ay - 1, GRASS.light); px(ctx, gx, gy, ax, ay - 2, GRASS.light); }
}
function soilTile(ctx, gx, gy, r) {
  ctx.fillStyle = SOIL.base; ctx.fillRect(gx, gy, TPX, TPX);
  for (let i = 0; i < 26; i++) { const ax = (r() * 16) | 0, ay = (r() * 16) | 0; const c = r() < 0.4 ? SOIL.dark : r() < 0.7 ? SOIL.clod : SOIL.light; px(ctx, gx, gy, ax, ay, c); }
  for (let ay = 2; ay < 16; ay += 5) for (let ax = 0; ax < 16; ax++) if (r() < 0.5) px(ctx, gx, gy, ax, ay, SOIL.dark); // faint furrows
}
function gravelFill(ctx, gx, gy, w, h, r) {
  ctx.fillStyle = GRAVEL.base; ctx.fillRect(gx, gy, w, h);
  const n = (w * h) / (P * P) * 0.5;
  for (let i = 0; i < n; i++) { ctx.fillStyle = r() < 0.5 ? GRAVEL.light : GRAVEL.dark; ctx.fillRect(gx + ((r() * (w / P)) | 0) * P, gy + ((r() * (h / P)) | 0) * P, P, P); }
}

// flora (drawn over a grass tile at art-pixel center cx,cy)
function daisy(ctx, gx, gy, cx, cy) { for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1]]) px(ctx, gx, gy, cx + dx, cy + dy, FLORA.daisyPet); px(ctx, gx, gy, cx, cy, FLORA.daisyCtr); }
function clover(ctx, gx, gy, cx, cy) { for (const [dx, dy] of [[0, -1], [-1, 1], [1, 1]]) { px(ctx, gx, gy, cx + dx, cy + dy, FLORA.clover); px(ctx, gx, gy, cx + dx, cy + dy - 1, FLORA.cloverHi); } px(ctx, gx, gy, cx, cy + 2, FLORA.clover); }
function stone(ctx, gx, gy, cx, cy) { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(ctx, gx, gy, cx + dx, cy + dy, FLORA.stone); px(ctx, gx, gy, cx, cy, FLORA.stoneHi); }
function buttercup(ctx, gx, gy, cx, cy) { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) px(ctx, gx, gy, cx + dx, cy + dy, FLORA.butter); px(ctx, gx, gy, cx, cy, "#e89c1f"); }

// a simple plant mound (to show plant + drip coexisting in one cell)
function tomatoMound(ctx, gx, gy) {
  const cx = 8, cy = 9;
  for (let ay = -5; ay <= 5; ay++) for (let ax = -6; ax <= 6; ax++) { if (ax * ax + ay * ay * 1.4 > 34) continue; const t = ax + ay; px(ctx, gx, gy, cx + ax, cy + ay, t < -2 ? "#5fb04e" : t > 3 ? "#3a7d34" : "#4f9a44"); }
  for (const [dx, dy] of [[-3, -1], [2, 1], [0, -3], [3, -2]]) px(ctx, gx, gy, cx + dx, cy + dy, "#d23c2e");
}

// ---------------- compose the field ----------------
const COLS = 14, ROWS = 9;
const PADX = 16, PADY = 44;
const W = PADX * 2 + COLS * TPX;
const H = PADY + ROWS * TPX + 70;
const cv = createCanvas(W, H);
const cx = cv.getContext("2d");
cx.imageSmoothingEnabled = false;
cx.fillStyle = "#cdbfa6"; cx.fillRect(0, 0, W, H);
cx.fillStyle = "#2a1d13"; cx.font = "bold 18px sans-serif";
cx.fillText("FIELD PROTOTYPE — carve a garden out of living grass (layered cells)", PADX, 26);

// ground type per cell: a carved soil bed; everything else grass
const inBed = (c, r) => c >= 4 && c <= 10 && r >= 2 && r <= 6;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const gx = PADX + c * TPX, gy = PADY + r * TPX;
  const rng = rngFor(c, r);
  if (inBed(c, r)) soilTile(cx, gx, gy, rng);
  else {
    grassTile(cx, gx, gy, rng);
    const f = rng();
    if (f < 0.10) daisy(cx, gx, gy, 4 + ((rng() * 8) | 0), 4 + ((rng() * 8) | 0));
    else if (f < 0.18) clover(cx, gx, gy, 4 + ((rng() * 8) | 0), 4 + ((rng() * 8) | 0));
    else if (f < 0.24) buttercup(cx, gx, gy, 4 + ((rng() * 8) | 0), 4 + ((rng() * 8) | 0));
    else if (f < 0.28) stone(cx, gx, gy, 4 + ((rng() * 8) | 0), 6 + ((rng() * 6) | 0));
  }
}

// OVERLAY LAYER (sub-cell, drawn on top of ground + would sit with plants):
// 1) Walkway BETWEEN cells — gravel strip running along the south edge of the bed
//    (the boundary line between row 6 and row 7), spanning the bed width + margins.
{
  const edgeY = PADY + 7 * TPX - Math.round(TPX * 0.18);
  gravelFill(cx, PADX + 3 * TPX, edgeY, (9 - 3) * TPX, Math.round(TPX * 0.36), rngFor(99, 7, 5));
}
// 2) Walkway BETWEEN cells — vertical gravel strip along the west edge of the bed
{
  const edgeX = PADX + 4 * TPX - Math.round(TPX * 0.18);
  gravelFill(cx, edgeX, PADY + 2 * TPX, Math.round(TPX * 0.36), (7 - 2) * TPX, rngFor(4, 99, 6));
}
// 3) Drip lines THROUGH cell centers — horizontal across bed rows 3 and 5, with emitters
for (const br of [3, 5]) {
  const ly = PADY + br * TPX + TPX / 2;
  cx.fillStyle = DRIP; cx.fillRect(PADX + 4 * TPX, ly - P, (11 - 4) * TPX, P);
  cx.fillStyle = DRIP_HI; cx.fillRect(PADX + 4 * TPX, ly - 2 * P, (11 - 4) * TPX, P);
  for (let c = 4; c <= 10; c++) { cx.fillStyle = EMIT; cx.fillRect(PADX + c * TPX + TPX / 2 - P, ly + P, 2 * P, P); }
}
// 4) Plants in the bed that SHARE a cell with the drip line (coexistence)
for (const [c, r] of [[5, 3], [7, 3], [9, 3], [6, 5], [8, 5], [10, 5]]) {
  tomatoMound(cx, PADX + c * TPX, PADY + r * TPX);
}

// compass (cardinal orientation drives the sun; view stays straight-on)
cx.fillStyle = "rgba(255,255,255,0.85)"; cx.beginPath(); cx.arc(W - PADX - 18, PADY + 18, 16, 0, Math.PI * 2); cx.fill();
cx.fillStyle = "#b3412e"; cx.font = "bold 13px sans-serif"; cx.fillText("N", W - PADX - 22, PADY + 14);
cx.strokeStyle = "#b3412e"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(W - PADX - 18, PADY + 16); cx.lineTo(W - PADX - 18, PADY + 30); cx.stroke();

// legend
cx.fillStyle = "#2a1d13"; cx.font = "12px sans-serif";
const ly = PADY + ROWS * TPX + 20;
cx.fillText("Ground: living grass + flora (carved into soil bed).", PADX, ly);
cx.fillText("Overlay (sub-cell): ▬ gravel walkways run BETWEEN cells · ━ drip lines run THROUGH cell centers, coexisting with plants.", PADX, ly + 18);
cx.fillText("Cardinal compass sets sun direction; the view itself stays straight-on.", PADX, ly + 36);

writeFileSync("/tmp/field.png", cv.toBuffer("image/png"));
console.log("wrote /tmp/field.png", W + "x" + H);
