import { useSyncExternalStore } from "react";

const mql = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

function subscribe(onChange: () => void) {
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

/**
 * True when the OS "reduce motion" setting is on.
 *
 * Read synchronously on the first render — anything gated on this must not
 * animate a frame before finding out — and live, so toggling the setting takes
 * effect without a reload. Deliberately not framer-motion's `useReducedMotion`:
 * that one snapshots at mount and never updates.
 *
 * Only for things CSS can't reach — timers, video autoplay, conditional render.
 * A decorative transition or animation should use Tailwind's `motion-reduce:`
 * variant instead of re-rendering React to change a class.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql?.matches ?? false,
    () => false,
  );
}
