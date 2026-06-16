# Sprite System Redesign — Indexed Pixel-Art Atlas (Option A)

**Status:** Proposed · **Author:** design spike · **Supersedes:** the per-plant base64 PNG route (`src/sprites/png/*`)

This is a migration plan, not yet an implementation. It describes how to move the
sprite layer from its current two-system state to a single, professional pipeline
that is crisp ("Terraria/Stardew" look), fully recolorable, lightweight enough to
"run on a potato," and never breaks mid-migration.

It is deliberately aligned with the existing `docs/SPEC.md`:
§13.5 (stage graphics + per-family fallback), §21.4 (single sprite manifest /
sprite sheet, `image-rendering: pixelated`), §12 (single Canvas stage, batched
draws, **sprite atlases**), §22 (precache sprites for offline).

---

## 1. Goals & non-goals

**Goals**
- One unified render path for every plant (no "some recolor, some don't").
- Hand-crafted pixel-art quality, authored in a real tool, not typed in code.
- Full runtime recoloring + reshaping preserved (the SpriteCustomizer keeps working
  for **every** plant, including the API-imported ones).
- Crisp at every zoom (integer scaling, nearest-neighbor).
- Tiny footprint: one atlas asset, not ~10 MB of base64 in the JS bundle.
- Offline-first (atlas precached by the existing PWA config).
- No big-bang rewrite — swap the internals behind the existing `spriteFor()` seam,
  migrate art plant-by-plant.

**Non-goals (for this phase)**
- Animation (idle sway, wind). Designed-for, not built yet (Phase 4).
- Replacing Konva. We keep it; we only fix how it draws sprites.
- Rewriting catalog / growth engine / DB / designer — untouched.

---

## 2. Why the current state hurts (diagnosis)

| Symptom (reported) | Root cause (in code) |
|---|---|
| "Reduced flexibility" | `spriteFor()` returns baked PNGs **before** consulting the palette. Any plant with a PNG (corn, sunflower) is no longer recolorable or reshapeable. The sunflower in the customizer has all 11 stages baked → **every swatch and shape button is inert for it.** |
| "Looks terrible unless processed perfectly" | Non-integer scaling + double smoothing. Tiles are `TILE_PX = 40`; a 64² PNG → 40px is 0.625×, a 16² map → 40px is 2.5×. Konva then multiplies by live zoom (0.35–3×) and DPR, and **re-smooths** because `imageSmoothingEnabled = false` is set only on the offscreen canvas, not the Konva layer; `image-rendering: pixelated` is only on the `<img>`, not the canvas. |
| "Ton of work" | corn = 64 KB, sunflower = 72 KB of base64 — for **2 of 148** plants. Finishing this way bakes ~10 MB into the bundle plus a manual sprite-sheet-cleaning chore per plant. Violates §12 / §21.4 (atlas + manifest). |
| "Glitches" | Two parallel systems with a fallback chain → inconsistent sizes (16² vs 64²), inconsistent recolor behavior, stray edge pixels from fractional downsampling. |

**Key insight:** the *original* char-map model is already the professional data model —
indexed semantic slots (`l`=leaf, `f`=fruit, `s`=stem…) are exactly how Terraria
dyes / Stardew crop tints / player skins work. We don't discard it; we (a) upgrade
the **art** behind the indices from ASCII to real pixel art, and (b) fix the
**rendering** to integer-scaled atlas blits.

---

## 3. Design principles

1. **Author once, externally.** Pixel art in Aseprite (industry standard: Stardew,
   Celeste, Hyper Light Drifter). Never hand-typed in source again.
2. **Indexed palettes for recolor.** Sprites store palette *indices* (semantic
   slots). Recolor = swap indices → colors at runtime. Infinite variation, zero
   extra art. (Also satisfies varietal tinting, SPEC §16/§3 `colorHex`.)
3. **One atlas, loaded as an asset.** A single sprite-sheet PNG + generated
   manifest, loaded once, sub-rect blits. PWA-precached (§22).
4. **Integer scaling, nearest-neighbor, everywhere.** Native size divides evenly
   into on-screen size; smoothing forced off on the Konva layer; zoom snaps to
   integer steps.
5. **Never blank (§13.5).** Resolution always falls through to a per-family then
   per-category procedural sprite, so unknown/API plants still render.
6. **One seam.** Everything stays behind `spriteFor(iconKey, category, stage, scale)`.

---

## 4. Target architecture

### 4.1 Native size & scaling

