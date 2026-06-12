/**
 * App-level state (§23): Zustand for low ceremony. Holds settings and light
 * UI state; the large/append-heavy collections (instances, events, journal)
 * are queried straight from Dexie, never held wholesale in memory.
 *
 * `init()` runs once at boot: seeds the catalog (§7.1) and hydrates the
 * settings row; `updateSettings` writes through to the Dexie `settings`
 * store so preferences survive reloads and appear in exports.
 */

import { create } from "zustand";
import type { Settings } from "../types/models";
import { db, SETTINGS_ID } from "../db/db";
import { seedCatalogIfNeeded } from "../db/seed";

/** Spec-mandated defaults: §7.12 and §32.7. */
export const defaultSettings: Settings = {
  // Internally everything is metric (§0); imperial is only the display
  // default because the product owner gardens in US units (§12.1's 1 ft cell).
  unitSystem: "imperial",
  hemisphere: "northern",
  notificationsEnabled: false,
  theme: "system",
  pauseAdvanceOnWaterloggingStress: false, // §31.8 decision 9: default OFF
  fieldMode: false,
  reducedMotion: "system",
  performanceTier: "auto",
  feel: {
    soundEnabled: false, // §32.6: sound defaults OFF, gesture-gated
    hapticsEnabled: true, // no-ops where unsupported (iOS)
    ambientWeather: true,
    placementJuice: true,
  },
};

type BootState = "loading" | "ready" | "error";

interface AppState {
  bootState: BootState;
  bootError?: string;
  settings: Settings;
  activeGardenId?: string;
  /** §16 → §12: plant chosen in Suggest, picked up by the Designer palette */
  pendingPlantId?: string;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  setActiveGarden: (id?: string) => void;
  setPendingPlant: (id?: string) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  bootState: "loading",
  settings: defaultSettings,
  activeGardenId: undefined,

  init: async () => {
    try {
      await seedCatalogIfNeeded(db);
      const stored = await db.settings.get(SETTINGS_ID);
      if (stored) {
        const { id, ...rest } = stored;
        void id;
        set({
          settings: {
            ...defaultSettings,
            ...rest,
            feel: { ...defaultSettings.feel, ...rest.feel },
          },
        });
      } else {
        await db.settings.put({ id: SETTINGS_ID, ...defaultSettings });
      }
      set({ bootState: "ready" });
      // §13.2/§19: daily stage pass + care pass run on every app open.
      void import("../db/instancesRepo")
        .then((m) => m.runDailyPass())
        .then(() => import("../db/careRepo"))
        .then((m) => m.runCarePass());
    } catch (e) {
      set({ bootState: "error", bootError: String(e) });
    }
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    // fire-and-forget write-through; UI state is the source of truth in-session
    void db.settings.put({ id: SETTINGS_ID, ...settings });
  },

  setActiveGarden: (id) => set({ activeGardenId: id }),
  setPendingPlant: (id) => set({ pendingPlantId: id }),
}));
