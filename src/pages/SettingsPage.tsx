import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAppStore } from "../store/appStore";
import type { SeedPacket, Settings } from "../types/models";
import { viabilityScore } from "../engines/inventory";
import { newId } from "../lib/ids";
import { Badge, badgeTone, ProduceImg } from "../components";

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  return (
    <section className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Settings</h1>
      <p className="mb-5 text-sm text-[var(--color-ink-soft)]">
        Configure your garden planner preferences.
      </p>

      <div className="space-y-6">
        {/* --- General --- */}
        <SectionHeading title="General" subtitle="Units, location, and display preferences" />

        <Choice
          label="Measurement Units"
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
          label="Enable in-app reminders"
          hint="Get notifications for watering, feeding, and harvest times"
          checked={settings.notificationsEnabled}
          onChange={(v) => update({ notificationsEnabled: v })}
        />

        {/* --- Presentation & feel --- */}
        <SectionHeading
          title="Presentation & Feel"
          subtitle="Motion, performance, and interaction settings"
        />

        <Check
          label="Field mode"
          hint="Larger touch targets for outdoor use with dirty hands"
          checked={settings.fieldMode}
          onChange={(v) => update({ fieldMode: v })}
        />
        <Choice
          label="Reduce Motion"
          value={settings.reducedMotion}
          options={[["system", "Follow system"], ["on", "Always reduce"], ["off", "Full motion"]]}
          onChange={(v) => update({ reducedMotion: v as Settings["reducedMotion"] })}
        />
        <Choice
          label="Performance"
          value={settings.performanceTier}
          options={[["auto", "Auto-detect"], ["high", "High quality"], ["low", "Battery saver"]]}
          onChange={(v) => update({ performanceTier: v as Settings["performanceTier"] })}
        />

        <div className="rounded-xl border border-[var(--color-paper-deep)] bg-white/30 p-3 dark:bg-white/5">
          <p className="mb-2 text-xs font-semibold text-[var(--color-ink-soft)]">Interaction Effects</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check small label="Sound effects" checked={settings.feel.soundEnabled} onChange={(v) => update({ feel: { ...settings.feel, soundEnabled: v } })} />
            <Check small label="Haptic feedback" checked={settings.feel.hapticsEnabled} onChange={(v) => update({ feel: { ...settings.feel, hapticsEnabled: v } })} />
            <Check small label="Weather animations" checked={settings.feel.ambientWeather} onChange={(v) => update({ feel: { ...settings.feel, ambientWeather: v } })} />
            <Check small label="Placement effects" checked={settings.feel.placementJuice} onChange={(v) => update({ feel: { ...settings.feel, placementJuice: v } })} />
          </div>
        </div>

        {/* --- Plant Database API --- */}
        <SectionHeading
          title="Online Plant Search"
          subtitle="Connect to Perenual's plant database to search and import plants"
        />

        <label className="block text-sm">
          <span className="font-medium">Perenual API Key</span>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Get a free key at{" "}
            <span className="font-medium text-[var(--color-canopy)]">perenual.com</span>
            {" "}— this enables the "Search Online" button in the Plant Encyclopedia.
          </p>
          <div className="relative mt-1.5">
            <input
              type="password"
              value={settings.perenualApiKey ?? ""}
              onChange={(e) => update({ perenualApiKey: e.target.value || undefined })}
              placeholder="Paste your API key here…"
              className="block w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm dark:bg-black/20"
            />
            {settings.perenualApiKey && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-success)]">
                Connected
              </span>
            )}
          </div>
        </label>

        {/* --- Seed Stash --- */}
        <SectionHeading
          title="Seed Stash"
          subtitle="Track your seed inventory — the planner uses this to prioritize recommendations"
        />
        <SeedStash />

        {/* --- Data --- */}
        <SectionHeading
          title="Your Data"
          subtitle="Export backups, download analytics, or import from a previous backup"
        />
        <DataSection />

        <div className="rounded-xl border border-[var(--color-paper-deep)] bg-white/30 p-3 text-xs text-[var(--color-ink-soft)] dark:bg-white/5">
          <p className="font-medium text-[var(--color-ink)]">Privacy Note</p>
          <p className="mt-0.5">
            All your data stays on this device — nothing is sent to a server. Backups and CSV exports
            are downloaded directly to your device.
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-t border-[var(--color-paper-deep)] pt-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{subtitle}</p>
    </div>
  );
}

