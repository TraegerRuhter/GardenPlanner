// Scratch sprite lab — NOT wired into the app yet. Develops the procedural
// generator (all archetypes + growth stages) and renders contact sheets for
// review. Generators emit palette SLOT ids so output recolors via the app
// palette. The algorithms here are ported verbatim into src/sprites/generate.ts.
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

function buildPalette(b) {
  const L = rampOf(b.leaf), F = rampOf(b.fruit), S = rampOf(b.stem), R = rampOf(b.root || b.fruit), W = rampOf(b.wood || "#9a7a55");
  return {
    lh: L.hi, lm: L.mid, ll: L.lo, ld: L.deep,
    fh: F.hi, fm: F.mid, fl: F.lo, fd: F.deep, fs: shift(b.fruit, +0.34, -0.12),
    sh: S.hi, sm: S.mid, sl: S.lo,
    rh: R.hi, rm: R.mid, rl: R.lo,
    kh: "#7d5c46", kl: "#5c4033",
    wh: W.hi, wl: W.lo,
    yh: "#c8b46a", ym: "#a8924f", yl: "#86703a",
    bh: "#fdf3da", bm: "#f4d676",
    ol: "#241813",
  };
}

// ---------------- grid + shape helpers ----------------
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
function fruits(g, list, r, ripe) {
  const slots = ripe ? ["fh", "fm", "fl"] : ["lm", "ll", "ld"];
  const rr = ripe ? r : Math.max(1, r - 0.6);
  for (const [fx, fy] of list) { disc(g, fx, fy, rr + 1, ["ld", "ld", "ld"]); disc(g, fx, fy, rr, slots, ripe); }
}
function blossoms(g, list) { for (const [x, y] of list) { set(g, x, y, "bm"); set(g, x, y - 1, "bh"); set(g, x - 1, y, "bm"); set(g, x + 1, y, "bm"); set(g, x, y + 1, "bm"); } }
function buds(g, list) { for (const [x, y] of list) { set(g, x, y, "ld"); set(g, x, y - 1, "bm"); } }

function outline(g) {
  const f = (x, y) => x >= 0 && x < SZ && y >= 0 && y < SZ && g[y][x] && g[y][x] !== "ol";
  const add = [];
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) if (!g[y][x] && (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) g[y][x] = "ol";
}
// shrink mature content toward bottom-center by factor t (growth)
function scaleGrid(src, t) {
  if (t >= 0.999) return src;
  const dst = newGrid(); const cx = 16, by = 30;
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const sx = Math.round(cx + (x - cx) / t), sy = Math.round(by - (by - y) / t);
    if (sx >= 0 && sx < SZ && sy >= 0 && sy < SZ && src[sy][sx]) dst[y][x] = src[sy][sx];
  }
  return dst;
}
const LEAF_TO_SENESCENT = { lh: "yh", lm: "ym", ll: "yl", ld: "yl" };
function senesce(g) { for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) { const s = g[y][x]; if (s && LEAF_TO_SENESCENT[s]) g[y][x] = LEAF_TO_SENESCENT[s]; } }

