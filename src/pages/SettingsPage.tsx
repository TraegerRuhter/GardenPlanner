/**
 * §7.12 settings + the §32.7 presentation/feel/performance surface + the
 * §31.1 seed stash manager. Field mode, motion, and tier values are stored
 * now; their visual consumers (ambient FX, juice, Time Machine) gate on
 * them as those land in Phase 5.
 */

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAppStore } from "../store/appStore";
import type { SeedPacket, Settings } from "../types/models";
import { viabilityScore } from "../engines/inventory";
import { newId } from "../lib/ids";
import { Badge, badgeTone } from "../components";

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  return (
    <section className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">Settings</h1>
      <div className="space-y-5">
        <Choice
          label="Units"
          value={settings.unitSystem}
          options={[["imperial", "Imperial (ft, °F)"], ["metric", "Metric (cm, °C)"]]}
          onChange={(v) => update({ unitSystem: v as Settings["unitSystem"] })}
        />
        <Choice
          label="Hemisphere"
          value={settings.hemisphere}
          options={[["northern", "Northern"], ["southern", "Southern"]]}
          onChange={(v) => update({ hemisphere: v as Settings["hemisphere"] })}
        />
        <Choice
          label="Theme"
          value={settings.theme}
          options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]}
          onChange={(v) => update({ theme: v as Settings["theme"] })}
        />
        <Check
          label="In-app reminders"
          checked={settings.notificationsEnabled}
          onChange={(v) => update({ notificationsEnabled: v })}
        />

        <h2 className="border-t border-[var(--color-paper-deep)] pt-4 font-semibold">
          Presentation & feel (§32.7)
        </h2>
        <Check
          label="Field mode — big targets for dirty hands (full layout lands Phase 5)"
          checked={settings.fieldMode}
          onChange={(v) => update({ fieldMode: v })}
        />
        <Choice
          label="Reduce motion"
          value={settings.reducedMotion}
          options={[["system", "Follow system"], ["on", "On"], ["off", "Off"]]}
          onChange={(v) => update({ reducedMotion: v as Settings["reducedMotion"] })}
        />
        <Choice
          label="Performance tier"
          value={settings.performanceTier}
          options={[["auto", "Auto"], ["high", "High"], ["low", "Low (battery)"]]}
          onChange={(v) => update({ performanceTier: v as Settings["performanceTier"] })}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check small label="Sound" checked={settings.feel.soundEnabled} onChange={(v) => update({ feel: { ...settings.feel, soundEnabled: v } })} />
          <Check small label="Haptics" checked={settings.feel.hapticsEnabled} onChange={(v) => update({ feel: { ...settings.feel, hapticsEnabled: v } })} />
          <Check small label="Ambient weather" checked={settings.feel.ambientWeather} onChange={(v) => update({ feel: { ...settings.feel, ambientWeather: v } })} />
          <Check small label="Placement juice" checked={settings.feel.placementJuice} onChange={(v) => update({ feel: { ...settings.feel, placementJuice: v } })} />
        </div>

        <h2 className="border-t border-[var(--color-paper-deep)] pt-4 font-semibold">
          Seed stash (§31.1)
        </h2>
        <SeedStash />

        <h2 className="border-t border-[var(--color-paper-deep)] pt-4 font-semibold">
          Your data (§23)
        </h2>
        <DataSection />

        <p className="text-xs text-[var(--color-ink-soft)]">
          All data stays on this device (§26); backups and CSVs above are yours to keep.
          Frost-date convention: the "safe" date carries 10% residual frost risk (§30.4).
        </p>
      </div>
    </section>
  );
}

function DataSection() {
  const [msg, setMsg] = useState<string>();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() =>
          void import("../lib/exportImport").then(async (m) => {
            m.downloadJson(await m.exportAll(), `plot_backup_${new Date().toISOString().slice(0, 10)}.json`);
          })
        }
        className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 font-medium text-white"
      >
        ⬇ Export backup (JSON)
      </button>
      <button
        type="button"
        onClick={() => void import("../lib/exportImport").then((m) => m.exportCsvs())}
        className="rounded-lg bg-[var(--color-paper-deep)] px-3 py-1.5 font-medium"
      >
        ⬇ Export analysis CSVs
      </button>
      <label className="cursor-pointer rounded-lg bg-[var(--color-paper-deep)] px-3 py-1.5 font-medium">
        ⬆ Import backup…
        <input
          type="file"
          accept="application/json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!window.confirm("Importing REPLACES all data on this device with the backup. Continue?")) return;
            void f
              .text()
              .then(async (txt) => {
                const m = await import("../lib/exportImport");
                await m.importAll(JSON.parse(txt));
                setMsg("Import complete ✓ — reloading…");
                window.setTimeout(() => window.location.reload(), 800);
              })
              .catch((err) => setMsg(`Import failed: ${String(err)}`));
          }}
        />
      </label>
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}

function SeedStash() {
  const data = useLiveQuery(async () => {
    const [packets, plants] = await Promise.all([
      db.seedPackets.toArray(),
      db.catalog_plants.orderBy("commonName").toArray(),
    ]);
    return { packets, plants };
  }, []);
  const [plantId, setPlantId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [qty, setQty] = useState<SeedPacket["quantity"]>("high");

  if (!data) return null;
  const { packets, plants } = data;
  const plantById = new Map(plants.map((p) => [p.id, p]));
  const selected = plantId || plants[0]?.id || "";

  return (
    <div className="space-y-3 text-sm">
      <form
        className="flex flex-wrap items-end gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void db.seedPackets.add({
            id: newId(),
            plantId: selected,
            packedForYear: Number(year) || undefined,
            quantity: qty,
            addedAt: new Date().toISOString(),
          });
        }}
      >
        <label className="font-medium">Plant
          <select value={selected} onChange={(e) => setPlantId(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            {plants.map((p) => (
              <option key={p.id} value={p.id}>{p.commonName}</option>
            ))}
          </select>
        </label>
        <label className="font-medium">Packed for
          <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className="mt-1 block w-20 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <label className="font-medium">Amount
          <select value={qty} onChange={(e) => setQty(e.target.value as SeedPacket["quantity"])} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            <option value="high">plenty</option>
            <option value="low">running low</option>
            <option value="empty">empty</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 font-medium text-white">
          + Add packet
        </button>
      </form>

      {packets.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">
          No packets yet — log what you own and Suggest/Plant Next will favor it.
        </p>
      ) : (
        <ul className="space-y-1">
          {packets.map((p) => {
            const plant = plantById.get(p.plantId);
            const score = plant ? viabilityScore(p, plant) : "good";
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-paper-deep)] p-2">
                <span className="flex-1">
                  {plant?.commonName ?? p.plantId}
                  {p.packedForYear ? ` · packed ${p.packedForYear}` : ""} · {p.quantity}
                </span>
                <Badge tone={score === "fresh" || score === "good" ? badgeTone.good : badgeTone.warn}>{score}</Badge>
                <button
                  type="button"
                  onClick={() => void db.seedPackets.delete(p.id)}
                  className="rounded bg-[var(--color-warn)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-warn)]"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${value === v ? "bg-[var(--color-canopy)] text-white" : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)]"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ label, checked, onChange, small }: { label: string; checked: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 ${small ? "text-sm" : ""}`}>
      <span className="font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--color-canopy)]"
      />
    </label>
  );
}
