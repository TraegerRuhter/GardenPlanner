/**
 * §2.2 photo journal: dated text + photo entries per planted instance.
 * Photos live in the IndexedDB blobs store (§23); object URLs are cached
 * module-wide and built lazily, SpriteNode-style.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { PlantInstance } from "../../types/models";
import { newId } from "../../lib/ids";
import { todayISO } from "../../lib/dates";

const urlCache = new Map<string, string>();

function BlobImg({ blobId, alt }: { blobId: string; alt: string }) {
  const [, bump] = useState(0);
  const url = urlCache.get(blobId);
  useEffect(() => {
    if (urlCache.has(blobId)) return;
    void db.blobs.get(blobId).then((rec) => {
      if (rec) {
        urlCache.set(blobId, URL.createObjectURL(rec.blob));
        bump((n) => n + 1);
      }
    });
  }, [blobId]);
  if (!url) return null;
  return <img src={url} alt={alt} className="max-h-40 rounded-lg object-cover" />;
}

export function JournalPanel({ instance }: { instance: PlantInstance }) {
  const entries = useLiveQuery(
    () =>
      db.journal
        .where("instanceId")
        .equals(instance.id)
        .reverse()
        .sortBy("date"),
    [instance.id],
  );
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function addEntry() {
    if (!text.trim() && !file) return;
    setSaving(true);
    let photoBlobId: string | undefined;
    if (file) {
      photoBlobId = newId();
      await db.blobs.add({
        id: photoBlobId,
        blob: file,
        mimeType: file.type,
        createdAt: new Date().toISOString(),
      });
    }
    const entryId = newId();
    await db.journal.add({
      id: entryId,
      instanceId: instance.id,
      gardenId: instance.gardenId,
      date: todayISO(),
      text: text.trim() || undefined,
      photoBlobId,
      stageAtEntry: instance.currentStage,
    });
    if (photoBlobId) {
      const inst = await db.instances.get(instance.id);
      if (inst) {
        await db.instances.put({ ...inst, photoEntryIds: [...inst.photoEntryIds, entryId] });
      }
    }
    setText("");
    setFile(null);
    setSaving(false);
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-paper-deep)] bg-white/40 p-2 text-sm dark:bg-white/5">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addEntry();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Journal note…"
          aria-label="Journal note"
          className="min-w-36 flex-1 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 text-xs dark:bg-black/20"
        />
        <label className="cursor-pointer rounded-lg bg-[var(--color-paper-deep)] px-2 py-1.5 text-xs font-medium">
          📷 {file ? file.name.slice(0, 14) : "Photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="submit"
          disabled={saving || (!text.trim() && !file)}
          className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {entries && entries.length > 0 && (
        <ul className="mt-2 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg bg-[var(--color-paper-deep)]/40 p-2">
              <p className="text-[11px] text-[var(--color-ink-soft)]">
                {e.date}
                {e.stageAtEntry ? ` · ${e.stageAtEntry}` : ""}
              </p>
              {e.text && <p className="text-xs">{e.text}</p>}
              {e.photoBlobId && <BlobImg blobId={e.photoBlobId} alt={`Photo ${e.date}`} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