// ---------------- archetype builders: build(g, o) where o = {fruit, bloom} -----
const B = {
  bush(g, o) {
    stem(g, 16, 28, 15);
    foliage(g, [[16, 12, 9], [9, 12, 5.5], [23, 12, 5.5], [11, 7, 4.8], [21, 7, 4.8], [16, 5, 5.2], [8, 17, 4.6], [24, 17, 4.6], [16, 20, 6.2]], 16, 13);
    if (o.bud) buds(g, [[10, 13], [22, 12], [16, 8], [13, 17], [20, 18]]);
    if (o.bloom) blossoms(g, [[10, 13], [22, 11], [16, 8], [13, 17]]);
    if (o.fruit) fruits(g, [[10, 18], [22, 16], [16, 22], [23, 22], [13, 13]], 2, o.fruit === "ripe");
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
    if (o.bud) buds(g, [[12, 15], [20, 15]]);
    if (o.bloom) blossoms(g, [[12, 15], [20, 15], [16, 14]]);
    if (o.fruit) {
      const ripe = o.fruit === "ripe", n = ripe ? 12 : 8;
      const hi = ripe ? "fh" : "lm", mi = ripe ? "fm" : "ll", lo = ripe ? "fl" : "ld";
      for (const [vx, vy] of [[16, 17], [15, 18], [14, 19], [13, 20]]) set(g, vx, vy, "sl");
      for (let i = 0; i < n; i++) { const x = 9 + i, y = 25 - Math.round(i * 0.4); set(g, x, y, mi); set(g, x, y - 1, i > 0 && i < n - 1 ? hi : mi); set(g, x, y + 1, lo); }
      for (let i = 2; i < n - 2; i += 3) set(g, 9 + i, 24 - Math.round(i * 0.4), lo);
    }
  },
  tall(g, o) {
    stem(g, 16, 28, 6);
    for (const [sy, dir] of [[22, -1], [18, 1], [14, -1], [10, 1]]) foliage(g, [[16 + dir * 4, sy, 3.6]], 16 + dir * 4, sy);
    if (o.bud) { disc(g, 16, 7, 3, ["fh", "fm", "fl"]); return; }
    if (o.bloom || o.fruit) {
      disc(g, 16, 7, 5, ["fh", "fm", "fl"]);
      const seed = o.fruit === "ripe" ? 4 : o.fruit === "set" ? 3 : 2;
      disc(g, 16, 7, seed, o.fruit ? ["yl", "ym", "yl"] : ["fd", "fd", "fd"]);
    }
  },
  leafy(g) {
    foliage(g, [[16, 18, 7], [9, 17, 4.5], [23, 17, 4.5], [12, 14, 4.5], [20, 14, 4.5], [16, 13, 5]], 16, 16);
    for (const [dx, dy] of [[-5, -2], [5, -2], [-6, 1], [6, 1], [0, -4]]) for (let i = 0; i < 5; i++) set(g, 16 + Math.round(dx * i / 5), 16 + Math.round(dy * i / 5), "ld");
  },
  herb(g, o) {
    stem(g, 16, 28, 18);
    foliage(g, [[16, 15, 4.5], [12, 16, 3], [20, 16, 3], [14, 12, 2.8], [18, 12, 2.8], [16, 11, 3]], 16, 14);
    if (o.bud) buds(g, [[13, 11], [19, 11], [16, 9]]);
    else if (o.bloom || o.fruit) for (const [x, y] of [[13, 11], [19, 11], [16, 9]]) { set(g, x, y, "fm"); set(g, x, y - 1, "fh"); set(g, x + 1, y, "fl"); }
  },
  flower(g, o) {
    stem(g, 16, 28, 12);
    foliage(g, [[12, 20, 3], [20, 20, 3]], 16, 20);
    if (o.bloom || o.fruit) { for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; disc(g, 16 + Math.round(Math.cos(ang) * 4), 9 + Math.round(Math.sin(ang) * 4), 1.7, ["fh", "fm", "fl"]); } disc(g, 16, 9, 2, ["fd", "fd", "fd"]); }
    else { foliage(g, [[16, 11, 3]], 16, 11); }
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
    if (o.bud) buds(g, [[15, 12], [18, 18]]);
    if (o.bloom) blossoms(g, [[15, 12], [18, 18], [13, 16]]);
    if (o.fruit) {
      const ripe = o.fruit === "ripe", len = ripe ? 5 : 3, c = ripe ? "fh" : "lm", c2 = ripe ? "fm" : "ll";
      for (const [fx, fy] of [[15, 17], [18, 10], [13, 21]]) for (let i = 0; i < len; i++) set(g, fx, fy + i, i < 1 ? c : c2);
    }
  },
  grass(g, o) {
    blades(g, 16, 9, 28, [-7, -5, -3, -1, 1, 3, 5, 7], "lh", "lm");
    if (o.bloom) for (const dx of [-7, -3, 1, 5]) set(g, 16 + dx, 7, "bm");
    if (o.fruit) { const ripe = o.fruit === "ripe"; for (const dx of [-7, -3, 1, 5]) disc(g, 16 + dx, 7, ripe ? 1.7 : 1.2, ripe ? ["fh", "fm", "fl"] : ["lm", "ll", "ld"]); }
  },
  cob(g, o) {
    stem(g, 16, 28, 5);
    for (const dir of [-1, 1]) for (let i = 0; i < 8; i++) set(g, 16 + dir * (1 + i), 12 + i + Math.round(i * i * 0.06), i < 5 ? "lm" : "ll");
    if (o.bloom || o.fruit) for (const dx of [-2, -1, 0, 1, 2]) { set(g, 16 + dx, 4, "yh"); set(g, 16 + dx, 3, "yl"); } // tassel
    if (o.fruit) {
      if (o.fruit === "ripe") {
        for (let y = 11; y < 23; y++) for (let x = 16; x <= 22; x++) { const dx = (x - 19) / 3.4, dy = (y - 17) / 6.2; if (dx * dx + dy * dy <= 1) set(g, x, y, y % 2 === 0 ? "fh" : "fm"); }
        for (let y = 12; y < 23; y++) set(g, 22, y, "fl");
        set(g, 19, 22, "fl");
        for (let i = 0; i < 5; i++) { set(g, 16 + i, 21 + Math.round(i * 0.3), "lm"); set(g, 16 + i, 22 + Math.round(i * 0.3), "ll"); }
        for (const dx of [0, 1, 2]) set(g, 19 + dx, 10, "yh"); // silk
      } else {
        for (let y = 13; y < 22; y++) for (let x = 17; x <= 21; x++) { const dx = (x - 19) / 2.8, dy = (y - 17.5) / 5; if (dx * dx + dy * dy <= 1) set(g, x, y, x < 19 ? "lm" : "ll"); }
      }
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
    // grounded sprawling vine curving from the base out across the soil
    const path = [[16, 27], [15, 25], [14, 23], [13, 21], [13, 19], [14, 18], [16, 17], [18, 16], [20, 16], [22, 16]];
    for (const [vx, vy] of path) { set(g, vx, vy, "sm"); set(g, vx + 1, vy, "sl"); }
    foliage(g, [[12, 16, 3.2], [9, 19, 2.8], [22, 14, 3]], 12, 17);
    set(g, 23, 16, "sl"); set(g, 24, 15, "sm"); set(g, 24, 14, "sm"); set(g, 23, 14, "sl"); // tendril curl
    if (o.bud) buds(g, [[10, 19], [21, 14]]);
    if (o.bloom) blossoms(g, [[10, 19], [21, 14], [9, 17]]);
    if (o.fruit) {
      const ripe = o.fruit === "ripe", r = ripe ? 6 : 4, cy = 30 - r;
      for (let y = 17; y <= cy - r; y++) set(g, 18, y, "sm"); // peduncle vine→fruit
      disc(g, 18, cy, r, ripe ? ["fh", "fm", "fl"] : ["lm", "ll", "ld"], ripe);
      if (ripe) for (const dx of [-3, 0, 3]) for (let y = -r + 1; y <= r - 1; y++) if (dx * dx + y * y <= r * r) set(g, 18 + dx, cy + y, "fl");
    }
  },
  crown(g, o) {
    stem(g, 16, 28, 16);
    foliage(g, [[10, 22, 3.5], [22, 22, 3.5], [12, 19, 3], [20, 19, 3]], 16, 21);
    if (o.fruit === "ripe") { foliage(g, [[16, 12, 6], [11, 13, 3.5], [21, 13, 3.5], [13, 9, 3], [19, 9, 3], [16, 8, 3.5]], 16, 12); for (let i = 0; i < 22; i++) { const x = 10 + ((i * 7) % 14), y = 8 + ((i * 5) % 9); if ((x - 16) ** 2 + (y - 12) ** 2 < 36) set(g, x, y, "ld"); } }
    else if (o.bud || o.bloom || o.fruit) { foliage(g, [[16, 14, 4], [12, 15, 2.6], [20, 15, 2.6], [16, 11, 2.8]], 16, 13); for (let i = 0; i < 16; i++) { const x = 12 + ((i * 5) % 9), y = 11 + ((i * 5) % 7); if ((x - 16) ** 2 + (y - 13) ** 2 < 18) set(g, x, y, "ld"); } }
    else { foliage(g, [[16, 15, 3.5]], 16, 15); }
  },
  berry(g, o) {
    foliage(g, [[16, 16, 7], [10, 16, 4], [22, 16, 4], [13, 12, 3.5], [19, 12, 3.5], [16, 11, 4]], 16, 15);
    if (o.bud) buds(g, [[11, 16], [19, 16], [15, 13]]);
    if (o.bloom) blossoms(g, [[11, 16], [19, 16], [15, 13]]);
    if (o.fruit) fruits(g, [[11, 20], [15, 21], [19, 20], [13, 18], [17, 18], [22, 19]], 1.6, o.fruit === "ripe");
  },
  tree(g, o) {
    for (let y = 16; y < 29; y++) { set(g, 15, y, "sh"); set(g, 16, y, "sm"); set(g, 17, y, "sl"); }
    set(g, 14, 28, "sl"); set(g, 18, 28, "sl");
    foliage(g, [[16, 11, 9], [9, 12, 5], [23, 12, 5], [11, 6, 5], [21, 6, 5], [16, 4, 6], [16, 16, 6]], 16, 10);
    if (o.bud) buds(g, [[10, 10], [22, 10], [16, 5], [13, 14], [20, 14]]);
    if (o.bloom) blossoms(g, [[10, 10], [22, 9], [16, 5], [13, 14]]);
    if (o.fruit) fruits(g, [[10, 12], [22, 11], [16, 6], [13, 15], [20, 15], [16, 13]], 2, o.fruit === "ripe");
  },
  cane(g, o) {
    for (const dir of [-1, 1]) for (const k of [0, 1]) {
      for (let i = 0; i <= 17; i++) { const t = i / 17, x = 16 + dir * Math.round((1 + k) + t * (5 + k * 5)), y = 28 - Math.round(t * 22 - t * t * 6); set(g, x, y, "sm"); set(g, x, y + 1, "sl"); }
    }
    foliage(g, [[10, 12, 2.8], [22, 12, 2.8], [13, 8, 2.4], [19, 8, 2.4], [16, 16, 2.6]], 16, 12);
    const pts = [[10, 12], [22, 12], [13, 9], [19, 9], [16, 7], [12, 16], [20, 16]];
    if (o.bud) buds(g, pts.slice(0, 3));
    if (o.bloom) blossoms(g, pts.slice(0, 4));
    if (o.fruit) fruits(g, pts, 1.5, o.fruit === "ripe");
  },
  shrub(g, o) {
    for (const dx of [-4, 0, 4]) for (let y = 18; y < 29; y++) set(g, 16 + dx, y, "wl");
    foliage(g, [[16, 12, 8], [9, 14, 4.5], [23, 14, 4.5], [12, 8, 4], [20, 8, 4], [16, 6, 4.5], [16, 17, 5]], 16, 12);
    if (o.bud) buds(g, [[10, 12], [22, 12], [16, 8], [13, 16], [20, 16]]);
    if (o.bloom) blossoms(g, [[10, 12], [22, 12], [16, 8], [13, 16]]);
    if (o.fruit) fruits(g, [[10, 14], [22, 13], [16, 9], [13, 17], [19, 17], [16, 15]], 1.5, o.fruit === "ripe");
  },
  succulent(g, o) {
    const tips = [[16, 7], [9, 11], [23, 11], [11, 17], [21, 17], [13, 8], [19, 8], [16, 19]];
    for (const [tx, ty] of tips) {
      for (let i = 0; i <= 14; i++) { const t = i / 14, x = Math.round(16 + (tx - 16) * t), y = Math.round(27 + (ty - 27) * t), w = Math.max(0, Math.round((1 - t) * 1.7)); for (let d = -w; d <= w; d++) set(g, x + d, y, d < 0 ? "lh" : d > 0 ? "ll" : "lm"); }
    }
    if (o.bloom || o.fruit) { for (let y = 6; y < 16; y++) set(g, 16, y, "sm"); blossoms(g, [[16, 5], [15, 8], [17, 11]]); }
  },
  fern(g) {
    for (let f = 0; f < 5; f++) {
      const dir = f - 2;
      for (let i = 0; i < 15; i++) { const t = i / 14, x = 16 + Math.round(dir * 2.2 * t * (1 + t)), y = 27 - Math.round(i * 1.5); set(g, x, y, "sm"); const tick = Math.max(0, Math.round((1 - t) * 2.2)); for (let d = 1; d <= tick; d++) { set(g, x - d, y + 1, "lm"); set(g, x + d, y, "lh"); } }
    }
  },
  tuber(g, o) {
    soilBand(g, 21);
    foliage(g, [[16, 13, 4.5], [11, 14, 3.2], [21, 14, 3.2], [13, 9, 2.8], [19, 9, 2.8], [16, 8, 3]], 16, 12);
    if (o.bloom) blossoms(g, [[12, 10], [20, 10], [16, 7]]);
    if (o.fruit) { const ripe = o.fruit === "ripe"; for (const [tx, ty] of [[12, 25], [20, 25], [16, 27]]) disc(g, tx, ty, ripe ? 3 : 2, ripe ? ["rh", "rm", "rl"] : ["lm", "ll", "ld"], ripe); }
  },
  stalk(g, o) {
    for (const dx of [-5, -2, 1, 4]) { for (let y = 10; y < 29; y++) { set(g, 16 + dx, y, "sh"); set(g, 16 + dx + 1, y, "sl"); } foliage(g, [[16 + dx, 9, 2.4]], 16 + dx, 9); }
    if (o.bloom || o.fruit) foliage(g, [[16, 8, 3.5], [12, 9, 2.4], [20, 9, 2.4]], 16, 8);
  },
  cactus(g, o) {
    disc(g, 16, 22, 5, ["lh", "lm", "ll"]);
    disc(g, 11, 14, 4, ["lh", "lm", "ll"]);
    disc(g, 21, 13, 4, ["lh", "lm", "ll"]);
    for (const [sx, sy] of [[14, 20], [18, 24], [16, 18], [9, 13], [13, 12], [21, 10], [23, 15]]) set(g, sx, sy, "bh");
    if (o.bloom) blossoms(g, [[11, 9], [21, 8], [16, 16]]);
    if (o.fruit) fruits(g, [[11, 9], [21, 8], [16, 16]], 1.8, o.fruit === "ripe");
  },
  sprouts(g, o) {
    for (let y = 6; y < 29; y++) { set(g, 15, y, "sh"); set(g, 16, y, "sm"); set(g, 17, y, "sl"); }
    foliage(g, [[16, 6, 4], [12, 8, 2.6], [20, 8, 2.6]], 16, 6);
    if (o.fruit) { const ripe = o.fruit === "ripe"; for (const [sx, sy] of [[13, 12], [19, 14], [13, 18], [19, 20], [13, 24], [19, 26]]) disc(g, sx, sy, ripe ? 2 : 1.4, ["lh", "lm", "ll"]); }
    else if (o.bloom || o.bud) for (const [sx, sy] of [[14, 13], [18, 17], [14, 21], [18, 25]]) set(g, sx, sy, "ll");
  },
  mat(g, o) {
    foliage(g, [[16, 24, 6], [8, 25, 4], [24, 25, 4], [12, 22, 3.5], [20, 22, 3.5], [16, 21, 4]], 16, 24);
    for (const x of [5, 27]) { set(g, x, 27, "sl"); set(g, x, 26, "sm"); }
    if (o.bud) buds(g, [[10, 22], [22, 22], [16, 20]]);
    if (o.bloom) blossoms(g, [[10, 22], [22, 22], [16, 20], [13, 24], [19, 24]]);
    if (o.fruit) fruits(g, [[10, 23], [22, 23], [16, 21], [13, 25], [19, 25]], 1.4, o.fruit === "ripe");
  },
};

