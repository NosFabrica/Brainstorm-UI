/**
 * Which DmEngine is running, and who to tell when that changes — and nothing
 * else, so the screens that only ask "is there an engine, and what does it
 * say" (the header badge, the tab title, notifications, mounted for every
 * visitor) don't pull the engine itself into the first download. The engine
 * and everything it needs load once an Account is active (services/dm/boot).
 */
import type { DmEngine } from "./engine";

let current: DmEngine | null = null;
const listeners = new Set<() => void>();

/** The engine for the Active Account, or null when signed out (or not loaded yet). */
export function dmEngine(): DmEngine | null {
  return current;
}

export function subscribeDmEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For services/dm, which starts and stops engines. */
export function setDmEngine(engine: DmEngine | null): void {
  current = engine;
  for (const l of [...listeners]) l();
}
