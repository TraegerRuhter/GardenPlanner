/**
 * Seed inventory (§31.1): viability scoring from packet age vs the plant's
 * typical seed longevity, and the stash badge derivation.
 */

import type { Plant, SeedPacket, ViabilityScore } from "../types/models";

export function viabilityScore(
  packet: SeedPacket,
  plant: Pick<Plant, "seedViabilityYears">,
  currentYear = new Date().getFullYear(),
): ViabilityScore {
  const anchor =
    packet.packedForYear ??
    packet.purchaseYear ??
    Number(packet.addedAt.slice(0, 4));
  const age = currentYear - anchor;
  const span = packet.viabilityYearsOverride ?? plant.seedViabilityYears ?? 3;
  if (age <= 0) return "fresh";
  if (age < span) return "good";
  if (age === span) return "aging";
  return "expired";
}

export type StashBadge = "in_stash" | "in_stash_aging" | "out_of_stash";

/** Best usable packet wins; empty packets don't count (§31.1 badge). */
export function stashBadge(
  packets: SeedPacket[],
  plant: Pick<Plant, "id" | "seedViabilityYears">,
  currentYear = new Date().getFullYear(),
): StashBadge {
  const mine = packets.filter((p) => p.plantId === plant.id && p.quantity !== "empty");
  if (mine.length === 0) return "out_of_stash";
  const scores = mine.map((p) => viabilityScore(p, plant, currentYear));
  if (scores.some((s) => s === "fresh" || s === "good")) return "in_stash";
  return "in_stash_aging";
}