// shared young/late stages (archetype-independent)
function seed(g) { mound(g); set(g, 15, 27, "ol"); set(g, 16, 27, "sl"); set(g, 16, 26, "sm"); }
function sprout0(g) { mound(g); set(g, 16, 27, "sm"); set(g, 16, 26, "sm"); set(g, 16, 25, "lm"); set(g, 15, 25, "lh"); set(g, 17, 26, "ll"); }
function sprout1(g) { mound(g); stem(g, 16, 28, 24); foliage(g, [[14, 23, 2.2], [18, 23, 2.2]], 16, 23); }
function stub(g) { mound(g); for (let y = 22; y < 29; y++) { set(g, 15, y, "wh"); set(g, 16, y, "wl"); } }

// ---------------- stage model ----------------
const STAGES = ["planted", "germination", "sprout", "seedling", "vegetative", "budding", "flowering", "fruiting", "harvest", "senescence", "dormant"];
const GROWTH = {
  planted: { kind: "seed" }, germination: { kind: "sprout0" }, sprout: { kind: "sprout1" },
  seedling: { kind: "grow", t: 0.55, o: {} }, vegetative: { kind: "grow", t: 0.78, o: {} },
  budding: { kind: "grow", t: 0.86, o: { bud: true } }, flowering: { kind: "grow", t: 0.95, o: { bloom: true } },
  fruiting: { kind: "grow", t: 0.99, o: { fruit: "set" } }, harvest: { kind: "grow", t: 1, o: { fruit: "ripe" } },
  senescence: { kind: "senesce" }, dormant: { kind: "stub" },
};

