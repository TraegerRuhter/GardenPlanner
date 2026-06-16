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
  {
    id: "poaceae",
    commonName: "Grass family",
    rotationGroup: "fruiting",
    notes: "Corn and grains. Heavy nitrogen feeders; wind-pollinated, so plant in blocks.",
  },
  {
    id: "malvaceae",
    commonName: "Mallow family",
    rotationGroup: "fruiting",
    notes: "Okra and relatives. Heat-loving; share root-knot nematode with solanums.",
  },
  {
    id: "convolvulaceae",
    commonName: "Morning-glory family",
    rotationGroup: "root",
    notes: "Sweet potato. Tender vining tubers; grown from slips in warm soil.",
  },
  {
    id: "ericaceae",
    commonName: "Heath family",
    rotationGroup: "fruiting",
    notes: "Blueberry and relatives. Need acidic soil (pH 4.5-5.5); shallow-rooted.",
  },
  {
    id: "polygonaceae",
    commonName: "Knotweed family",
    rotationGroup: "leafy",
    notes: "Rhubarb. Perennial; leaf blades are toxic, only the stalks are eaten.",
  },
  {
    id: "asparagaceae",
    commonName: "Asparagus family",
    rotationGroup: "root",
    notes: "Asparagus. Long-lived perennial crowns; harvest spears before they fern out.",
  },
  {
    id: "asphodelaceae",
    commonName: "Aloe family",
    rotationGroup: "leafy",
    notes: "Aloe and relatives. Tender succulents; gritty, fast-draining soil.",
  },
  {
    id: "cactaceae",
    commonName: "Cactus family",
    rotationGroup: "fruiting",
    notes: "Prickly pear and relatives. Drought-hardy pads; mind the glochids.",
  },
];
