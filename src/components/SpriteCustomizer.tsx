/**
 * Sprite customizer modal — click a plant sprite to open this, pick
 * from curated natural color swatches, see a live preview across stages.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { Plant, StageKey } from "../types/models";
import { db } from "../db/db";
import {
  registerDynamicAccent,
  resolvedPalette,
  spriteFor,
  isRootIcon,
  setRootIcon,
  type SpritePalette,
} from "../sprites/sprites";

const PREVIEW_STAGES: StageKey[] = [
  "seedling",
  "vegetative",
  "flowering",
  "fruiting",
  "harvest",
];

// --- Curated color palettes: [main, shade] pairs grouped by hue family ---

interface SwatchPair { label: string; main: string; shade: string }

const FRUIT_SWATCHES: SwatchPair[] = [
  { label: "Tomato",     main: "#d23c2e", shade: "#a02a20" },
  { label: "Cherry",     main: "#c0392b", shade: "#8e2b20" },
  { label: "Scarlet",    main: "#e74c3c", shade: "#b33a2e" },
  { label: "Strawberry", main: "#e84040", shade: "#b02828" },
  { label: "Coral",      main: "#e06050", shade: "#b04838" },
  { label: "Orange",     main: "#e88a2e", shade: "#c06a1e" },
  { label: "Peach",      main: "#f0a868", shade: "#c88848" },
  { label: "Gold",       main: "#d4a030", shade: "#a87820" },
  { label: "Lemon",      main: "#e8c72e", shade: "#b89e20" },
  { label: "Lime",       main: "#8fcf6f", shade: "#6aa84f" },
  { label: "Green",      main: "#3f8f4f", shade: "#2f6f3e" },
  { label: "Olive",      main: "#6b8e50", shade: "#4d6838" },
  { label: "Teal",       main: "#3a8a7d", shade: "#2a6a5d" },
  { label: "Lavender",   main: "#b39ed8", shade: "#8a78b0" },
  { label: "Purple",     main: "#7a4fb3", shade: "#5b3a8c" },
  { label: "Plum",       main: "#8c2f5f", shade: "#6a2248" },
  { label: "Rose",       main: "#e76fb3", shade: "#c44f93" },
  { label: "Pink",       main: "#f4b8d4", shade: "#d098b4" },
  { label: "White",      main: "#e8e6d8", shade: "#c8c4b4" },
  { label: "Cream",      main: "#f5f0dc", shade: "#d5d0bc" },
  { label: "Burgundy",   main: "#800030", shade: "#600020" },
  { label: "Black",      main: "#3a3a3a", shade: "#222222" },
  { label: "Brown",      main: "#7d5c46", shade: "#5c4033" },
  { label: "Tan",        main: "#c9a26a", shade: "#a8854f" },
];

const LEAF_SWATCHES: SwatchPair[] = [
  { label: "Classic",    main: "#58a854", shade: "#3f8f4f" },
  { label: "Bright",     main: "#6fbf63", shade: "#4c9950" },
  { label: "Spring",     main: "#8fcf6f", shade: "#6aa84f" },
  { label: "Forest",     main: "#3a7d44", shade: "#2a5c33" },
  { label: "Deep",       main: "#2f6f3e", shade: "#24512f" },
  { label: "Sage",       main: "#7aa85c", shade: "#5c8a45" },
  { label: "Olive",      main: "#6b8e50", shade: "#4d6838" },
  { label: "Teal",       main: "#3a7d5c", shade: "#2a5c44" },
  { label: "Blue-green", main: "#4a8a7a", shade: "#386858" },
  { label: "Silver",     main: "#8aaa8a", shade: "#6a8a6a" },
  { label: "Lime",       main: "#a0cf60", shade: "#78a848" },
  { label: "Chartreuse", main: "#b0d850", shade: "#88b038" },
  { label: "Purple",     main: "#6a5880", shade: "#504068" },
  { label: "Burgundy",   main: "#6a3848", shade: "#502830" },
  { label: "Red",        main: "#8a4040", shade: "#683030" },
  { label: "Bronze",     main: "#8a7050", shade: "#685038" },
];

const STEM_SWATCHES: SwatchPair[] = [
  { label: "Green",      main: "#3a7d44", shade: "#2a5c33" },
  { label: "Light",      main: "#5a9a5a", shade: "#3a7a3a" },
  { label: "Brown",      main: "#7d5c46", shade: "#5c4033" },
  { label: "Dark",       main: "#5c4033", shade: "#3a2a20" },
  { label: "Woody",      main: "#8a6a4f", shade: "#685030" },
  { label: "Red",        main: "#7a4a3a", shade: "#5a3028" },
  { label: "Purple",     main: "#5a4060", shade: "#3a2840" },
];

interface SlotConfig {
  key: keyof SpritePalette;
  shadeKey: keyof SpritePalette;
  label: string;
  swatches: SwatchPair[];
}

const SLOT_CONFIGS: SlotConfig[] = [
  { key: "f", shadeKey: "F", label: "Fruit / Bloom", swatches: FRUIT_SWATCHES },
  { key: "l", shadeKey: "L", label: "Leaf",          swatches: LEAF_SWATCHES },
  { key: "s", shadeKey: "s", label: "Stem",          swatches: STEM_SWATCHES },
];

export function SpriteCustomizer({
  plant,
  onClose,
}: {
  plant: Plant;
  onClose: () => void;
}) {
  const basePalette = useMemo(
    () => resolvedPalette(plant.iconKey, plant.category),
    [plant.iconKey, plant.category],
  );

  const [colors, setColors] = useState<Record<string, string>>(() => {
    const p = basePalette;
    return { f: p.f, F: p.F, l: p.l, L: p.L, s: p.s };
  });
  const [rootCrop, setRootCrop] = useState(() => isRootIcon(plant.iconKey));
  const [saved, setSaved] = useState(false);

  const setSlot = useCallback((key: string, shadeKey: string, main: string, shade: string) => {
    setColors((prev) => ({ ...prev, [key]: main, [shadeKey]: shade }));
    setSaved(false);
  }, []);

  const setSingleColor = useCallback((key: string, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const previewUrls = useMemo(() => {
    registerDynamicAccent(plant.iconKey, colors);
    setRootIcon(plant.iconKey, rootCrop);
    return PREVIEW_STAGES.map((stage) => ({
      stage,
      url: spriteFor(plant.iconKey, plant.category, stage, 6),
    }));
  }, [colors, rootCrop, plant.iconKey, plant.category]);

  async function handleSave() {
    registerDynamicAccent(plant.iconKey, colors);
    setRootIcon(plant.iconKey, rootCrop);
    await db.spriteOverrides.put({
      iconKey: plant.iconKey,
      palette: colors,
      isRoot: rootCrop,
    });
    setSaved(true);
  }

  async function handleReset() {
    registerDynamicAccent(plant.iconKey, {});
    setRootIcon(plant.iconKey, false);
    await db.spriteOverrides.delete(plant.iconKey);
    const fresh = resolvedPalette(plant.iconKey, plant.category);
    setColors({ f: fresh.f, F: fresh.F, l: fresh.l, L: fresh.L, s: fresh.s });
    setRootCrop(false);
    setSaved(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6dvh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--color-paper)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{plant.commonName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm hover:bg-[var(--color-paper-deep)]"
          >
            ✕
          </button>
        </div>

        {/* Stage previews */}
        <div className="mb-5 flex items-end justify-center gap-3 rounded-xl bg-[var(--color-paper-deep)] p-4">
          {previewUrls.map(({ stage, url }) => (
            <div key={stage} className="flex flex-col items-center gap-1">
              <img
                src={url}
                width={56}
                height={56}
                alt={stage}
                className="pixel-art"
                draggable={false}
              />
              <span className="text-[9px] text-[var(--color-ink-soft)]">{stage}</span>
            </div>
          ))}
        </div>

        {/* Color slot editors */}
        <div className="space-y-4">
          {SLOT_CONFIGS.map((config) => (
            <SwatchRow
              key={config.key}
              config={config}
              currentMain={colors[config.key]}
              onSelect={(main, shade) => setSlot(config.key, config.shadeKey, main, shade)}
              onCustom={(val) => setSingleColor(config.key, val)}
            />
          ))}
        </div>

        {/* Root crop toggle */}
        <label className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--color-paper-deep)] px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={rootCrop}
            onChange={(e) => { setRootCrop(e.target.checked); setSaved(false); }}
            className="h-4 w-4 rounded"
          />
          <span className="font-medium">Root crop</span>
          <span className="text-[11px] text-[var(--color-ink-soft)]">
            — yield at soil line
          </span>
        </label>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white"
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            className="rounded-lg bg-[var(--color-paper-deep)] px-3 py-2 text-sm font-medium"
          >
            Reset
          </button>
          <span className="ml-auto text-[10px] text-[var(--color-ink-soft)]">
            live preview
          </span>
        </div>
      </div>
    </div>
  );
}

function SwatchRow({
  config,
  currentMain,
  onSelect,
  onCustom,
}: {
  config: SlotConfig;
  currentMain: string;
  onSelect: (main: string, shade: string) => void;
  onCustom: (value: string) => void;
}) {
  const customRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">{config.label}</p>
      <div className="flex flex-wrap gap-1.5">
        {config.swatches.map((sw) => {
          const active = currentMain.toLowerCase() === sw.main.toLowerCase();
          return (
            <button
              key={sw.main}
              type="button"
              title={sw.label}
              onClick={() => onSelect(sw.main, sw.shade)}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${
                active
                  ? "scale-110 border-white shadow-md ring-2 ring-[var(--color-canopy)]"
                  : "border-transparent hover:scale-110 hover:border-white/60"
              }`}
              style={{ backgroundColor: sw.main }}
            />
          );
        })}
        {/* Custom color fallback */}
        <button
          type="button"
          title="Custom color"
          onClick={() => customRef.current?.click()}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-ink-soft)]/40 text-[10px] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-soft)]"
        >
          <span className="leading-none">+</span>
        </button>
        <input
          ref={customRef}
          type="color"
          value={currentMain}
          onChange={(e) => onCustom(e.target.value)}
          className="invisible absolute h-0 w-0"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
