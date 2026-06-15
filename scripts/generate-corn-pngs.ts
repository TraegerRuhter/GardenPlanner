import { createCanvas } from "canvas";
import * as fs from "fs";

const RES = 32;
const SOIL_ROWS = 8;
const CONTENT = RES - SOIL_ROWS; // 24

// Rich color palette
const C = {
  stalkLight: "#3a7d44",
  stalkMid: "#2d6636",
  stalkDark: "#1f4f28",
  leafHighlight: "#6fc068",
  leafLight: "#58a854",
  leafMid: "#3f8f4f",
  leafDark: "#2d7340",
  leafVDark: "#1f5c2e",
  kernelBright: "#f0d040",
  kernelMid: "#d8b830",
  kernelDark: "#c0a020",
  huskLight: "#5a9a4a",
  huskMid: "#4a8040",
  huskDark: "#3a6630",
  tasselLight: "#d4c070",
  tasselMid: "#b8a050",
  tasselDark: "#9c8040",
  soilLight: "#7d5c46",
  soilDark: "#5c4033",
  dryLight: "#b8a060",
  dryMid: "#9c8848",
  dryDark: "#806838",
  wood: "#8a6a4f",
  woodDark: "#6a5040",
  seed: "#c8a050",
  seedDark: "#a08030",
  transparent: "rgba(0,0,0,0)",
};

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

function px(ctx: Ctx, x: number, y: number, color: string) {
  if (x < 0 || x >= RES || y < 0 || y >= RES) return;
  ctx!.fillStyle = color;
  ctx!.fillRect(x, y, 1, 1);
}

function drawSoil(ctx: Ctx) {
  const y0 = CONTENT;
  for (let r = 0; r < SOIL_ROWS; r++) {
    for (let c = 0; c < RES; c++) {
      const row = y0 + r;
      if (r < 2 && c >= 8 && c < 24) px(ctx, c, row, C.soilLight);
      else if (r < 4 && c >= 4 && c < 28) px(ctx, c, row, c >= 8 && c < 24 ? C.soilDark : C.soilLight);
      else if (r < 6 && c >= 2 && c < 30) px(ctx, c, row, c >= 6 && c < 26 ? C.soilDark : C.soilLight);
    }
  }
}

function drawStalk(ctx: Ctx, topY: number, botY: number, cx: number, w: number, color?: string) {
  const cl = color || C.stalkMid;
  const cd = color ? darken(color, 0.2) : C.stalkDark;
  for (let y = topY; y <= Math.min(botY, CONTENT - 1); y++) {
    for (let dx = 0; dx < w; dx++) {
      px(ctx, cx + dx, y, dx === 0 ? cd : cl);
    }
  }
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

function drawLeaf(
  ctx: Ctx,
  attachY: number,
  stalkCx: number,
  stalkW: number,
  side: "left" | "right",
  width: number,
  droopRows: number,
  isDry?: boolean,
) {
  const colors = isDry
    ? [C.dryLight, C.dryMid, C.dryDark]
    : [C.leafHighlight, C.leafLight, C.leafMid, C.leafDark, C.leafVDark];

  for (let dr = 0; dr < droopRows; dr++) {
    const y = attachY + dr;
    if (y >= CONTENT) break;
    const progress = dr / Math.max(1, droopRows - 1);
    const rowWidth = Math.max(1, Math.round(width * (1 - progress * 0.5)));

    if (side === "left") {
      const startX = stalkCx - rowWidth;
      for (let dx = 0; dx < rowWidth; dx++) {
        const fromTip = dx / rowWidth;
        let ci: number;
        if (isDry) {
          ci = progress < 0.3 ? 0 : fromTip < 0.4 ? 2 : 1;
        } else {
          if (progress < 0.3) ci = fromTip < 0.3 ? 1 : 0;
          else if (progress < 0.6) ci = fromTip < 0.5 ? 3 : 2;
          else ci = fromTip < 0.5 ? 4 : 3;
        }
        px(ctx, startX + dx, y, colors[ci]);
      }
    } else {
      const startX = stalkCx + stalkW;
      for (let dx = 0; dx < rowWidth; dx++) {
        const fromBase = dx / rowWidth;
        let ci: number;
        if (isDry) {
          ci = progress < 0.3 ? 0 : fromBase > 0.6 ? 2 : 1;
        } else {
          if (progress < 0.3) ci = fromBase > 0.7 ? 1 : 0;
          else if (progress < 0.6) ci = fromBase > 0.5 ? 3 : 2;
          else ci = fromBase > 0.5 ? 4 : 3;
        }
        px(ctx, startX + dx, y, colors[ci]);
      }
    }
  }
}

function drawTassel(ctx: Ctx, topY: number, cx: number, stalkW: number) {
  const mid = cx + Math.floor(stalkW / 2);
  const strands = [
    [-3, 0], [-2, 0], [-2, 1], [-1, 0], [-1, 1], [-1, 2],
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1], [2, 2],
    [3, 0], [3, 1], [4, 0],
  ];
  for (const [dx, dy] of strands) {
    const c = dy === 0 ? C.tasselLight : dy === 1 ? C.tasselMid : C.tasselDark;
    px(ctx, mid + dx, topY + dy, c);
  }
}

