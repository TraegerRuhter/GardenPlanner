/**
 * §19 unified task list: sow / water / fertilize / harvest / remedy /
 * succession / custom, grouped by due date. Completing a care task writes
 * back to the instance; recurring tasks respawn.
 */

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Task } from "../types/models";
import { addUserTask, completeTask, runCarePass } from "../db/careRepo";
import { diffDays, formatShort, todayISO } from "../lib/dates";
import { Badge, badgeTone } from "../components";

const KIND_GLYPH: Record<Task["kind"], string> = {
  water: "💧", fertilize: "🌿", sow: "🌱", transplant: "🪴", harvest: "🧺",
  harden_off: "🌬", succession: "🔁", custom: "📌", remedy: "🩹",
};

export function TasksPage() {
  const [showDone, setShowDone] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const tasks = useLiveQuery(
    () => db.tasks.orderBy("dueOn").toArray(),
    [refresh],
  );

  if (!tasks) return <Pad>Loading…</Pad>;
  const today = todayISO();
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done).slice(-15).reverse();

  const overdue = open.filter((t) => diffDays(t.dueOn, today) > 0);
  const dueToday = open.filter((t) => t.dueOn === today);
  const upcoming = open.filter((t) => diffDays(today, t.dueOn) > 0);

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button
          type="button"
          onClick={() => void runCarePass().then(() => setRefresh((n) => n + 1))}
          className="rounded-lg bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
          title="Re-check watering deficits and feeds now"
        >
          ↻ Check care now
        </button>
        <button
          type="button"
          aria-pressed={showDone}
          onClick={() => setShowDone((v) => !v)}
          className="ml-auto rounded-lg bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
        >
          {showDone ? "Hide" : "Show"} done
        </button>
      </div>

      <AddTaskForm />

      {open.length === 0 && <Pad>All clear — nothing due. 🌞</Pad>}
      <TaskGroup title={`Overdue (${overdue.length})`} tone="overdue" tasks={overdue} today={today} />
      <TaskGroup title={`Today (${dueToday.length})`} tone="today" tasks={dueToday} today={today} />
      <TaskGroup title={`Upcoming (${upcoming.length})`} tone="later" tasks={upcoming} today={today} />

      {showDone && done.length > 0 && (
        <>
          <h2 className="mt-5 mb-1 text-sm font-semibold text-[var(--color-ink-soft)]">Recently done</h2>
          <ul className="space-y-1 opacity-60">
            {done.map((t) => (
              <li key={t.id} className="rounded-lg border border-[var(--color-paper-deep)] p-2 text-sm line-through">
                {KIND_GLYPH[t.kind]} {t.title}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TaskGroup({ title, tone, tasks, today }: { title: string; tone: "overdue" | "today" | "later"; tasks: Task[]; today: string }) {
  if (tasks.length === 0) return null;
  return (
    <>
      <h2 className={`mt-5 mb-1 text-sm font-semibold ${tone === "overdue" ? "text-[var(--color-warn)]" : "text-[var(--color-ink-soft)]"}`}>
        {title}
      </h2>
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2 text-sm dark:bg-white/5">
            <input
              type="checkbox"
              aria-label={`Complete: ${t.title}`}
              onChange={() => void completeTask(t.id)}
              className="h-5 w-5 shrink-0 accent-[var(--color-canopy)]"
            />
            <span aria-hidden>{KIND_GLYPH[t.kind]}</span>
            <span className="min-w-0 flex-1">{t.title}</span>
            <Badge tone={tone === "overdue" ? badgeTone.warn : badgeTone.neutral}>
              {t.dueOn === today ? "today" : formatShort(t.dueOn)}
            </Badge>
            {t.recurrence && <Badge>↻ {t.recurrence.everyDays}d</Badge>}
          </li>
        ))}
      </ul>
    </>
  );
}

function AddTaskForm() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayISO());
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void addUserTask(title.trim(), due).then(() => setTitle(""));
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        aria-label="New task title"
        className="min-w-40 flex-1 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-1.5 text-sm dark:bg-black/20"
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        aria-label="Due date"
        className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 text-sm dark:bg-black/20"
      />
      <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-sm font-medium text-white">
        Add
      </button>
    </form>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[var(--color-ink-soft)]">{children}</p>;
}
