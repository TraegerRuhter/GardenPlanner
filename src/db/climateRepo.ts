/**
 * Location + ClimateProfile persistence and the §9 build flow:
 * location → ~10y of cached history → ClimateEngine → stored profile.
 * Falls back to the manual entry path when fetching fails (§9 step 1).
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import type { ClimateProfile, Location } from "../types/models";
import { openMeteoWeather } from "../adapters/openMeteo";
import { buildClimateProfile, manualClimateProfile } from "../engines/climate";
import { useAppStore } from "../store/appStore";

export interface ActiveClimate {
  location: Location;
  profile: ClimateProfile;
}

export async function getActiveClimate(): Promise<ActiveClimate | null> {
  const { settings } = useAppStore.getState();
  if (!settings.defaultLocationId) return null;
  const location = await db.locations.get(settings.defaultLocationId);
  if (!location) return null;
  const profile = await db.climateProfiles
    .where("locationId")
    .equals(location.id)
    .first();
  return profile ? { location, profile } : null;
}

/** Build (or rebuild) a profile from ~10 years of history. Throws offline. */
export async function buildAndSaveProfile(
  location: Location,
): Promise<ClimateProfile> {
  const fromYear = new Date().getFullYear() - 11;
  const records = await openMeteoWeather.getHistoricalDaily(location, fromYear);
  const profile = buildClimateProfile(location, records, newId());
  if (!profile) throw new Error("Not enough historical data for this location.");
  await persist(location, profile);
  return profile;
}

/** §9 manual fallback: user-entered frost dates and optional zone. */
export async function saveManualProfile(
  location: Location,
  lastSpringFrost: string, // "MM-DD"
  firstFallFrost: string,
  hardinessZone?: string,
): Promise<ClimateProfile> {
  const profile = manualClimateProfile(
    location.id,
    newId(),
    lastSpringFrost,
    firstFallFrost,
    hardinessZone,
  );
  await persist(location, profile);
  return profile;
}

async function persist(location: Location, profile: ClimateProfile) {
  await db.transaction("rw", [db.locations, db.climateProfiles], async () => {
    await db.locations.put(location);
    // one profile per location: replace any prior
    await db.climateProfiles.where("locationId").equals(location.id).delete();
    await db.climateProfiles.put(profile);
  });
  useAppStore.getState().updateSettings({ defaultLocationId: location.id });
}

export function newLocation(
  label: string,
  lat: number,
  lon: number,
  source: Location["source"],
  elevationM?: number,
): Location {
  return { id: newId(), label, lat, lon, elevationM, source };
}
