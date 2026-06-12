import { describe, expect, it } from "vitest";
import { defaultSettings, useAppStore } from "./appStore";

describe("settings defaults (§7.12, §32.7)", () => {
  it("ships the spec-mandated feel defaults", () => {
    expect(defaultSettings.feel.soundEnabled).toBe(false); // §32.6: never autoplay
    expect(defaultSettings.feel.hapticsEnabled).toBe(true);
    expect(defaultSettings.feel.placementJuice).toBe(true);
    expect(defaultSettings.reducedMotion).toBe("system");
    expect(defaultSettings.performanceTier).toBe("auto");
    expect(defaultSettings.pauseAdvanceOnWaterloggingStress).toBe(false); // §31.8.9
  });

  it("patches settings without dropping nested feel config", () => {
    useAppStore.getState().updateSettings({ unitSystem: "metric" });
    const after = useAppStore.getState().settings;
    expect(after.unitSystem).toBe("metric");
    expect(after.feel).toEqual(defaultSettings.feel);
  });
});
