// Scratch sprite lab — NOT wired into the app yet. Develops the procedural
// generator for every shape archetype and renders a contact sheet for review.
// Generators emit palette SLOT ids (lh/lm/ll/ld, fh/fm/fl/fd, sh/sm/sl, ...)
// so the same output recolors via the app's palette. Cozy/Stardew vibe.
import { createCanvas } from "canvas";
import { writeFileSync } from "node:fs";

// ---------------- color helpers ----------------
const hexToRgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbToHex = (r, g, b) => "#" + [r, g, b].map((v) => cl(v).toString(16).padStart(2, "0")).join("");
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2; if (mx === mn) { h = s = 0; } else { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h /= 6; } return [h, s, l]; }
function hslToRgb(h, s, l) { let r, g, b; if (s === 0) { r = g = b = l; } else { const k = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = k(p, q, h + 1 / 3); g = k(p, q, h); b = k(p, q, h - 1 / 3); } return [r * 255, g * 255, b * 255]; }
function shift(hex, dL, dS = 0, dH = 0) { const [r, g, b] = hexToRgb(hex); let [h, s, l] = rgbToHsl(r, g, b); h = (h + dH + 1) % 1; s = Math.max(0, Math.min(1, s + dS)); l = Math.max(0, Math.min(1, l + dL)); const [R, G, B] = hslToRgb(h, s, l); return rgbToHex(R, G, B); }
const rampOf = (base) => ({ hi: shift(base, +0.12, +0.03, -0.015), mid: base, lo: shift(base, -0.15, +0.05, +0.02), deep: shift(base, -0.27, +0.05, +0.02) });

// slot palette derived from a few base colors (cozy ramps)
function buildPalette(b) {
  const L = rampOf(b.leaf), F = rampOf(b.fruit), S = rampOf(b.stem), R = rampOf(b.root || b.fruit), W = rampOf(b.wood || "#9a7a55");
  return {
    lh: L.hi, lm: L.mid, ll: L.lo, ld: L.deep,
    fh: F.hi, fm: F.mid, fl: F.lo, fd: F.deep, fs: shift(b.fruit, +0.34, -0.12),
    sh: S.hi, sm: S.mid, sl: S.lo,
    rh: R.hi, rm: R.mid, rl: R.lo,
    kh: "#7d5c46", kl: "#5c4033",
    wh: W.hi, wl: W.lo,
    yh: "#c8b46a", yl: "#9a8348",
    ol: "#241813",
  };
}

// ---------------- grid + shape helpers (emit slot ids) ----------------
const SZ = 32;
const newGrid = () => Array.from({ length: SZ }, () => Array(SZ).fill(null));
const set = (g, x, y, s) => { x |= 0; y |= 0; if (x >= 0 && x < SZ && y >= 0 && y < SZ && s) g[y][x] = s; };

function mound(g) { for (let x = 8; x < 24; x++) set(g, x, 30, "kl"); for (let x = 10; x < 22; x++) set(g, x, 29, "kh"); for (let x = 13; x < 19; x++) set(g, x, 28, "kl"); }
function soilBand(g, y) { for (let x = 4; x < 28; x++) { set(g, x, y, "kh"); set(g, x, y + 1, "kl"); } }
function stem(g, x0, yBot, yTop) { for (let y = yTop; y <= yBot; y++) { set(g, x0 - 1, y, "sh"); set(g, x0, y, "sm"); set(g, x0 + 1, y, "sl"); } }

