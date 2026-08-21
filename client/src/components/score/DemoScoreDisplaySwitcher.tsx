import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import {
  useScoreDisplayMode,
  type ScoreDisplayMode,
} from "@/hooks/useScoreDisplayMode";

/**
 * Walkthrough control for "How people's verification is shown" — the same job
 * the payments DemoSubscriptionSwitcher does for subscription states: let the
 * whole room watch every page react while someone flips the option, instead of
 * detouring through Settings between each look.
 *
 * Unlike the payments switcher there is no mock seam here — the display mode
 * is a real, shipping viewer setting, and this panel writes the SAME store the
 * Settings control writes (the change is instant on every surface because the
 * store broadcasts). So it can't be gated by a feature flag that "turns real"
 * one day. Instead it's an opt-in: visiting any page with `?demo=display`
 * shows it and remembers that on this device; the ✕ forgets it. Nobody sees
 * this without the link.
 */
const DEMO_FLAG = "brainstorm_demo_display";

function demoRequested(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "display") {
      localStorage.setItem(DEMO_FLAG, "1");
      return true;
    }
    return localStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

const MODES: { key: ScoreDisplayMode; label: string; hint: string }[] = [
  { key: "number", label: "Number", hint: "0–100 coins — the default" },
  { key: "level", label: "Level", hint: "five-step dots, no digits" },
  { key: "tier", label: "Tier", hint: "color ring around the photo" },
  { key: "word", label: "Word", hint: "ring + tier word by the name" },
  { key: "off", label: "Off", hint: "no verification anywhere" },
];

export function DemoScoreDisplaySwitcher() {
  const [enabled, setEnabled] = useState(demoRequested);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useScoreDisplayMode();

  if (!enabled) return null;

  const dismiss = () => {
    try {
      localStorage.removeItem(DEMO_FLAG);
    } catch {
      /* ignore */
    }
    setEnabled(false);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden" data-testid="demo-display-switcher">
      {open ? (
        <div className="w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <FlaskConical className="h-3.5 w-3.5" /> Demo: verification display
            </span>
            <button
              type="button"
              onClick={dismiss}
              className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close demo switcher"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                data-testid={`demo-display-${m.key}`}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  mode === m.key
                    ? "bg-brand-primary/10 ring-1 ring-brand-primary/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{m.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
            This flips the real per-device setting — the one under Settings →
            Trust Perspective. Every page follows instantly.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-lg backdrop-blur px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
          data-testid="demo-display-open"
          aria-label="Open verification display demo switcher"
        >
          <FlaskConical className="h-3.5 w-3.5" /> Display
        </button>
      )}
    </div>
  );
}
