// Scratch sprite lab — NOT wired into the app. Renders today's char-map sprite
// next to a procedurally generated 32x32 sprite so we can judge whether
// procedural generation can reach the look we want before scaling to 148 plants.
import { createCanvas } from "canvas";
import { writeFileSync } from "node:fs";

// ---------------- current 16x16 char-map render (for comparison) -------------
const SOIL = ["....mmmmmmmm....", "..mmMMMMMMMMmm..", ".mMMMMMMMMMMMMm.", "................"];
const TOMATO_HARVEST = [
  "...ff.llll.ff...", "...fFllllllFf...", "..lffllLlllffll.", "..lfFLlllllfFl..",
  ".lffllllllllffl.", ".lfFLllssllLfFl.", ".lllffssssffll..", "..lfFlssssfFl...",
  "...llffssffll...", "....llfFfll.....", ".......ss.......", ".......ss.......",
  ...SOIL,
];
const PAL = { m: "#7d5c46", M: "#5c4033", s: "#3a7d44", l: "#58a854", L: "#3f8f4f", f: "#d23c2e", F: "#a02a20" };

function renderCharMap(map, scale) {
  const res = map.length;
  const cv = createCanvas(res * scale, res * scale);
  const ctx = cv.getContext("2d");
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++) {
      const ch = map[y][x];
      if (ch === ".") continue;
      ctx.fillStyle = PAL[ch] || "#ff00ff";
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  return cv;
}

// ---------------- color helpers ----------------
const hexToRgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbToHex = (r, g, b) => "#" + [r, g, b].map((v) => cl(v).toString(16).padStart(2, "0")).join("");
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2; if (mx === mn) { h = s = 0; } else { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h /= 6; } return [h, s, l]; }
function hslToRgb(h, s, l) { let r, g, b; if (s === 0) { r = g = b = l; } else { const k = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = k(p, q, h + 1 / 3); g = k(p, q, h); b = k(p, q, h - 1 / 3); } return [r * 255, g * 255, b * 255]; }
function shift(hex, dL, dS = 0, dH = 0) { const [r, g, b] = hexToRgb(hex); let [h, s, l] = rgbToHsl(r, g, b); h = (h + dH + 1) % 1; s = Math.max(0, Math.min(1, s + dS)); l = Math.max(0, Math.min(1, l + dL)); const [R, G, B] = hslToRgb(h, s, l); return rgbToHex(R, G, B); }
const ramp = (base) => ({ hi: shift(base, +0.12, +0.03, -0.015), mid: base, lo: shift(base, -0.16, +0.05, +0.02), deep: shift(base, -0.28, +0.05, +0.02) });

