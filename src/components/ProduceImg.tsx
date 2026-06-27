import { useMemo } from "react";
import type { Plant } from "../types/models";
import { produceFor } from "../sprites/sprites";

/** Renders a plant's harvested-produce icon (the ripe yield only) crisply at
 *  any size (§13.5). Companion to SpriteImg, which draws the growing plant. */
export function ProduceImg({
  plant,
  size = 48,
  className = "",
}: {
  plant: Pick<Plant, "iconKey" | "category" | "commonName">;
  size?: number;
  className?: string;
}) {
  const url = useMemo(
    () => produceFor(plant.iconKey, plant.category),
    [plant.iconKey, plant.category],
  );
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt={`${plant.commonName} (harvest)`}
      className={`pixel-art ${className}`}
      draggable={false}
    />
  );
}
