import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const SRC = process.argv[2];
const OUT_PREVIEW = process.argv[3] || "/tmp/extract-preview.png";
const TARGET = 32;

const img = await loadImage(SRC);
const W = img.width, H = img.height;
const src = createCanvas(W, H);
const sctx = src.getContext("2d");
sctx.drawImage(img, 0, 0);
const sdata = sctx.getImageData(0, 0, W, H).data;
const get = (x, y) => { const i = (y * W + x) * 4; return [sdata[i], sdata[i + 1], sdata[i + 2], sdata[i + 3]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Grid layout
const COLS = 5, ROWS = 2;
const gridTop = 39;
const cellW = W / COLS;
const cellH = (H - gridTop) / ROWS;

// Inner content margin (drop the decorative frame)
const MARGIN = 22;
// Number-label mask: fraction of inner width/height (top-left corner)
const NUM_W = 0.34, NUM_H = 0.21;

function extractCell(col, row) {
  const x0 = Math.round(col * cellW) + MARGIN;
  const y0 = Math.round(gridTop + row * cellH) + MARGIN;
  const x1 = Math.round((col + 1) * cellW) - MARGIN;
  const y1 = Math.round(gridTop + (row + 1) * cellH) - MARGIN;
  const cw = x1 - x0, ch = y1 - y0;

  // Sample background from inner edges (avoid center where plant is)
  const samples = [];
  for (let t = 0; t < cw; t += 6) {
    samples.push(get(x0 + t, y0 + 1));      // top edge
    samples.push(get(x0 + t, y1 - 2));      // bottom edge
  }
  for (let t = 0; t < ch; t += 6) {
    samples.push(get(x1 - 2, y0 + t));      // right edge
  }
  // median bg
  const med = [0, 1, 2].map((k) => {
    const v = samples.map((s) => s[k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });

  // Cache local colors
  const pix = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) pix[y * cw + x] = get(x0 + x, y0 + y);

  // Flood-fill background from all borders. Expand to a neighbor when it is
  // close to the current background pixel (smooth gradient) AND not wildly far
  // from the sampled bg median (so anti-alias bridges don't eat the plant).
  const isBg = new Uint8Array(cw * ch);
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

  // Plant pixels = not background, excluding the number-label corner (top-left)
  // and a small watermark/sparkle corner (bottom-right of the sheet).
  const numW = Math.round(cw * NUM_W), numH = Math.round(ch * NUM_H);
  const wmW = Math.round(cw * 0.12), wmH = Math.round(ch * 0.10);
  const opaque = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (x < numW && y < numH) continue;
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
  // Keep anything >= MIN_CC so legitimately small clusters (debris stage) stay.
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
fs.writeFileSync("/tmp/sunflower-urls.json", JSON.stringify(urls));
console.log("Wrote /tmp/sunflower-urls.json");