function makeGrid(name, stage) {
  const G = GROWTH[stage];
  if (G.kind === "seed") { const g = newGrid(); seed(g); outline(g); return g; }
  if (G.kind === "sprout0") { const g = newGrid(); sprout0(g); outline(g); return g; }
  if (G.kind === "sprout1") { const g = newGrid(); sprout1(g); outline(g); return g; }
  if (G.kind === "stub") { const g = newGrid(); stub(g); outline(g); return g; }
  if (G.kind === "senesce") { const g = newGrid(); B[name](g, { fruit: false, bloom: false }); senesce(g); const s = scaleGrid(g, 0.9); mound(s); outline(s); return s; }
  // grow: build mature (no mound), scale toward soil, add mound, outline
  const m = newGrid(); B[name](m, G.o || {});
  const g = scaleGrid(m, G.t); mound(g); outline(g);
  return g;
}

function renderGrid(grid, P, scale) {
  const cv = createCanvas(SZ * scale, SZ * scale); const ctx = cv.getContext("2d");
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) { const s = grid[y][x]; if (!s) continue; ctx.fillStyle = P[s] || "#ff00ff"; ctx.fillRect(x * scale, y * scale, scale, scale); }
  return cv;
}

const BASES = {
  bush: { leaf: "#58a854", fruit: "#d23c2e", stem: "#3a7d44" },
  cob: { leaf: "#5aa64f", fruit: "#e8c84a", stem: "#4a8a3f" },
  vine: { leaf: "#4e9e54", fruit: "#3f8f4f", stem: "#6a8a4a" },
  berry: { leaf: "#4e9e54", fruit: "#c0303a", stem: "#3a7d44" },
  root: { leaf: "#5fae54", fruit: "#e88a2e", root: "#e88a2e", stem: "#3a7d44" },
  flower: { leaf: "#4e9e54", fruit: "#e76fb3", stem: "#3a7d44" },
  gourd: { leaf: "#4e9e54", fruit: "#e0701f", stem: "#6a8a4a" },
};

