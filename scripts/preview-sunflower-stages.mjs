// Render the registered sunflower sprites exactly as the app would: each 32x32
// PNG drawn on a tile background, upscaled nearest-neighbor.
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const mod = fs.readFileSync("src/sprites/png/sunflower.ts", "utf8");
const order = ["planted","germination","sprout","seedling","vegetative","budding","flowering","fruiting","harvest","senescence","dormant"];
const urls = {};
for (const stage of order) {
  const m = mod.match(new RegExp(`${stage}: "(data:image/png;base64,[^"]+)"`));
  if (m) urls[stage] = m[1];
}

const scale = 5, tile = 32 * scale, pad = 8;
const cols = order.length;
const out = createCanvas(cols * (tile + pad) + pad, tile + pad * 2 + 28);
const ctx = out.getContext("2d");
ctx.fillStyle = "#bcd3a0"; ctx.fillRect(0, 0, out.width, out.height); // garden-ish bg
ctx.fillStyle = "#234";
ctx.font = "bold 15px monospace";
ctx.fillText("SUNFLOWER — extracted sprites, app-rendered", pad, 18);
ctx.imageSmoothingEnabled = false;
for (let i = 0; i < order.length; i++) {
  const url = urls[order[i]];
  const dx = pad + i * (tile + pad), dy = 26;
  ctx.fillStyle = "#cfe0b8"; ctx.fillRect(dx, dy, tile, tile);
  if (url) { const img = await loadImage(url); ctx.drawImage(img, 0, 0, 32, 32, dx, dy, tile, tile); }
  ctx.fillStyle = "#234"; ctx.font = "10px monospace";
  ctx.fillText(order[i].slice(0, 10), dx + 1, dy + tile + 12);
}
fs.writeFileSync("/tmp/sunflower-final.png", out.toBuffer("image/png"));
console.log("Wrote /tmp/sunflower-final.png");
