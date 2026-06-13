import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/encyclopedia", label: "Plants", desc: "Browse & search the plant catalog", glyph: "🌱" },
  { to: "/calendar", label: "Calendar", desc: "Planting windows & season timeline", glyph: "📅" },
  { to: "/designer", label: "Designer", desc: "Layout your garden beds", glyph: "🗺️" },
  { to: "/tracker", label: "Tracker", desc: "Monitor growth stages & harvests", glyph: "📈" },
  { to: "/plant-next", label: "Plant Next", desc: "What to plant right now", glyph: "⏭️" },
  { to: "/suggest", label: "Suggest", desc: "Personalized plant recommendations", glyph: "💡" },
  { to: "/tasks", label: "Tasks", desc: "Daily care & to-do list", glyph: "✅" },
  { to: "/settings", label: "Settings", desc: "Preferences, data & seed stash", glyph: "⚙️" },
] as const;

function tabClass({ isActive }: { isActive: boolean }) {
  return [
    "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium",
    "md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-sm md:rounded-xl",
    isActive
      ? "bg-[var(--color-canopy)] text-white shadow-sm"
      : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)] active:scale-95",
  ].join(" ");
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)] md:flex-row">
      {/* Side rail (desktop/tablet) */}
      <nav
        aria-label="Primary navigation"
        className="hidden border-r border-[var(--color-paper-deep)] p-3 md:flex md:w-56 md:flex-col md:gap-0.5"
      >
        <div className="mb-1 px-3 pt-2">
          <span className="text-xl font-bold tracking-wide text-[var(--color-canopy)]">
            PLOT
          </span>
          <span className="ml-1.5 text-[10px] font-medium text-[var(--color-ink-soft)]">
            Garden Planner
          </span>
        </div>
        <div className="mb-3 border-b border-[var(--color-paper-deep)]" />
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={tabClass} title={t.desc}>
            <span aria-hidden className="text-base md:text-lg">{t.glyph}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
        <div className="mt-auto px-3 pb-2 text-[9px] text-[var(--color-ink-soft)]">
          All data stored locally on your device
        </div>
      </nav>

      <main className="flex-1 pt-12 pb-20 md:pt-0 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile header bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-center border-b border-[var(--color-paper-deep)] bg-[var(--color-paper)]/95 px-4 py-2 backdrop-blur-sm md:hidden">
        <span className="text-base font-bold tracking-wide text-[var(--color-canopy)]">
          PLOT
        </span>
        <span className="ml-1.5 text-[10px] font-medium text-[var(--color-ink-soft)]">
          Garden Planner
        </span>
      </header>

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around gap-0.5 border-t border-[var(--color-paper-deep)] bg-[var(--color-paper)]/95 px-1 py-1.5 backdrop-blur-sm md:hidden"
      >
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={tabClass}>
            <span aria-hidden className="text-base">{t.glyph}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