function drawEar(
  ctx: Ctx,
  topY: number,
  leftX: number,
  width: number,
  height: number,
) {
  const cx = leftX + Math.floor(width / 2);
  for (let dr = 0; dr < height; dr++) {
    const y = topY + dr;
    if (y >= CONTENT) break;
    const t = dr / (height - 1);
    const rowW = Math.max(1, Math.round(width * Math.sin(t * Math.PI)));
    const sx = cx - Math.floor(rowW / 2);

    const isHusk = dr < 2 || dr > height - 3;
    for (let dx = 0; dx < rowW; dx++) {
      const x = sx + dx;
      const isEdge = dx === 0 || dx === rowW - 1;
      if (isHusk || isEdge) {
        px(ctx, x, y, isEdge && !isHusk ? C.huskMid : dr < 2 ? C.huskLight : C.huskDark);
      } else {
        const kernelColor = (dx + dr) % 2 === 0
          ? ((dx + dr) % 4 < 2 ? C.kernelBright : C.kernelMid)
          : ((dx + dr) % 4 < 2 ? C.kernelMid : C.kernelDark);
        px(ctx, x, y, kernelColor);
      }
    }
  }
}

function makeStage(draw: (ctx: Ctx) => void): string {
  const canvas = createCanvas(RES, RES);
  const ctx = canvas.getContext("2d");
  draw(ctx);
  return canvas.toDataURL("image/png");
}

const SC = 15; // stalk center x
const SW = 2;  // stalk width

const stages: Record<string, string> = {};

// PLANTED
stages.planted = makeStage((ctx) => {
  drawSoil(ctx);
  px(ctx, 15, 22, C.seed);
  px(ctx, 16, 22, C.seed);
  px(ctx, 15, 23, C.seedDark);
  px(ctx, 16, 23, C.seedDark);
});

// GERMINATION
stages.germination = makeStage((ctx) => {
  drawSoil(ctx);
  px(ctx, 15, 21, C.leafLight);
  px(ctx, 16, 21, C.leafLight);
  px(ctx, 15, 22, C.stalkMid);
  px(ctx, 16, 22, C.stalkMid);
  px(ctx, 15, 23, C.stalkMid);
});

// SPROUT
stages.sprout = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 20, 23, SC, SW);
  px(ctx, SC - 1, 18, C.leafLight);
  px(ctx, SC - 1, 19, C.leafMid);
  px(ctx, SC + SW, 18, C.leafLight);
  px(ctx, SC + SW, 19, C.leafMid);
});

// SEEDLING
stages.seedling = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 16, 23, SC, SW);
  drawLeaf(ctx, 16, SC, SW, "left", 5, 3);
  drawLeaf(ctx, 18, SC, SW, "right", 5, 3);
  px(ctx, SC, 15, C.leafLight);
  px(ctx, SC + 1, 15, C.leafHighlight);
});

// VEGETATIVE
stages.vegetative = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 8, 23, SC, SW);
  px(ctx, SC, 7, C.leafLight);
  drawLeaf(ctx, 9, SC, SW, "left", 6, 3);
  drawLeaf(ctx, 12, SC, SW, "right", 7, 3);
  drawLeaf(ctx, 15, SC, SW, "left", 8, 3);
  drawLeaf(ctx, 18, SC, SW, "right", 8, 3);
  drawLeaf(ctx, 21, SC, SW, "left", 7, 2);
});

// BUDDING
stages.budding = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 5, 23, SC, SW);
  px(ctx, SC, 3, C.tasselLight);
  px(ctx, SC + 1, 3, C.tasselMid);
  px(ctx, SC + 1, 4, C.tasselMid);
  drawLeaf(ctx, 6, SC, SW, "left", 7, 3);
  drawLeaf(ctx, 9, SC, SW, "right", 8, 3);
  drawLeaf(ctx, 12, SC, SW, "left", 9, 3);
  drawLeaf(ctx, 15, SC, SW, "right", 10, 3);
  drawLeaf(ctx, 18, SC, SW, "left", 10, 3);
  drawLeaf(ctx, 21, SC, SW, "right", 9, 3);
});

// FLOWERING
stages.flowering = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 4, 23, SC, SW);
  drawTassel(ctx, 0, SC, SW);
  drawLeaf(ctx, 5, SC, SW, "left", 8, 3);
  drawLeaf(ctx, 8, SC, SW, "right", 9, 3);
  drawLeaf(ctx, 11, SC, SW, "left", 10, 3);
  drawLeaf(ctx, 14, SC, SW, "right", 11, 4);
  drawLeaf(ctx, 18, SC, SW, "left", 11, 3);
  drawLeaf(ctx, 21, SC, SW, "right", 10, 3);
});