// ---------------- procedural 32x32 fruiting-bush generator ----------------
function genBush({ leaf, fruit, stem }) {
  const S = 32;
  const g = Array.from({ length: S }, () => Array(S).fill(null));
  const set = (x, y, c) => { if (x >= 0 && x < S && y >= 0 && y < S && c) g[y][x] = c; };
  const L = ramp(leaf), F = ramp(fruit), ST = ramp(stem);
  const OUTLINE = "#241813";

  // soil mound
  for (let x = 7; x < 25; x++) set(x, 30, "#5c4033");
  for (let x = 9; x < 23; x++) set(x, 29, "#7d5c46");
  for (let x = 12; x < 20; x++) set(x, 28, "#5c4033");

  // stem (lit left, shaded right)
  for (let y = 16; y < 29; y++) { set(15, y, ST.hi); set(16, y, ST.mid); set(17, y, ST.lo); }

  // foliage = union of leaf lobes -> organic, bumpy silhouette
  const cx = 15.5, cy = 13;
  const lobes = [
    [15.5, 12, 9], [8.5, 12, 5.5], [22.5, 12, 5.5],
    [11, 7, 4.8], [20, 7, 4.8], [15.5, 5, 5.2],
    [8, 17, 4.6], [23, 17, 4.6], [15.5, 20, 6.2],
  ];
  const inLobes = (x, y) => lobes.some(([lx, ly, lr]) => (x - lx) ** 2 + (y - ly) ** 2 <= lr * lr);
  for (let y = 1; y < 28; y++)
    for (let x = 0; x < 32; x++) {
      if (!inLobes(x, y)) continue;
      const t = (x - cx) / 12 + (y - cy) / 12; // light gradient TL->BR
      let c = t < -0.5 ? L.hi : t > 0.55 ? L.lo : L.mid;
      const edge = !inLobes(x - 1, y) || !inLobes(x + 1, y) || !inLobes(x, y - 1) || !inLobes(x, y + 1);
      if (edge) c = t > 0 ? L.deep : L.hi; // rim: shadow on shaded side, highlight on lit side
      set(x, y, c);
    }
  // leaf tips (small spikes at lobe crowns) + interior veins for texture
  for (const [lx, ly, lr] of lobes) {
    if (ly < 14) { set(Math.round(lx), Math.round(ly - lr), L.mid); set(Math.round(lx), Math.round(ly - lr) - 1, L.lo); }
  }
  for (const [vx, vy] of [[12, 10], [19, 9], [15, 14], [10, 15], [21, 15]]) {
    for (let i = 0; i < 3; i++) set(vx + i, vy + i, L.deep);
  }

  // fruits — rounder, fewer, clear form; each with pocket shadow + specular
  const fruits = [[10, 18], [21, 16], [15, 22], [22, 22], [13, 13]];
  for (const [fx, fy] of fruits) {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 8) set(fx + x, fy + y, L.deep); // pocket
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        if (x * x + y * y > 5) continue;
        let c = F.mid;
        if (x + y <= -1) c = F.hi;
        if (x + y >= 2) c = F.lo;
        set(fx + x, fy + y, c);
      }
    set(fx - 1, fy - 2, F.hi);
    set(fx - 1, fy - 1, shift(fruit, +0.34, -0.12)); // specular
  }

  // selective dark outline around the silhouette
  const filled = (x, y) => x >= 0 && x < S && y >= 0 && y < S && g[y][x] && g[y][x] !== OUTLINE;
  const edges = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (!g[y][x] && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) edges.push([x, y]);
  for (const [x, y] of edges) g[y][x] = OUTLINE;
  return g;
}

function renderGrid(grid, scale) {
  const S = grid.length;
  const cv = createCanvas(S * scale, S * scale);
  const ctx = cv.getContext("2d");
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!grid[y][x]) continue;
      ctx.fillStyle = grid[y][x];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  return cv;
}

// ---------------- compose comparison sheet ----------------
const PANEL = 256, PAD = 24, LABEL = 28;
const sheet = createCanvas(PANEL * 2 + PAD * 3, PANEL + PAD * 2 + LABEL);
const sx = sheet.getContext("2d");
sx.fillStyle = "#cdbfa6"; // warm checker-ish bg
sx.fillRect(0, 0, sheet.width, sheet.height);
sx.imageSmoothingEnabled = false;

const cur = renderCharMap(TOMATO_HARVEST, PANEL / 16);
const gen = renderGrid(genBush({ leaf: "#58a854", fruit: "#d23c2e", stem: "#3a7d44" }), PANEL / 32);
sx.drawImage(cur, PAD, PAD + LABEL, PANEL, PANEL);
sx.drawImage(gen, PAD * 2 + PANEL, PAD + LABEL, PANEL, PANEL);
sx.fillStyle = "#2a1d13";
sx.font = "bold 16px sans-serif";
sx.fillText("CURRENT  (16x16)", PAD, PAD + 16);
sx.fillText("PROCEDURAL  (32x32)", PAD * 2 + PANEL, PAD + 16);

writeFileSync("/tmp/sprite-compare.png", sheet.toBuffer("image/png"));
console.log("wrote /tmp/sprite-compare.png", sheet.width + "x" + sheet.height);
