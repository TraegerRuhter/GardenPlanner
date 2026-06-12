import { useEffect } from "react";
import { useAppStore } from "../store/appStore";

/** Applies theme (light/dark/system) to <html data-theme>. */
export function useApplyTheme() {
  const theme = useAppStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
