/**
 * Sprite customizer modal — click a plant sprite to open this, tweak
 * colors and attributes, see a live preview across all growth stages.
 */

import { useCallback, useMemo, useState } from "react";
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

interface ColorSlot {
  key: keyof SpritePalette;
  label: string;
  desc: string;
}

const EDITABLE_SLOTS: ColorSlot[] = [
  { key: "f", label: "Fruit / Bloom", desc: "Primary accent color" },
  { key: "F", label: "Fruit shade", desc: "Darker accent for depth" },
  { key: "l", label: "Leaf", desc: "Main foliage color" },
  { key: "L", label: "Leaf shade", desc: "Darker leaf for depth" },
  { key: "s", label: "Stem", desc: "Stem and branch color" },
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
    return Object.fromEntries(EDITABLE_SLOTS.map((s) => [s.key, p[s.key]]));
  });
  const [rootCrop, setRootCrop] = useState(() => isRootIcon(plant.iconKey));
  const [saved, setSaved] = useState(false);

  const setColor = useCallback((key: string, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  // Live preview: temporarily register the accent so spriteFor picks it up.
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
    setColors(Object.fromEntries(EDITABLE_SLOTS.map((s) => [s.key, fresh[s.key]])));
    setRootCrop(false);
    setSaved(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8dvh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--color-paper)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{plant.commonName} — Sprite</h2>
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
                width={64}
                height={64}
                alt={stage}
                className="pixel-art"
                draggable={false}
              />
              <span className="text-[10px] text-[var(--color-ink-soft)]">{stage}</span>
            </div>
          ))}
        </div>

        {/* Color editors */}
        <div className="space-y-3">
          {EDITABLE_SLOTS.map((slot) => (
            <div key={slot.key} className="flex items-center gap-3">
              <input
                type="color"
                value={colors[slot.key]}
                onChange={(e) => setColor(slot.key, e.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-paper-deep)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{slot.label}</p>
                <p className="text-[11px] text-[var(--color-ink-soft)]">{slot.desc}</p>
              </div>
              <span className="font-mono text-[11px] text-[var(--color-ink-soft)]">
                {colors[slot.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Root crop toggle */}
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rootCrop}
            onChange={(e) => { setRootCrop(e.target.checked); setSaved(false); }}
            className="h-4 w-4 rounded"
          />
          <span className="font-medium">Root crop</span>
          <span className="text-[11px] text-[var(--color-ink-soft)]">
            — show yield at soil line instead of on canopy
          </span>
        </label>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
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
            Reset to default
          </button>
          <span className="ml-auto text-[11px] text-[var(--color-ink-soft)]">
            Changes preview live
          </span>
        </div>
      </div>
    </div>
  );
}