function foliage(g, lobes, cx, cy) {
  const inL = (x, y) => lobes.some(([lx, ly, lr]) => (x - lx) ** 2 + (y - ly) ** 2 <= lr * lr);
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      if (!inL(x, y)) continue;
      const t = (x - cx) / 11 + (y - cy) / 11;
      let s = t < -0.5 ? "lh" : t > 0.55 ? "ll" : "lm";
      if (!inL(x - 1, y) || !inL(x + 1, y) || !inL(x, y - 1) || !inL(x, y + 1)) s = t > 0 ? "ld" : "lh";
      set(g, x, y, s);
    }
}
function disc(g, cx, cy, r, [hi, mid, lo], spec) {
  for (let y = -Math.ceil(r); y <= r; y++)
    for (let x = -Math.ceil(r); x <= r; x++) {
      if (x * x + y * y > r * r + 0.6) continue;
      const t = x + y;
      set(g, cx + x, cy + y, t <= -1 ? hi : t >= 2 ? lo : mid);
    }
  if (spec) set(g, cx - Math.round(r * 0.4), cy - Math.round(r * 0.4), "fs");
}
function blades(g, cx, yTop, yBot, dxs, topSlot, midSlot) {
  for (const dx of dxs) for (let y = yTop; y <= yBot; y++) { const lean = Math.round(dx * 0.18 * (yBot - y) / (yBot - yTop) * 3); set(g, cx + dx + lean, y, y < yTop + 3 ? topSlot : midSlot); }
}
function outline(g) {
  const f = (x, y) => x >= 0 && x < SZ && y >= 0 && y < SZ && g[y][x] && g[y][x] !== "ol";
  const add = [];
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) if (!g[y][x] && (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) g[y][x] = "ol";
}
function fruits(g, list, r = 2) {
  for (const [fx, fy] of list) { disc(g, fx, fy, r + 1, ["ld", "ld", "ld"]); disc(g, fx, fy, r, ["fh", "fm", "fl"], true); }
}

