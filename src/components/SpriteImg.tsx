import { useMemo } from "react";
import type { Plant, StageKey } from "../types/models";
import { spriteFor } from "../sprites/sprites";

/** Renders a plant's stage sprite crisply at any size (§13.5, §21.4). */
export function SpriteImg({
  plant,
  stage,
  size = 48,
  className = "",
}: {
  plant: Pick<Plant, "iconKey" | "category" | "commonName">;
  stage: StageKey;
  size?: number;
  className?: string;
}) {
  const url = useMemo(
    () => spriteFor(plant.iconKey, plant.category, stage),
    [plant.iconKey, plant.category, stage],
  );
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt={`${plant.commonName} (${stage})`}
      className={`pixel-art ${className}`}
      draggable={false}
    />
  );
}