// ---------------- lifecycle contact sheet ----------------
const ARCHES = ["bush", "gourd", "berry", "flower"];
const SCALE = 2, SP = 64, CW = 66, CH = 78, PADX = 10, TOP = 40, LEFT = 64;
const sheet = createCanvas(LEFT + STAGES.length * CW + PADX, TOP + ARCHES.length * CH + PADX);
const sx = sheet.getContext("2d");
sx.fillStyle = "#cdbfa6"; sx.fillRect(0, 0, sheet.width, sheet.height);
sx.imageSmoothingEnabled = false;
sx.fillStyle = "#2a1d13"; sx.font = "bold 15px sans-serif";
sx.fillText("Growth lifecycle — procedural 32x32", PADX, 18);
sx.font = "9px sans-serif";
STAGES.forEach((s, i) => sx.fillText(s.slice(0, 9), LEFT + i * CW + 2, TOP - 4));
ARCHES.forEach((name, r) => {
  sx.font = "bold 11px sans-serif"; sx.fillText(name, 6, TOP + r * CH + 36);
  const P = buildPalette(BASES[name]);
  STAGES.forEach((stage, c) => {
    const grid = makeGrid(name, stage);
    sx.drawImage(renderGrid(grid, P, SCALE), LEFT + c * CW + 1, TOP + r * CH, SP, SP);
  });
});
writeFileSync("/tmp/lifecycle.png", sheet.toBuffer("image/png"));
console.log("wrote /tmp/lifecycle.png", sheet.width + "x" + sheet.height);

