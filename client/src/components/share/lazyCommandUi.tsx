/**
 * The command menu primitives (components/ui/command, and cmdk under them) for pickers
 * that open on demand: the tag pickers on notes and profiles. Their trigger
 * renders on every card, which put cmdk in the entry chunk for a menu most
 * visits never open.
 *
 * Not React.lazy: a lazy component suspends on its first render even when its
 * chunk is already here, so a popover opened after a hover warmed it would
 * still mount a fallback first and Radix would focus that, not the search
 * box. `useCommandUi` hands back the module itself, synchronously once it has
 * loaded, so a warmed picker opens exactly as before. The trigger warms it on
 * hover or focus (`preloadCommandUi`); a tap with nothing warmed waits for it.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

export type CommandUi = typeof import("@/components/ui/command");

let loaded: CommandUi | null = null;
let loading: Promise<CommandUi> | null = null;
const listeners = new Set<() => void>();

/** Fetch the primitives ahead of an opening. A failed fetch is forgotten, so the next opening asks again. */
export function preloadCommandUi(): Promise<CommandUi> {
  loading ??= import("@/components/ui/command").then(
    (m) => {
      loaded = m;
      for (const l of listeners) l();
      return m;
    },
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

/** `preloadCommandUi` for an event handler: nothing to wait for, nothing to report. */
export function warmCommandUi(): void {
  preloadCommandUi().catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => loaded;

/** The primitives, or null while they load (asked for on mount). */
export function useCommandUi(): CommandUi | null {
  const ui = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!ui) warmCommandUi();
  }, [ui]);
  return ui;
}

/** Draws `children` with the primitives once they're here, `fallback` until then. */
export function WithCommandUi({ fallback, children }: { fallback: ReactNode; children: (ui: CommandUi) => ReactNode }) {
  const ui = useCommandUi();
  return <>{ui ? children(ui) : fallback}</>;
}
