/**
 * Tab shell (§21.2): bottom tab bar on phones, side rail on md+ screens.
 * Pixel art stays inside the plot; the chrome is clean and legible (§21.1).
 * Tab icons are placeholder glyphs until the sprite system lands (§21.4).
 */

import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/encyclopedia", label: "Plants", glyph: "🌱" },
  { to: "/calendar", label: "Calendar", glyph: "📅" },
  { to: "/designer", label: "Designer", glyph: "🗺️" },
  { to: "/tracker", label: "Tracker", glyph: "📈" },
  { to: "/plant-next", label: "Next", glyph: "⏭️" },
  { to: "/suggest", label: "Suggest", glyph: "💡" },
  { to: "/tasks", label: "Tasks", glyph: "✅" },
  { to: "/settings", label: "Settings", glyph: "⚙️" },
] as const;

function tabClass({ isActive }: { isActive: boolean }) {
  return [
    "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium",
    "md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm",
    isActive
      ? "bg-[var(--color-canopy)] text-white"
      : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)]",
  ].join(" ");
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)] md:flex-row">
      {/* Side rail (desktop/tablet) */}
      <nav
        aria-label="Primary"
        className="hidden border-r border-[var(--color-paper-deep)] p-3 md:flex md:w-52 md:flex-col md:gap-1"
      >
        <div className="mb-4 px-3 pt-2 text-lg font-bold tracking-wide text-[var(--color-canopy)]">
          PLOT
        </div>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={tabClass}>
            <span aria-hidden>{t.glyph}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 flex justify-around gap-0.5 overflow-x-auto border-t border-[var(--color-paper-deep)] bg-[var(--color-paper)] px-1 py-1.5 md:hidden"
      >
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={tabClass}>
            <span aria-hidden>{t.glyph}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