// ---------------- real-plant verification (mirrors app buildSlotPalette) ------
// Same slot derivation as src/sprites/generate.ts, fed the same category+accent
// colors as src/sprites/sprites.ts, to confirm the actual in-app output.
function appPalette(p) {
  return {
    lh: shift(p.l, 0.1), lm: p.l, ll: p.L, ld: shift(p.L, -0.12),
    fh: shift(p.f, 0.1), fm: p.f, fl: p.F, fd: shift(p.F, -0.12), fs: shift(p.f, 0.34, -0.12),
    sh: shift(p.s, 0.1), sm: p.s, sl: shift(p.s, -0.13),
    rh: shift(p.f, 0.12), rm: p.f, rl: p.F,
    kh: p.m, kl: p.M,
    wh: shift(p.w, 0.1), wl: shift(p.w, -0.13),
    yh: shift(p.y, 0.1), ym: p.y, yl: shift(p.y, -0.14),
    bh: "#fdf3da", bm: "#f4d676",
    ol: "#241813",
  };
}
const BP = { m: "#7d5c46", M: "#5c4033", s: "#3a7d44", l: "#58a854", L: "#3f8f4f", y: "#b8a05a", w: "#8a6a4f" };
const REAL = [
  { name: "tomato", shape: "bush", p: { ...BP, f: "#d23c2e", F: "#a02a20" } },
  { name: "carrot", shape: "root", p: { ...BP, f: "#e88a2e", F: "#c06a1e" } },
  { name: "lettuce", shape: "leafy", p: { ...BP, f: "#8fcf6f", F: "#6aa84f" } },
  { name: "sunflower", shape: "tall", p: { ...BP, f: "#f2c12e", F: "#d29a1e" } },
  { name: "pumpkin", shape: "gourd", p: { ...BP, f: "#e0701f", F: "#b4540f" } },
  { name: "watermelon", shape: "gourd", p: { ...BP, f: "#4a8f54", F: "#2a5c33" } },
  { name: "strawberry", shape: "berry", p: { ...BP, f: "#e23b4b", F: "#b22a38" } },
  { name: "broccoli", shape: "crown", p: { ...BP, f: "#3f8f4f", F: "#2f6f3e" } },
  { name: "corn", shape: "cob", p: { ...BP, f: "#e8c84a", F: "#c2a52e" } },
  { name: "onion", shape: "bulb", p: { ...BP, f: "#c9a26a", F: "#a8854f" } },
  { name: "basil", shape: "herb", p: { m: "#7d5c46", M: "#5c4033", s: "#3a7d44", l: "#6fbf63", L: "#4c9950", y: "#b8a05a", w: "#8a6a4f", f: "#efe9ff", F: "#cfc6ee" } },
];
const RST = ["seedling", "vegetative", "flowering", "fruiting", "harvest"];
const RS = 2, RSP = 64, RCW = 66, RCH = 78, RLEFT = 66, RTOP = 40, RPAD = 10;
const rsheet = createCanvas(RLEFT + RST.length * RCW + RPAD, RTOP + REAL.length * RCH + RPAD);
const rx = rsheet.getContext("2d");
rx.fillStyle = "#cdbfa6"; rx.fillRect(0, 0, rsheet.width, rsheet.height);
rx.imageSmoothingEnabled = false;
rx.fillStyle = "#2a1d13"; rx.font = "bold 15px sans-serif";
rx.fillText("Real plants — app palette derivation", RPAD, 18);
rx.font = "10px sans-serif";
RST.forEach((s, i) => rx.fillText(s, RLEFT + i * RCW + 2, RTOP - 4));
REAL.forEach((plant, r) => {
  rx.font = "bold 11px sans-serif"; rx.fillText(plant.name, 6, RTOP + r * RCH + 36);
  const P = appPalette(plant.p);
  RST.forEach((stage, c) => rx.drawImage(renderGrid(makeGrid(plant.shape, stage), P, RS), RLEFT + c * RCW + 1, RTOP + r * RCH, RSP, RSP));
});
writeFileSync("/tmp/realplants.png", rsheet.toBuffer("image/png"));
console.log("wrote /tmp/realplants.png", rsheet.width + "x" + rsheet.height);

