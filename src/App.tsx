import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "./shell/AppShell";
import { useAppStore } from "./store/appStore";
import { useApplyTheme } from "./lib/useApplyTheme";
import { db } from "./db/db";
import {
  CalendarPage,
  EncyclopediaPage,
  PlantDetailPage,
  PlantNextPage,
  SettingsPage,
  SuggestPage,
  TasksPage,
  TrackerPage,
} from "./pages";

// §25: Konva loads only when the Designer opens.
const DesignerPage = lazy(() => import("./pages/designer/DesignerPage"));

export default function App() {
  const bootState = useAppStore((s) => s.bootState);
  const bootError = useAppStore((s) => s.bootError);
  const init = useAppStore((s) => s.init);
  useApplyTheme();

  useEffect(() => {
    if (bootState === "loading") void init();
  }, [bootState, init]);

  if (bootState === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
        Preparing the garden…
      </div>
    );
  }
  if (bootState === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-[var(--color-paper)] p-6 text-center">
        <p className="font-semibold">Couldn't open local storage.</p>
        <p className="max-w-md text-sm text-[var(--color-ink-soft)]">{bootError}</p>
      </div>
    );
  }

  // Strip the trailing slash off Vite's BASE_URL so the router basename is
  // "/pandas-challenge" on Pages and "/" locally.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

  return (
    <BrowserRouter basename={basename}>
      <Suspense fallback={<div className="p-6 text-[var(--color-ink-soft)]">Loading…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LandingRedirect />} />
            <Route path="/encyclopedia" element={<EncyclopediaPage />} />
            <Route path="/encyclopedia/:plantId" element={<PlantDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/designer" element={<DesignerPage />} />
            <Route path="/tracker" element={<TrackerPage />} />
            <Route path="/plant-next" element={<PlantNextPage />} />
            <Route path="/suggest" element={<SuggestPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<LandingRedirect />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

/** §21.2: Designer leads once a garden exists; Encyclopedia before that. */
function LandingRedirect() {
  const count = useLiveQuery(() => db.gardens.count(), []);
  if (count === undefined) return null;
  return <Navigate to={count > 0 ? "/designer" : "/encyclopedia"} replace />;
}