function DataSection() {
  const [msg, setMsg] = useState<string>();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() =>
            void import("../lib/exportImport").then(async (m) => {
              m.downloadJson(await m.exportAll(), `plot_backup_${new Date().toISOString().slice(0, 10)}.json`);
            })
          }
          className="rounded-lg bg-[var(--color-canopy)] px-3 py-2 font-medium text-white hover:opacity-90"
        >
          Export Backup (JSON)
        </button>
        <button
          type="button"
          onClick={() => void import("../lib/exportImport").then((m) => m.exportCsvs())}
          className="rounded-lg bg-[var(--color-paper-deep)] px-3 py-2 font-medium hover:opacity-80"
        >
          Export Analytics (CSV)
        </button>
        <label className="cursor-pointer rounded-lg bg-[var(--color-paper-deep)] px-3 py-2 font-medium hover:opacity-80">
          Import Backup…
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!window.confirm("Importing will REPLACE all data on this device with the backup file. Continue?")) return;
              void f
                .text()
                .then(async (txt) => {
                  const m = await import("../lib/exportImport");
                  await m.importAll(JSON.parse(txt));
                  setMsg("Import complete — reloading…");
                  window.setTimeout(() => window.location.reload(), 800);
                })
                .catch((err) => setMsg(`Import failed: ${String(err)}`));
            }}
          />
        </label>
      </div>
      {msg && (
        <p className={`text-sm font-medium ${msg.startsWith("Import complete") ? "text-[var(--color-success)]" : "text-[var(--color-warn)]"}`}>
          {msg}
        </p>
      )}
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
        className="flex flex-wrap items-end gap-2"
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
        <label className="text-xs font-medium">
          Plant
          <select value={selected} onChange={(e) => setPlantId(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            {plants.map((p) => (
              <option key={p.id} value={p.id}>{p.commonName}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Packed For (Year)
          <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className="mt-1 block w-20 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <label className="text-xs font-medium">
          Amount
          <select value={qty} onChange={(e) => setQty(e.target.value as SeedPacket["quantity"])} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            <option value="high">Plenty</option>
            <option value="low">Running low</option>
            <option value="empty">Empty</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
          + Add Packet
        </button>
      </form>

      {packets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-paper-deep)] p-4 text-center text-[var(--color-ink-soft)]">
          <p className="font-medium">No seed packets logged yet</p>
          <p className="mt-1 text-xs">
            Add your seed packets here. The planner will use your stash to prioritize
            "Plant Next" and "Suggest" recommendations.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {packets.map((p) => {
            const plant = plantById.get(p.plantId);
            const score = plant ? viabilityScore(p, plant) : "good";
            const scoreLbl = { fresh: "Fresh", good: "Good", aging: "Aging", expired: "Expired" }[score] ?? score;
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2.5 dark:bg-white/5">
                {plant && <ProduceImg plant={plant} size={30} className="shrink-0" />}
                <span className="flex-1">
                  <span className="font-medium">{plant?.commonName ?? p.plantId}</span>
                  {p.packedForYear ? <span className="text-[var(--color-ink-soft)]"> · packed {p.packedForYear}</span> : ""}
                  <span className="text-[var(--color-ink-soft)]"> · {p.quantity === "high" ? "plenty" : p.quantity === "low" ? "running low" : "empty"}</span>
                </span>
                <Badge tone={score === "fresh" || score === "good" ? badgeTone.good : badgeTone.warn}>
                  {scoreLbl}
                </Badge>
                <button
                  type="button"
                  onClick={() => void db.seedPackets.delete(p.id)}
                  className="rounded-lg bg-[var(--color-warn)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-warn)] hover:bg-[var(--color-warn)]/20"
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
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              value === v
                ? "bg-[var(--color-canopy)] text-white shadow-sm"
                : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)] hover:opacity-80"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ label, checked, onChange, small, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; small?: boolean; hint?: string }) {
  return (
    <label className={`flex items-center justify-between gap-3 ${small ? "text-sm" : ""}`}>
      <div>
        <span className="font-medium">{label}</span>
        {hint && <p className="text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--color-canopy)]"
      />
    </label>
  );
}