// ---------------- archetype builders ----------------
const B = {
  bush(g) {
    mound(g); stem(g, 16, 28, 15);
    foliage(g, [[16, 12, 9], [9, 12, 5.5], [23, 12, 5.5], [11, 7, 4.8], [21, 7, 4.8], [16, 5, 5.2], [8, 17, 4.6], [24, 17, 4.6], [16, 20, 6.2]], 16, 13);
    fruits(g, [[10, 18], [22, 16], [16, 22], [23, 22], [13, 13]]);
  },
  root(g) {
    soilBand(g, 21);
    for (const dx of [-6, -3, 0, 3, 6]) for (let i = 0; i < 13; i++) { set(g, 16 + Math.round(dx * i / 12), 20 - i, i > 8 ? "lh" : "lm"); }
    for (let y = 22; y < 30; y++) { const w = Math.max(0, 5 - (y - 22)); for (let x = -w; x <= w; x++) set(g, 16 + x, y, x < -1 ? "rh" : x > 1 ? "rl" : "rm"); }
  },
  vine(g) {
    mound(g);
    for (let x = 5; x < 27; x++) set(g, x, 19, "sl");
    foliage(g, [[8, 15, 4], [15, 14, 4.5], [22, 15, 4], [12, 17, 3.2], [19, 17, 3.2]], 15, 15);
    for (let x = 11; x < 22; x++) { set(g, x, 23, "fh"); set(g, x, 24, "fm"); set(g, x, 25, "fl"); }
  },
  tall(g) {
    mound(g); stem(g, 16, 28, 6);
    for (const [sy, dir] of [[22, -1], [18, 1], [14, -1], [10, 1]]) foliage(g, [[16 + dir * 4, sy, 3.6]], 16 + dir * 4, sy);
    disc(g, 16, 7, 5, ["fh", "fm", "fl"]); disc(g, 16, 7, 2, ["fd", "fd", "fd"]);
  },
  leafy(g) {
    mound(g);
    foliage(g, [[16, 18, 7], [9, 17, 4.5], [23, 17, 4.5], [12, 14, 4.5], [20, 14, 4.5], [16, 13, 5]], 16, 16);
    for (const [dx, dy] of [[-5, -2], [5, -2], [-6, 1], [6, 1], [0, -4]]) for (let i = 0; i < 5; i++) set(g, 16 + Math.round(dx * i / 5), 16 + Math.round(dy * i / 5), "ld");
  },
  herb(g) {
    mound(g); stem(g, 16, 28, 18);
    foliage(g, [[16, 15, 4.5], [12, 16, 3], [20, 16, 3], [14, 12, 2.8], [18, 12, 2.8], [16, 11, 3]], 16, 14);
    for (const [fx, fy] of [[13, 11], [19, 11], [16, 9]]) { set(g, fx, fy, "fm"); set(g, fx, fy - 1, "fh"); }
  },
  flower(g) {
    mound(g); stem(g, 16, 28, 12);
    foliage(g, [[12, 20, 3], [20, 20, 3]], 16, 20);
    for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; disc(g, 16 + Math.round(Math.cos(ang) * 4), 9 + Math.round(Math.sin(ang) * 4), 1.7, ["fh", "fm", "fl"]); }
    disc(g, 16, 9, 2, ["fd", "fd", "fd"]);
  },
  bulb(g) {
    soilBand(g, 22);
    blades(g, 16, 6, 21, [-3, -1, 1, 3], "lh", "lm");
    disc(g, 16, 24, 4, ["rh", "rm", "rl"], true);
  },
  climbing(g) {
    mound(g);
    for (let y = 4; y < 29; y++) { set(g, 11, y, "wh"); set(g, 21, y, "wl"); }
    for (const ry of [8, 16, 24]) for (let x = 11; x <= 21; x++) set(g, x, ry, "wl");
    foliage(g, [[13, 10, 3], [19, 14, 3], [13, 20, 3], [19, 22, 2.8], [16, 7, 3]], 16, 14);
    for (const [fx, fy] of [[15, 18], [18, 11]]) for (let i = 0; i < 4; i++) set(g, fx, fy + i, i < 1 ? "fh" : "fm");
  },
  grass(g) {
    mound(g);
    blades(g, 16, 8, 28, [-7, -5, -3, -1, 1, 3, 5, 7], "lh", "lm");
    for (const dx of [-7, -3, 1, 5]) { set(g, 16 + dx, 7, "fm"); set(g, 16 + dx, 6, "fh"); }
  },
  cob(g) {
    mound(g); stem(g, 16, 28, 4);
    for (const [sy, dir] of [[20, -1], [16, 1], [12, -1], [8, 1]]) for (let i = 0; i < 7; i++) set(g, 16 + dir * (2 + i), sy + Math.round(i * 0.6), i < 4 ? "lm" : "ll");
    for (let y = 12; y < 20; y++) for (let x = 17; x < 20; x++) set(g, x, y, x < 18 ? "fh" : x < 19 ? "fm" : "fl");
    for (const dx of [-1, 0, 1, 2]) { set(g, 16 + dx, 5, "yh"); set(g, 16 + dx, 4, "yl"); }
  },
  head(g) {
    mound(g);
    foliage(g, [[16, 16, 9]], 16, 16);
    disc(g, 16, 16, 7, ["lh", "lm", "ll"]);
    disc(g, 16, 16, 5, ["lm", "lm", "ll"]);
    disc(g, 16, 16, 3, ["lh", "lm", "ll"]);
    for (let i = 0; i < 6; i++) { set(g, 16, 10 + i, "ld"); set(g, 10 + i, 16, "ld"); }
  },
  gourd(g) {
    mound(g);
    for (let x = 6; x < 14; x++) set(g, x, 14, "sl");
    foliage(g, [[8, 11, 3.5], [12, 13, 3]], 9, 12);
    disc(g, 19, 22, 6, ["fh", "fm", "fl"], true);
    for (const dx of [-3, 0, 3]) for (let y = -5; y <= 5; y++) if (dx * dx + y * y <= 36) set(g, 19 + dx, 22 + y, "fl");
  },
  crown(g) {
    mound(g); stem(g, 16, 28, 16);
    foliage(g, [[10, 22, 3.5], [22, 22, 3.5], [12, 19, 3], [20, 19, 3]], 16, 21);
    foliage(g, [[16, 12, 6], [11, 13, 3.5], [21, 13, 3.5], [13, 9, 3], [19, 9, 3], [16, 8, 3.5]], 16, 12);
    for (let i = 0; i < 22; i++) { const x = 10 + ((i * 7) % 14), y = 8 + ((i * 5) % 9); if ((x - 16) ** 2 + (y - 12) ** 2 < 36) set(g, x, y, "ld"); }
  },
  berry(g) {
    mound(g);
    foliage(g, [[16, 16, 7], [10, 16, 4], [22, 16, 4], [13, 12, 3.5], [19, 12, 3.5], [16, 11, 4]], 16, 15);
    fruits(g, [[11, 20], [15, 21], [19, 20], [13, 18], [17, 18], [22, 19]], 1.4);
  },
};

