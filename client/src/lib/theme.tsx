import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// OS-aware theming (Design System v1.0, dark mode). Three-state choice:
//   "system" — live-tracks the OS via matchMedia
//   "light" / "dark" — an explicit persisted lock (localStorage.brainstorm_theme)
// The resolved theme is applied as class="dark" on <html> (Tailwind darkMode:
// ["class"]). A no-flash inline script in index.html sets the class before first
// paint; this provider keeps it in sync afterward.
//
// ROLLOUT GATE: while the dark neutral sweep is still in progress, the default
// is "light" and the no-flash script only honors an EXPLICIT "dark" — so a
// dark-OS visitor is never dropped into a half-finished dark UI. When dark mode
// is complete and the toggle ships, change DEFAULT_CHOICE to "system" and update
// the no-flash script in index.html to honor system preference.
export const DEFAULT_CHOICE: ThemeChoice = "light";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "brainstorm_theme";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStored(): ThemeChoice {
  if (typeof window === "undefined") return DEFAULT_CHOICE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return DEFAULT_CHOICE;
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return prefersDark() ? "dark" : "light";
  return choice;
}

function apply(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()));

  // Apply + persist whenever the choice changes.
  useEffect(() => {
    const r = resolve(choice);
    setResolved(r);
    apply(r);
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {}
  }, [choice]);

  // In "system" mode, live-track the OS preference.
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = resolve("system");
      setResolved(r);
      apply(r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => setChoiceState(c), []);

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