// FRUITING
stages.fruiting = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 4, 23, SC, SW);
  drawTassel(ctx, 0, SC, SW);
  drawLeaf(ctx, 5, SC, SW, "left", 8, 3);
  drawLeaf(ctx, 8, SC, SW, "right", 9, 3);
  drawLeaf(ctx, 11, SC, SW, "left", 10, 3);
  drawEar(ctx, 14, SC + SW + 1, 5, 7);
  drawLeaf(ctx, 14, SC, SW, "right", 4, 2);
  drawLeaf(ctx, 18, SC, SW, "left", 11, 3);
  drawLeaf(ctx, 21, SC, SW, "right", 10, 3);
});

// HARVEST
stages.harvest = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 4, 23, SC, SW);
  drawTassel(ctx, 0, SC, SW);
  drawLeaf(ctx, 5, SC, SW, "left", 8, 3);
  drawLeaf(ctx, 8, SC, SW, "right", 9, 3);
  drawLeaf(ctx, 11, SC, SW, "left", 10, 3);
  drawEar(ctx, 12, SC + SW + 1, 7, 10);
  drawLeaf(ctx, 18, SC, SW, "left", 11, 3);
  drawLeaf(ctx, 22, SC, SW, "right", 9, 2);
});

// SENESCENCE
stages.senescence = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 4, 23, SC, SW, C.wood);
  // dried tassel
  px(ctx, SC - 1, 0, C.dryLight);
  px(ctx, SC, 0, C.dryMid);
  px(ctx, SC + 1, 1, C.dryMid);
  px(ctx, SC + 2, 0, C.dryLight);
  px(ctx, SC + 3, 1, C.dryMid);
  px(ctx, SC, 2, C.dryDark);
  px(ctx, SC + 1, 2, C.dryDark);
  px(ctx, SC + 1, 3, C.dryMid);
  // dried leaves
  drawLeaf(ctx, 5, SC, SW, "left", 8, 4, true);
  drawLeaf(ctx, 9, SC, SW, "right", 9, 4, true);
  drawLeaf(ctx, 13, SC, SW, "left", 10, 4, true);
  drawLeaf(ctx, 17, SC, SW, "right", 11, 4, true);
  drawLeaf(ctx, 21, SC, SW, "left", 10, 3, true);
});

// DORMANT
stages.dormant = makeStage((ctx) => {
  drawSoil(ctx);
  drawStalk(ctx, 18, 23, SC, SW, C.woodDark);
  px(ctx, SC - 1, 17, C.wood);
  px(ctx, SC + SW, 17, C.wood);
});

// Write TypeScript module
const lines = [
  '// AUTO-GENERATED by scripts/generate-corn-pngs.ts — do not edit',
  'import type { StageKey } from "../../types/models";',
  '',
  'export const CORN_SPRITES: Partial<Record<StageKey, string>> = {',
];

const stageOrder = [
  "planted", "germination", "sprout", "seedling", "vegetative",
  "budding", "flowering", "fruiting", "harvest", "senescence", "dormant",
];

for (const name of stageOrder) {
  const dataUrl = stages[name];
  lines.push(`  ${name}: "${dataUrl}",`);
}

lines.push("};", "");

fs.writeFileSync("src/sprites/png/corn.ts", lines.join("\n"));
console.log("Generated src/sprites/png/corn.ts");

// Also render a preview
const previewScale = 6;
const tileSize = RES * previewScale;
const padding = 12;
const cols = stageOrder.length;
const width = cols * (tileSize + padding) + padding;
const height = tileSize + padding * 2 + 50;
const preview = createCanvas(width, height);
const pctx = preview.getContext("2d");
pctx.fillStyle = "#d0d0d0";
pctx.fillRect(0, 0, width, height);
pctx.fillStyle = "#333";
pctx.font = "bold 18px monospace";
pctx.fillText("CORN — 32×32 FULL COLOR PNG SPRITES", padding, 22);

for (let i = 0; i < stageOrder.length; i++) {
  const name = stageOrder[i];
  const dataUrl = stages[name];
  const x0 = padding + i * (tileSize + padding);
  const y0 = 36;

  pctx.fillStyle = "#b0b0b0";
  pctx.fillRect(x0 - 2, y0 - 2, tileSize + 4, tileSize + 4);
  pctx.fillStyle = "#c8c8c8";
  pctx.fillRect(x0, y0, tileSize, tileSize);

  const { Image: CanvasImage } = await import("canvas");
  const img = new CanvasImage();
  img.src = dataUrl;
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(img, x0, y0, tileSize, tileSize);

  pctx.fillStyle = "#555";
  pctx.font = "11px monospace";
  pctx.fillText(name.slice(0, 11), x0 + 2, y0 + tileSize + 12);
}

fs.writeFileSync("corn-png-preview.png", preview.toBuffer("image/png"));
console.log("Wrote corn-png-preview.png");