// per-archetype base palettes (so the sheet reads as distinct crops)
const BASES = {
  bush: { leaf: "#58a854", fruit: "#d23c2e", stem: "#3a7d44" },
  root: { leaf: "#5fae54", fruit: "#e88a2e", root: "#e88a2e", stem: "#3a7d44" },
  vine: { leaf: "#4e9e54", fruit: "#3f8f4f", stem: "#6a8a4a" },
  tall: { leaf: "#5aa64f", fruit: "#e8c24a", stem: "#4a8a3f" },
  leafy: { leaf: "#7cc35f", fruit: "#7cc35f", stem: "#4a8a3f" },
  herb: { leaf: "#5fae54", fruit: "#b39ed8", stem: "#3a7d44" },
  flower: { leaf: "#4e9e54", fruit: "#e76fb3", stem: "#3a7d44" },
  bulb: { leaf: "#6aae5a", fruit: "#c9a26a", root: "#c9a26a", stem: "#3a7d44" },
  climbing: { leaf: "#4e9e54", fruit: "#6fbf63", stem: "#3a7d44", wood: "#9a7a55" },
  grass: { leaf: "#8fae4f", fruit: "#d9c26a", stem: "#7a8a45" },
  cob: { leaf: "#5aa64f", fruit: "#e8c84a", stem: "#4a8a3f" },
  head: { leaf: "#86c060", fruit: "#86c060", stem: "#4a8a3f" },
  gourd: { leaf: "#4e9e54", fruit: "#e0701f", stem: "#6a8a4a" },
  crown: { leaf: "#3f8f4f", fruit: "#3f8f4f", stem: "#4a8a3f" },
  berry: { leaf: "#4e9e54", fruit: "#c0303a", stem: "#3a7d44" },
};

function renderSprite(name, scale) {
  const g = newGrid(); B[name](g); outline(g);
  const P = buildPalette(BASES[name]);
  const cv = createCanvas(SZ * scale, SZ * scale); const ctx = cv.getContext("2d");
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) { const s = g[y][x]; if (!s) continue; ctx.fillStyle = P[s] || "#ff00ff"; ctx.fillRect(x * scale, y * scale, scale, scale); }
  return cv;
}

// ---------------- contact sheet ----------------
const names = Object.keys(B);
const COLS = 5, SCALE = 3, SP = 96, CELL = 112, PAD = 14, TOP = 34;
const rows = Math.ceil(names.length / COLS);
const sheet = createCanvas(COLS * CELL + PAD * 2, rows * CELL + TOP + PAD);
const sx = sheet.getContext("2d");
sx.fillStyle = "#cdbfa6"; sx.fillRect(0, 0, sheet.width, sheet.height);
sx.imageSmoothingEnabled = false;
sx.fillStyle = "#2a1d13"; sx.font = "bold 18px sans-serif";
sx.fillText("Cozy archetypes — procedural 32x32 (recolorable)", PAD, 24);
names.forEach((n, i) => {
  const c = i % COLS, r = (i / COLS) | 0;
  const x = PAD + c * CELL, y = TOP + r * CELL;
  sx.drawImage(renderSprite(n, SCALE), x + (CELL - SP) / 2, y, SP, SP);
  sx.fillStyle = "#2a1d13"; sx.font = "12px sans-serif";
  sx.fillText(n, x + (CELL - SP) / 2 + 2, y + SP + 12);
});
writeFileSync("/tmp/archetypes.png", sheet.toBuffer("image/png"));
console.log("wrote /tmp/archetypes.png", sheet.width + "x" + sheet.height, "(" + names.length + " archetypes)");
