import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "./shell/AppShell";
import { useAppStore } from "./store/appStore";
import { useApplyTheme } from "./lib/useApplyTheme";
import { db } from "./db/db";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--color-paper)]">
        <span className="text-2xl font-bold tracking-wide text-[var(--color-canopy)]">PLOT</span>
        <span className="text-sm text-[var(--color-ink-soft)]">Preparing your garden…</span>
      </div>
    );
  }
  if (bootState === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--color-paper)] p-6 text-center">
        <span className="text-2xl font-bold tracking-wide text-[var(--color-canopy)]">PLOT</span>
        <p className="font-semibold text-[var(--color-warn)]">Unable to open local storage</p>
        <p className="max-w-md text-sm text-[var(--color-ink-soft)]">{bootError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // Strip the trailing slash off Vite's BASE_URL so the router basename is
  // "/GardenPlanner" on Pages and "/" locally.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

  return (
    <BrowserRouter basename={basename}>
      <ErrorBoundary>
        <Suspense fallback={<div className="flex items-center justify-center p-12 text-sm text-[var(--color-ink-soft)]">Loading page…</div>}>
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
      </ErrorBoundary>
    </BrowserRouter>
  );
}

/** §21.2: Designer leads once a garden exists; Encyclopedia before that. */
function LandingRedirect() {
  const count = useLiveQuery(() => db.gardens.count(), []);
  if (count === undefined) return null;
  return <Navigate to={count > 0 ? "/designer" : "/encyclopedia"} replace />;
}
