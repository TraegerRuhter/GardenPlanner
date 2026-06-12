/** §7.2 — plant families for rotation grouping and shared pests/disease. */

import type { PlantFamily } from "../types/models";

export const families: PlantFamily[] = [
  {
    id: "solanaceae",
    commonName: "Nightshade family",
    rotationGroup: "fruiting",
    notes: "Tomato, pepper, eggplant, potato. Heavy feeders; share blights.",
  },
  {
    id: "cucurbitaceae",
    commonName: "Squash family",
    rotationGroup: "fruiting",
    notes: "Cucumber, zucchini, squash, melon. Share powdery mildew and squash pests.",
  },
  {
    id: "fabaceae",
    commonName: "Legume family",
    rotationGroup: "legume",
    notes: "Beans and peas. Fix nitrogen; good rotation lead-in for heavy feeders.",
  },
  {
    id: "brassicaceae",
    commonName: "Brassica family",
    rotationGroup: "brassica",
    notes: "Broccoli, kale, cabbage, radish. Share clubroot and cabbage moths.",
  },
  {
    id: "apiaceae",
    commonName: "Carrot family",
    rotationGroup: "root",
    notes: "Carrot, parsnip, celery, dill. Fine-seeded; share carrot fly.",
  },
  {
    id: "amaryllidaceae",
    commonName: "Allium family",
    rotationGroup: "root",
    notes: "Onion, garlic, leek, chive. Pungent; deter many pests.",
  },
  {
    id: "asteraceae",
    commonName: "Daisy family",
    rotationGroup: "leafy",
    notes: "Lettuce, endive, sunflower. Lettuce bolts in heat.",
  },
  {
    id: "amaranthaceae",
    commonName: "Amaranth family",
    rotationGroup: "leafy",
    notes: "Spinach, chard, beet. Tolerant of cool weather; share leaf miners.",
  },
  {
    id: "rosaceae",
    commonName: "Rose family",
    rotationGroup: "fruiting",
    notes: "Strawberry, raspberry, apple. Mostly perennial; rotate strawberry beds every 3-4 years.",
  },
  {
    id: "lamiaceae",
    commonName: "Mint family",
    rotationGroup: "leafy",
    notes: "Basil, mint, thyme, rosemary. Aromatic; mostly pest-deterrent.",
  },
];