// ---------------- new archetypes review sheet ----------------
const NEW = [
  { name: "apple", shape: "tree", p: { ...BP, f: "#d6403a", F: "#a82c28" } },
  { name: "pear", shape: "tree", p: { ...BP, f: "#c3d24a", F: "#9aa82e" } },
  { name: "raspberry", shape: "cane", p: { ...BP, f: "#c0304f", F: "#8e2038" } },
  { name: "blackberry", shape: "cane", p: { ...BP, f: "#3a2a4a", F: "#241a30" } },
  { name: "blueberry", shape: "shrub", p: { ...BP, f: "#5566b0", F: "#3a4684" } },
  { name: "strawberry", shape: "mat", p: { ...BP, l: "#6a9a5a", L: "#4f7a40", f: "#e23b4b", F: "#b22a38" } },
  { name: "potato", shape: "tuber", p: { ...BP, f: "#c9a26a", F: "#9a774a" } },
  { name: "rhubarb", shape: "stalk", p: { ...BP, l: "#8fb05a", L: "#6c8a3e", s: "#c0392b", f: "#c0392b", F: "#8e2b20" } },
  { name: "asparagus", shape: "fern", p: { ...BP, l: "#4e9e54", L: "#3a7d44", f: "#6aa83f", F: "#4f8a2c" } },
  { name: "aloe_vera", shape: "succulent", p: { ...BP, l: "#6fae84", L: "#4c8a64", f: "#e8703a", F: "#bd5526" } },
  { name: "prickly_pear", shape: "cactus", p: { ...BP, l: "#5aa86a", L: "#3f7d4c", f: "#c0407a", F: "#922f5c" } },
];
const NST = ["seedling", "vegetative", "flowering", "fruiting", "harvest"];
const NS = 2, NSP = 64, NCW = 66, NCH = 78, NLEFT = 72, NTOP = 40, NPAD = 10;
const nsheet = createCanvas(NLEFT + NST.length * NCW + NPAD, NTOP + NEW.length * NCH + NPAD);
const nx = nsheet.getContext("2d");
nx.fillStyle = "#cdbfa6"; nx.fillRect(0, 0, nsheet.width, nsheet.height);
nx.imageSmoothingEnabled = false;
nx.fillStyle = "#2a1d13"; nx.font = "bold 15px sans-serif";
nx.fillText("New archetypes (10)", NPAD, 18);
nx.font = "10px sans-serif";
NST.forEach((s, i) => nx.fillText(s, NLEFT + i * NCW + 2, NTOP - 4));
NEW.forEach((a, r) => {
  nx.font = "bold 11px sans-serif"; nx.fillText(a.name, 4, NTOP + r * NCH + 36);
  const P = appPalette(a.p);
  NST.forEach((stage, c) => nx.drawImage(renderGrid(makeGrid(a.shape, stage), P, NS), NLEFT + c * NCW + 1, NTOP + r * NCH, NSP, NSP));
});
writeFileSync("/tmp/new10.png", nsheet.toBuffer("image/png"));
console.log("wrote /tmp/new10.png", nsheet.width + "x" + nsheet.height);

