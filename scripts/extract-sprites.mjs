import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const SRC = process.argv[2];
const OUT_PREVIEW = process.argv[3] || "/tmp/extract-preview.png";
const OUT_URLS = process.argv[4] || "/tmp/sprite-urls.json";
const TARGET = parseInt(process.argv[5] || "32", 10);

const img = await loadImage(SRC);
const W = img.width, H = img.height;
const src = createCanvas(W, H);
const sctx = src.getContext("2d");
sctx.drawImage(img, 0, 0);
const sdata = sctx.getImageData(0, 0, W, H).data;
const get = (x, y) => { const i = (y * W + x) * 4; return [sdata[i], sdata[i + 1], sdata[i + 2], sdata[i + 3]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// --- Auto-detect grid layout ---
// Find the title row height by scanning down the center column for the first
// row of "content" background (either colored or near-white).
// Card frames are gray (~197), outer gaps are near-white (~250+), dark seps are <50.
// The title text area has dark text on a light bg above the grid.

// Detect grid by finding cell boundaries.
// Strategy: scan for columns/rows of near-uniform gray (card frame borders).
const COLS = 5, ROWS = 2;

// Auto-detect grid by finding horizontal and vertical dark lines (card frame borders).
function findBands(scanHorizontal) {
  const lines = [];
  const outer = scanHorizontal ? H : W;
  const inner = scanHorizontal ? W : H;
  const threshold = 0.5;
  for (let i = 0; i < outer; i++) {
    let darkCount = 0;
    for (let j = 0; j < inner; j += 3) {
      const p = scanHorizontal ? get(j, i) : get(i, j);
      if (p[0] < 80 && p[1] < 80 && p[2] < 80) darkCount++;
    }
    if (darkCount / Math.ceil(inner / 3) > threshold) lines.push(i);
  }
  const bands = [];
  for (const v of lines) {
    if (bands.length && v - bands[bands.length - 1].end <= 2) {
      bands[bands.length - 1].end = v;
    } else {
      bands.push({ start: v, end: v });
    }
  }
  return bands;
}

function detectGrid() {
  const hBands = findBands(true);
  const vBands = findBands(false);

  // Horizontal: expect top-of-row0, bottom-of-row0/top-of-row1, bottom-of-row1
  // These may be individual bands or paired (gap between rows)
  let rowEdges;
  if (hBands.length >= 4) {
    rowEdges = [hBands[0].start, hBands[1].end, hBands[2].start, hBands[hBands.length - 1].end];
  } else if (hBands.length === 3) {
    rowEdges = [hBands[0].start, hBands[0].end, hBands[1].start, hBands[1].end, hBands[2].start, hBands[2].end];
  } else {
    return null;
  }

  // Vertical: expect paired bands (right-edge of cell N, left-edge of cell N+1)
  // Plus the first left-edge and last right-edge
  // Extract cell inner regions from band gaps
  let cellXRanges = [];
  for (let i = 0; i < vBands.length - 1; i++) {
    const gapStart = vBands[i].end + 1;
    const gapEnd = vBands[i + 1].start - 1;
    if (gapEnd - gapStart > 50) {
      cellXRanges.push({ x0: gapStart, x1: gapEnd });
    }
  }
  // If we have fewer cells than expected, some shared borders may be missing.
  // Split oversized cells: if a cell is >1.4x the median width, bisect it.
  if (cellXRanges.length < COLS) {
    const widths = cellXRanges.map(r => r.x1 - r.x0);
    const sorted = [...widths].sort((a, b) => a - b);
    const medW = sorted[sorted.length >> 1];
    const expanded = [];
    for (const r of cellXRanges) {
      const w = r.x1 - r.x0;
      if (w > medW * 1.4 && expanded.length + (cellXRanges.length - expanded.length) < COLS + 1) {
        const mid = Math.round((r.x0 + r.x1) / 2);
        expanded.push({ x0: r.x0, x1: mid - 2 });
        expanded.push({ x0: mid + 2, x1: r.x1 });
      } else {
        expanded.push(r);
      }
    }
    cellXRanges = expanded;
  }

  // Row Y ranges: from band gaps
  const cellYRanges = [];
  for (let i = 0; i < hBands.length - 1; i++) {
    const gapStart = hBands[i].end + 1;
    const gapEnd = hBands[i + 1].start - 1;
    if (gapEnd - gapStart > 50) {
      cellYRanges.push({ y0: gapStart, y1: gapEnd });
    }
  }

  return { cellXRanges, cellYRanges };
}

const grid = detectGrid();

// Build cell rectangles (inner content areas, excluding frame borders)
function buildCells() {
  if (grid && grid.cellXRanges.length === COLS && grid.cellYRanges.length === ROWS) {
    return { xRanges: grid.cellXRanges, yRanges: grid.cellYRanges };
  }
  // Fallback: uniform grid
  const cw = W / COLS, ch = H / ROWS;
  const m = Math.round(cw * 0.08);
  return {
    xRanges: Array.from({ length: COLS }, (_, i) => ({ x0: Math.round(i * cw) + m, x1: Math.round((i + 1) * cw) - m })),
    yRanges: Array.from({ length: ROWS }, (_, i) => ({ y0: Math.round(i * ch) + m, y1: Math.round((i + 1) * ch) - m })),
  };
}

const { xRanges, yRanges } = buildCells();
console.log(`Grid: ${COLS}x${ROWS}, detected=${!!grid}, cells: ${xRanges.length}x${yRanges.length}`);

// Detect background type from first cell interior (sample from top-right area to avoid number label)
const cxW = xRanges[0].x1 - xRanges[0].x0;
const cxH = yRanges[0].y1 - yRanges[0].y0;
const sampleCell = { x0: xRanges[0].x1 - Math.round(cxW * 0.3), y0: yRanges[0].y0 + 5 };
const bgSamples = [];
for (let t = 0; t < 20; t++) {
  bgSamples.push(get(sampleCell.x0 + t * 2, sampleCell.y0));
  bgSamples.push(get(sampleCell.x0 + t * 2, sampleCell.y0 + 2));
}
const bgAvg = [0, 1, 2].map(k => bgSamples.reduce((s, p) => s + p[k], 0) / bgSamples.length);
const bgType = (bgAvg[0] > 220 && bgAvg[1] > 220 && bgAvg[2] > 220 && Math.abs(bgAvg[0] - bgAvg[1]) < 15) ? "white" : "colored";
console.log(`Background: ${bgType} (avg: ${bgAvg.map(v => v.toFixed(0))})`);

// Number-label mask: fraction of inner width/height (top-left corner)
const NUM_W = 0.34, NUM_H = 0.21;

function extractCell(col, row) {
  // Inset to avoid anti-aliased frame edges
  const inset = 3;
  const x0 = xRanges[col].x0 + inset;
  const y0 = yRanges[row].y0 + inset;
  const x1 = xRanges[col].x1 - inset;
  const y1 = yRanges[row].y1 - inset;
  const cw = x1 - x0, ch = y1 - y0;

  // Cache local colors
  const pix = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) pix[y * cw + x] = get(x0 + x, y0 + y);

  const isBg = new Uint8Array(cw * ch);

  if (bgType === "white") {
    // White/checkered background: any near-white or near-gray pixel is background.
    // This is much simpler and more reliable than flood fill.
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = pix[y * cw + x];
        const isGray = Math.abs(p[0] - p[1]) < 12 && Math.abs(p[1] - p[2]) < 12;
        if (isGray && p[0] > 155) isBg[y * cw + x] = 1;
      }
    }
  } else {
    // Colored background: flood-fill from borders
    const samples = [];
    for (let t = 0; t < cw; t += 6) {
      samples.push(get(x0 + t, y0 + 1));
      samples.push(get(x0 + t, y1 - 2));
    }
    for (let t = 0; t < ch; t += 6) {
      samples.push(get(x1 - 2, y0 + t));
    }
    const med = [0, 1, 2].map((k) => {
      const v = samples.map((s) => s[k]).sort((a, b) => a - b);
      return v[v.length >> 1];
    });

    const stack = [];
    const pushIf = (x, y) => {
      if (x < 0 || x >= cw || y < 0 || y >= ch) return;
      const idx = y * cw + x;
      if (isBg[idx]) return;
      isBg[idx] = 1; stack.push(idx);
    };
    for (let x = 0; x < cw; x++) { pushIf(x, 0); pushIf(x, ch - 1); }
    for (let y = 0; y < ch; y++) { pushIf(0, y); pushIf(cw - 1, y); }
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % cw, y = (idx / cw) | 0;
      const cc = pix[idx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= cw || ny < 0 || ny >= ch) continue;
        const nidx = ny * cw + nx;
        if (isBg[nidx]) continue;
        const nc = pix[nidx];
        if (dist(nc, cc) < 30 && dist(nc, med) < 80) { isBg[nidx] = 1; stack.push(nidx); }
      }
    }
  }

  // Plant pixels = not background, excluding header/label area and watermark corner.
  // White-bg sheets have a full-width header (label box + title text) in the top ~25%.
  // Colored-bg sheets have a smaller number-label box in the top-left corner only.
  const headerH = bgType === "white" ? Math.round(ch * 0.25) : Math.round(ch * NUM_H);
  const headerW = bgType === "white" ? cw : Math.round(cw * NUM_W);
  const wmW = Math.round(cw * 0.12), wmH = Math.round(ch * 0.10);
  const opaque = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (x < headerW && y < headerH) continue;
      if (x >= cw - wmW && y >= ch - wmH) continue;
      if (!isBg[y * cw + x]) opaque[y * cw + x] = 1;
    }
  }
  // Remove tiny speckles: keep pixel only if it has >=2 opaque neighbors
  const cleaned = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!opaque[y * cw + x]) continue;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && opaque[ny * cw + nx]) n++;
      }
      if (n >= 2) cleaned[y * cw + x] = 1;
    }
  }

  // Drop small disconnected components (number-box specks, frame corners).
  const MIN_CC = 6;
  const lbl = new Int32Array(cw * ch).fill(0);
  let cur = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const start = y * cw + x;
    if (!cleaned[start] || lbl[start]) continue;
    cur++;
    const q = [start]; lbl[start] = cur; let area = 0; const members = [];
    while (q.length) {
      const idx = q.pop(); area++; members.push(idx);
      const px2 = idx % cw, py2 = (idx / cw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px2 + dx, ny = py2 + dy;
        if (nx < 0 || nx >= cw || ny < 0 || ny >= ch) continue;
        const nidx = ny * cw + nx;
        if (cleaned[nidx] && !lbl[nidx]) { lbl[nidx] = cur; q.push(nidx); }
      }
    }
    if (area < MIN_CC) for (const m of members) cleaned[m] = 0;
  }

  // bbox
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (cleaned[y * cw + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // Render cropped sprite (with alpha) to a temp canvas at source resolution
  const crop = createCanvas(bw, bh);
  const cctx = crop.getContext("2d");
  const cimg = cctx.createImageData(bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const si = ((minY + y) * cw + (minX + x));
    const di = (y * bw + x) * 4;
    if (cleaned[si]) {
      const p = get(x0 + minX + x, y0 + minY + y);
      cimg.data[di] = p[0]; cimg.data[di + 1] = p[1]; cimg.data[di + 2] = p[2]; cimg.data[di + 3] = 255;
    } else {
      cimg.data[di + 3] = 0;
    }
  }
  cctx.putImageData(cimg, 0, 0);

  return { crop, bw, bh };
}

// Downsample a cropped sprite into a 32x32 canvas, anchored bottom-center,
// fit within (TARGET-2) box, with area averaging.
function fitTo32(cell) {
  const out = createCanvas(TARGET, TARGET);
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  const maxDim = TARGET - 2;
  const scale = Math.min(maxDim / cell.bw, maxDim / cell.bh);
  const dw = Math.max(1, Math.round(cell.bw * scale));
  const dh = Math.max(1, Math.round(cell.bh * scale));
  const dx = Math.round((TARGET - dw) / 2);
  const dy = TARGET - 1 - dh; // anchor near bottom (leave 1px)
  octx.drawImage(cell.crop, 0, 0, cell.bw, cell.bh, dx, Math.max(0, dy), dw, dh);
  return out;
}

const cells = [];
let n = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const cell = extractCell(c, r);
  cells.push(cell ? fitTo32(cell) : null);
  n++;
}

