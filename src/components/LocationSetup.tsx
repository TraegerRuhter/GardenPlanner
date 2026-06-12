/**
 * §9 location flow: search a place (geocode), use device geolocation, or
 * type coordinates; then build a climate profile from ~10 years of history.
 * When fetching fails (offline, API down), the manual frost-date form is the
 * fallback — no network call blocks the workflow (§2.4).
 */

import { useState } from "react";
import type { Location } from "../types/models";
import { openMeteoGeocode } from "../adapters/openMeteo";
import {
  buildAndSaveProfile,
  newLocation,
  saveManualProfile,
} from "../db/climateRepo";

type Phase =
  | { step: "pick" }
  | { step: "building"; location: Location }
  | { step: "manual_climate"; location: Location; error?: string };

export function LocationSetup({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof openMeteoGeocode.search>>>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();

  async function search() {
    setSearching(true);
    setError(undefined);
    try {
      const r = await openMeteoGeocode.search(query);
      setResults(r);
      if (r.length === 0) setError("No places found — try a manual entry below.");
    } catch {
      setError("Search failed (offline?). Use manual entry below.");
    } finally {
      setSearching(false);
    }
  }

  async function detectGeolocation() {
    setError(undefined);
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        build(
          newLocation(
            "My location",
            round4(pos.coords.latitude),
            round4(pos.coords.longitude),
            "geolocation",
          ),
        ),
      () => setError("Location permission denied — search or enter manually."),
      { timeout: 10_000 },
    );
  }

  async function build(location: Location) {
    setPhase({ step: "building", location });
    try {
      await buildAndSaveProfile(location);
      onDone();
    } catch (e) {
      setPhase({
        step: "manual_climate",
        location,
        error: `Couldn't fetch climate history (${String(e)}). Enter frost dates manually instead:`,
      });
    }
  }

  if (phase.step === "building") {
    return (
      <p className="py-8 text-center text-[var(--color-ink-soft)]">
        Analyzing ~10 years of weather for{" "}
        <strong>{phase.location.label}</strong>… (frost dates, normals, zone)
      </p>
    );
  }

  if (phase.step === "manual_climate") {
    return (
      <ManualClimateForm
        location={phase.location}
        intro={phase.error}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 font-semibold">Where is this garden?</h2>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Your location stays on this device and is only used to derive frost
          dates, climate normals, and a hardiness zone (spec §26).
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="City or place name…"
          aria-label="Search for a place"
          className="flex-1 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm dark:bg-black/20"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || !query.trim()}
          className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--color-warn)]">{error}</p>}

      {results.length > 0 && (
        <ul className="divide-y divide-[var(--color-paper-deep)] rounded-lg border border-[var(--color-paper-deep)]">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => void build(newLocation(r.label, r.lat, r.lon, "geocode", r.elevationM))}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-paper-deep)]/50"
              >
                {r.label}
                <span className="ml-2 text-xs text-[var(--color-ink-soft)]">
                  {r.lat.toFixed(2)}, {r.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void detectGeolocation()}
        className="rounded-lg bg-[var(--color-paper-deep)] px-4 py-2 text-sm font-medium"
      >
        📍 Use my device location
      </button>

      <ManualCoordsForm onPick={(loc) => void build(loc)} />
    </div>
  );
}

function ManualCoordsForm({ onPick }: { onPick: (loc: Location) => void }) {
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const valid =
    label.trim() &&
    Number.isFinite(Number(lat)) &&
    Math.abs(Number(lat)) <= 90 &&
    Number.isFinite(Number(lon)) &&
    Math.abs(Number(lon)) <= 180 &&
    lat.trim() !== "" &&
    lon.trim() !== "";

  return (
    <details className="rounded-lg border border-[var(--color-paper-deep)] p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Enter coordinates manually
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Label" value={label} onChange={setLabel} placeholder="Home garden" />
        <Field label="Latitude" value={lat} onChange={setLat} placeholder="45.20" />
        <Field label="Longitude" value={lon} onChange={setLon} placeholder="-123.96" />
        <button
          type="button"
          disabled={!valid}
          onClick={() => onPick(newLocation(label.trim(), Number(lat), Number(lon), "manual"))}
          className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </details>
  );
}

function ManualClimateForm({
  location,
  intro,
  onDone,
}: {
  location: Location;
  intro?: string;
  onDone: () => void;
}) {
  const [spring, setSpring] = useState("04-15");
  const [fall, setFall] = useState("10-15");
  const [zone, setZone] = useState("");
  const md = /^\d{2}-\d{2}$/;
  const valid = md.test(spring) && md.test(fall);

  return (
    <div className="space-y-3">
      {intro && <p className="text-sm text-[var(--color-warn)]">{intro}</p>}
      <p className="text-sm">
        Frost dates for <strong>{location.label}</strong> (month-day; a local
        extension office or seed catalog lists these):
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Last spring frost (MM-DD)" value={spring} onChange={setSpring} placeholder="04-15" />
        <Field label="First fall frost (MM-DD)" value={fall} onChange={setFall} placeholder="10-15" />
        <Field label="Zone (optional)" value={zone} onChange={setZone} placeholder="8b" />
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            void saveManualProfile(location, spring, fall, zone.trim() || undefined).then(onDone)
          }
          className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs font-medium text-[var(--color-ink-soft)]">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-36 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 text-sm text-[var(--color-ink)] dark:bg-black/20"
      />
    </label>
  );
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}