// ---------------- full library showcase: all 25 archetypes at harvest --------
const SHOWCASE = {
  bush: ["#58a854", "#d23c2e"], root: ["#5fae54", "#e88a2e"], vine: ["#4e9e54", "#3f8f4f"], tall: ["#5aa64f", "#e8c24a"], leafy: ["#7cc35f", "#7cc35f"],
  herb: ["#5fae54", "#b39ed8"], flower: ["#4e9e54", "#e76fb3"], bulb: ["#6aae5a", "#c9a26a"], climbing: ["#4e9e54", "#6fbf63"], grass: ["#8fae4f", "#d9c26a"],
  cob: ["#5aa64f", "#e8c84a"], head: ["#86c060", "#86c060"], gourd: ["#4e9e54", "#e0701f"], crown: ["#3f8f4f", "#3f8f4f"], berry: ["#4e9e54", "#c0303a"],
  tree: ["#4e9e54", "#d6403a"], cane: ["#4e9e54", "#c0304f"], shrub: ["#4e9e54", "#5566b0"], succulent: ["#6fae84", "#e8703a"], fern: ["#4e9e54", "#3a7d44"],
  tuber: ["#5fae54", "#c9a26a"], stalk: ["#8fb05a", "#8fb05a"], cactus: ["#5aa86a", "#c0407a"], sprouts: ["#4f8a4a", "#4f8a4a"], mat: ["#6a9a5a", "#9a7cc0"],
};
const ALL = Object.keys(SHOWCASE);
const ACOLS = 5, ASC = 3, ASP = 96, ACW = 104, ACH = 116, APAD = 12, ATOP = 34;
const arows = Math.ceil(ALL.length / ACOLS);
const asheet = createCanvas(ACOLS * ACW + APAD * 2, arows * ACH + ATOP + APAD);
const ax = asheet.getContext("2d");
ax.fillStyle = "#cdbfa6"; ax.fillRect(0, 0, asheet.width, asheet.height);
ax.imageSmoothingEnabled = false;
ax.fillStyle = "#2a1d13"; ax.font = "bold 18px sans-serif";
ax.fillText("Full archetype library — 25 shapes (harvest)", APAD, 24);
ALL.forEach((shape, i) => {
  const c = i % ACOLS, r = (i / ACOLS) | 0, x = APAD + c * ACW, y = ATOP + r * ACH;
  const [l, f] = SHOWCASE[shape];
  const P = appPalette({ ...BP, l, L: shift(l, -0.12), f, F: shift(f, -0.12) });
  ax.drawImage(renderGrid(makeGrid(shape, "harvest"), P, ASC), x + (ACW - ASP) / 2, y, ASP, ASP);
  ax.fillStyle = "#2a1d13"; ax.font = "12px sans-serif";
  ax.fillText(shape, x + (ACW - ASP) / 2 + 2, y + ASP + 12);
});
writeFileSync("/tmp/all25.png", asheet.toBuffer("image/png"));
console.log("wrote /tmp/all25.png", asheet.width + "x" + asheet.height);