// Preview: checkerboard background, sprites at 32 and 6x
const scale = 6;
const pad = 10;
const cw = TARGET * scale;
const outW = cells.length * (cw + pad) + pad;
const outH = cw + pad * 2 + 24;
const out = createCanvas(outW, outH);
const octx = out.getContext("2d");
octx.fillStyle = "#333";
octx.fillRect(0, 0, outW, outH);
octx.imageSmoothingEnabled = false;
for (let i = 0; i < cells.length; i++) {
  const dx = pad + i * (cw + pad), dy = pad;
  // checkerboard
  for (let yy = 0; yy < TARGET; yy++) for (let xx = 0; xx < TARGET; xx++) {
    octx.fillStyle = (xx + yy) % 2 ? "#5a5a5a" : "#6a6a6a";
    octx.fillRect(dx + xx * scale, dy + yy * scale, scale, scale);
  }
  if (cells[i]) octx.drawImage(cells[i], 0, 0, TARGET, TARGET, dx, dy, cw, cw);
  octx.fillStyle = "#0f0";
  octx.font = "12px monospace";
  octx.fillText(`#${i + 1}`, dx + 2, dy + cw + 14);
}
fs.writeFileSync(OUT_PREVIEW, out.toBuffer("image/png"));
console.log("Wrote", OUT_PREVIEW);

// Export the 32x32 data URLs for later use
const urls = cells.map((c) => (c ? c.toDataURL("image/png") : null));
fs.writeFileSync(OUT_URLS, JSON.stringify(urls));
console.log("Wrote", OUT_URLS);