- **Native sprite size: 32×32.** Enough to make 148 plants' fruit/leaf/stem
  recognizable while keeping a chunky, Terraria-ish read. (16² is too coarse for
  distinct produce; 64² is more art + softer "pixels.")
- **Set `TILE_PX = 32`** (or 64 for a chunkier plot). Then sprite→tile is 1× (or
  2×) — exact integer. Zoom steps become 1×/2×/3×, all integer.
- **Disable smoothing on the Konva layer**, not just the offscreen canvas.
  (Konva renders each layer to a `<canvas>`; set `imageSmoothingEnabled = false`
  on that scene context — exact hook to confirm at implementation, e.g. via the
  layer's canvas context after draw, or `Konva.Image` smoothing config.)
- **Snap zoom to integer steps** in `GardenCanvas.zoomAt()` (replace the 0.92/1.08
  multipliers with a stepped scale set, e.g. `[1, 2, 3]` plus a fit-to-width
  fallback). Pixel art only stays crisp at integer zoom; this is why Stardew/
  Terraria only allow integer zoom.
- DOM render sites (`SpriteImg`, customizer) keep `image-rendering: pixelated`
  and use CSS sizes that are integer multiples of 32.

### 4.2 Indexed palette spec

A fixed "key palette." Each slot is a semantic role; user-recolorable slots are
marked. Authoring uses these exact entries (Aseprite indexed mode enforces it).

| Idx | Slot | Role | Recolorable |
|----|------|------|-------------|
| 0 | `transparent` | empty | — |
| 1 | `outline` | selective 1px dark outline | no (derived) |
| 2–4 | `leaf_hi / leaf_mid / leaf_lo` | foliage ramp (3 steps) | **yes** (base = `l`) |
| 5–7 | `fruit_hi / fruit_mid / fruit_lo` | fruit/bloom ramp | **yes** (base = `f`) |
| 8–9 | `stem_hi / stem_lo` | stem ramp | **yes** (base = `s`) |
| 10–11 | `soil_hi / soil_lo` | soil mound | no |
| 12–13 | `senescent_hi / senescent_lo` | spent/brown (`y`) | no |
| 14 | `wood` | trellis/stub (`w`) | no |

- **Three-step ramps** give real shading; the current char-maps only have 2 steps.
- **Backward compatible with the DB.** `spriteOverrides.palette` already stores one
  hex per region (`{ f, l, s, … }`). We keep storing **one base color per
  recolorable region** and *derive* the 2–3 ramp steps at render time (next section).
  No schema change; `registerDynamicAccent` and the API mapper keep working as-is.

### 4.3 Recolor: LUT + ramp derivation

```
slotRamp(base: hex, steps): hex[]      // HSL lightness shifts: hi = L+12%, lo = L−15%,
                                       // tiny hue warm/cool shift for life
buildLUT(palette): Record<slotId, RGBA> // base colors → full 15-entry RGBA table
recolor(indices: Uint8Array, lut): ImageData  // per-pixel index → RGBA (32²=1024 px, trivial)
```

- The customizer UI stays simple: user picks **one** color per region; the ramp is
  derived. (Optionally expose "shade" as an advanced override later.)
- Cache the recolored result per `(iconKey, stage, paletteHash, scale)` — same cache
  the code already keeps, just keyed by palette too.

### 4.4 Atlas format & build pipeline

- **Authoring:** one Aseprite file per plant (or per shape family), one frame per
  stage, frame tags named by `StageKey`.
- **Per-file export:** Aseprite CLI → per-plant sheet PNG + JSON
  (`aseprite -b in.aseprite --sheet out.png --data out.json --list-tags`).
- **Pack step (new `scripts/build-atlas.mjs`):** reads all per-plant PNGs, maps each
  pixel's RGB → nearest key-palette slot id, packs frames into **one master atlas**
  + emits `src/sprites/atlas/manifest.ts` mapping `iconKey/stage → {x,y,w,h}` and a
  compact slot-index buffer. Ship as:
  - `public/sprites/atlas.png` (reference / debugging, PWA-precached), **and**
  - the packed slot-index data the renderer actually uses (decoded once at load).
- **Index encoding (recommended):** ship the atlas as a normal RGBA PNG authored in
  the key palette; at load, decode once to `ImageData` and convert to a slot-index
  `Uint8Array` by matching the known key-palette RGBs. No custom binary format,
  leverages PNG precaching. (If the atlas grows large, switch to a packed binary
  index buffer — note as a future optimization.)
- **Single source of truth (§21.4):** the generated `manifest.ts` is it. Replaces
  `src/sprites/png/index.ts` and the ad-hoc `scripts/extract-sprites.mjs` /
  `generate-corn-pngs.ts` / `build-sunflower-sprites.mjs`, which get deleted.
- Base path: load via `import.meta.env.BASE_URL` so GitHub Pages (`/GardenPlanner/`)
  works.

### 4.5 Resolution order (3 tiers — never blank, §13.5)

`spriteFor(iconKey, category, stage)` resolves art in this order:

1. **Bespoke** authored frame for `iconKey/stage` (Tier-1 "hero" plants).
2. **Shape-family** authored frame for `getPlantShape(iconKey)/stage`
   (one nice authored "bush/root/leafy/…" set, recolored — covers the long tail).
3. **Procedural** char-map for that shape/stage (existing `maps.ts`, treated as a
   trivial indexed source) — the ultimate fallback for API-imported/unknown plants.

All three go through the **same** LUT recolor + integer-scale + cache path. The
base64 PNG path is **deleted**.

### 4.6 Rendering integration

- **`SpriteImg` / customizer (DOM):** unchanged API; `<img>`/`<canvas>` at intrinsic
  32, CSS size = integer multiple, `image-rendering: pixelated`.
- **`GardenCanvas` `SpriteNode` (Konva):** disable layer smoothing; integer zoom;
  draw cached recolored bitmap at `TILE_PX`. Keep the existing async image cache.

### 4.7 Persistence & dynamic plants (unchanged)

- `db.spriteOverrides` (`{ iconKey, palette, isRoot, shape }`) is unchanged.
- `appStore` startup loader (`registerDynamicAccent` + `setPlantShape`) is unchanged.
- `perenualMapper` (API import → accent + shape) is unchanged. API plants have no
  authored art → they resolve to Tier 2/3 and recolor via the accent. **This is why
  the procedural fallback is permanent, not just transitional.**

---

## 5. Art production

This is the real cost — and the main lever for keeping it bounded.

### 5.1 Tiering (scope reduction)

Naïvely: 148 plants × ~7 distinct stages ≈ 1,000 frames. Instead, tier it:

- **Shared stages.** `planted`, `germination`, `sprout`, `senescence`, `dormant`
  are visually generic today and can stay **shared** across all plants (~5 frames
  total, reused everywhere).
- **Tier 2 — shape families (the workhorse).** Author one real set per shape
  (~15 shapes × ~5 active stages ≈ **75 frames**). Recolor covers dozens of plants
  each. This alone makes the *entire* catalog look hand-crafted.
- **Tier 1 — hero plants.** ~20–30 most-recognizable crops (tomato, pepper, carrot,
  lettuce, corn, sunflower, pumpkin, strawberry…) get bespoke fruiting/harvest
  frames (~30 × ~3 ≈ **90 frames**).
- **Tier 3 — API/unknown.** Procedural, zero art.

**Realistic authored scope ≈ 75 + 90 ≈ 165 frames**, not 1,000. A focused
week of pixel art, not months — and the app looks complete after Tier 2.

### 5.2 Aseprite workflow

- Template: 32×32 canvas, **indexed mode**, palette = the key palette (§4.2).
- Onion-skin/trace against the current procedural sprite to keep silhouettes and
  the soil baseline consistent (plants must align in tiles).
- Conventions: top-left light source; selective 1px outline (`outline` slot);
  content anchored to a fixed soil line; keep within a safe inner box so neighbors
  don't visually collide.
- Export via Aseprite CLI in `scripts/build-atlas.mjs` (batch, headless).

### 5.3 Per-plant checklist

For each authored plant:
- [ ] Frames for each active stage (or rely on shared/shape-family for some).
- [ ] Only key-palette indices used (build step will warn on stray colors).
- [ ] Soil baseline + safe box respected.
- [ ] Recolors legibly (test with 2–3 wild palettes via the customizer).
- [ ] Reads correctly at 1× and 2× on the plot.

---

## 6. Code module layout

```
src/sprites/
  atlas/
    manifest.ts        # GENERATED: iconKey/stage → frame rect; atlas URL
    loader.ts          # load atlas once → slot-index buffers (awaited at startup)
  palette.ts           # key-palette slot ids; slotRamp(); buildLUT()
  render.ts            # recolor(indices, lut) → canvas; integer upscale; cache
  resolve.ts           # 3-tier resolution (bespoke → shape → procedural)
  sprites.ts           # spriteFor() — same signature, new internals
  maps.ts              # KEPT as procedural fallback (Tier 3)
  png/                 # DELETED
scripts/
  build-atlas.mjs      # NEW: Aseprite export → master atlas + manifest.ts
  extract-sprites.mjs  # DELETED
  generate-corn-pngs.ts, build-sunflower-sprites.mjs, preview-sunflower-stages.mjs  # DELETED
```

Atlas load is awaited alongside catalog seeding at app startup (so the first paint
has sprites); `spriteFor` stays synchronous by returning the procedural fallback if
called before the atlas resolves (it won't, after startup gating).

---

## 7. Migration phases (each independently shippable)

- **Phase 0 — Fix scaling now (½ day).** Integer zoom steps, smoothing off on the
  Konva layer, `TILE_PX → 32`. Visible crispness win on *current* art; de-risks the
  rendering model before any art is made.
- **Phase 1 — Unify the pipeline (1–2 days).** Build `palette.ts` + `render.ts` +
  LUT recolor; treat existing char-maps as the indexed source; **delete the base64
  PNG path**. Outcome: every plant recolorable again (fixes the dead sunflower
  customizer), one render path, ~140 KB of base64 removed from the bundle.
- **Phase 2 — Atlas + shape-family art (≈1 week, mostly art).** Aseprite template,
  `build-atlas.mjs`, `manifest.ts`/`loader.ts`, 3-tier `resolve.ts`; author the ~15
  shape families. Whole catalog levels up via recolor.
- **Phase 3 — Hero plants.** Author Tier-1 bespoke frames; register per-plant
  overrides. Incremental, no code changes.
- **Phase 4 — Polish.** Idle animation (multi-frame tags already supported by the
  atlas), optional dithering, lazy per-group atlas loading if the master grows.

Phases 0 and 1 already deliver most of the *felt* improvement (crisp + flexible)
before a single sprite is drawn.

---

## 8. Testing

- **Pure logic (node env, no canvas):** `slotRamp` / `buildLUT` correctness;
  manifest integrity (every catalog `iconKey` + each `sequence` stage resolves to a
  frame **or** a defined fallback); all frame rects within atlas bounds.
- **Canvas (`canvas` devDep, already present):** `recolor()` writes expected RGBA at
  sample pixels for a known index buffer + palette.
- **Keep** the existing `maps.test.ts` invariants for the procedural fallback.
- **Optional visual regression:** a script that renders a contact sheet of all
  sprites to a PNG for manual review (good candidate to surface as an artifact).

---

## 9. Performance budget ("potato" check)

- One 512×512 atlas holds 256 frames of 32² ≈ **~30–80 KB PNG** (vs ~10 MB of
  base64 for the per-plant route).
- Recolor = 1,024 px per sprite, once per `(plant, stage, palette)`, then cached.
- Plot draws are cached bitmaps blitted by Konva — meets §12's "60 fps for 64×64
  with several hundred objects."
- Memory: a few hundred small cached canvases, bounded by the visible catalog.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Art labor | Tiering (§5.1): ~165 frames, not ~1,000; app looks done after Tier 2. |
| Authoring discipline (must use key palette) | Aseprite indexed template + build-step validation that warns on non-palette colors. |
| Konva fractional-zoom softening | Integer zoom steps + smoothing off (Phase 0). |
| Atlas grows too big | Group atlases by family + lazy-load; switch to packed binary index buffer. |
| Offline | Atlas PNG + manifest are static build assets → auto-precached by existing workbox globs (`**/*.{png,json,js,…}`). |
| Backward compat with saved overrides | Schema unchanged; we keep storing one base color per region and derive ramps. |

---

## 11. Open decisions (need a call before Phase 2)

1. **`TILE_PX`: 32 (denser plot) vs 64 (chunkier, more detail per plant).**
   Recommend 32 to start; trivial to change.
2. **Native size 32² (recommended) vs 48².** 32 keeps art cheap and chunky; 48 buys
   detail at ~2× the pixels to author.
3. **Ramp steps: derive 3 from one picked color (recommended) vs let users pick
   highlight/mid/shadow.** Derive-from-one keeps the UI and DB simple.
4. **Which ~25–30 plants are "Tier-1 heroes"?** (Pick the most-planted / most
   visually distinctive.)
5. **Atlas grouping:** single master atlas (simplest) vs per-family atlases
   (lazy-loadable). Start single.

---

*Once decisions in §11 are made, Phase 0 + Phase 1 can proceed immediately and are
fully reversible behind the `spriteFor()` seam.*
