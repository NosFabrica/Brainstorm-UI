/**
 * "Read that again": for a store read whose events change where the store
 * can't see it — a copy the user's Assistant published from the server, say.
 *
 * A react-query read was asked again by invalidating its key. A store read
 * (hooks/useStoreEvents) asks once per key per window (lib/askOnce), so a
 * read that must be asked again puts its scope's generation in its key:
 * `readAgain(scope)` moves the generation on, every mounted read under the
 * scope re-renders with a new key and asks, and the promise settles once
 * those asks have (as `await invalidateQueries` waited for the refetch).
 * Rows already on screen stay there meanwhile: they are in the store.
 */
import { useSyncExternalStore } from "react";

const generations = new Map<string, number>();
const listeners = new Set<() => void>();
/** The asks made under each scope's current generation, still out. */
const asking = new Map<string, Set<Promise<unknown>>>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The scope's generation: part of the key of every read under it. */
export function readGeneration(scope: string): number {
  return generations.get(scope) ?? 0;
}

/** `readGeneration`, re-rendering when it moves on. */
export function useReadGeneration(scope: string): number {
  return useSyncExternalStore(
    subscribe,
    () => readGeneration(scope),
    () => readGeneration(scope),
  );
}

/** Note an ask made under `scope`, so a `readAgain` waits for it. Hands the ask back. */
export function askedUnder<T>(scope: string, ask: Promise<T>): Promise<T> {
  let out = asking.get(scope);
  if (!out) asking.set(scope, (out = new Set()));
  const held = out;
  held.add(ask);
  const done = () => {
    held.delete(ask);
  };
  ask.then(done, done);
  return ask;
}

/**
 * Ask every read under `scope` again. Settles once the asks the new
 * generation started have, or at once when nothing under it is mounted.
 */
export async function readAgain(scope: string): Promise<void> {
  generations.set(scope, readGeneration(scope) + 1);
  listeners.forEach((listener) => listener());
  // The reads re-render and ask in their effects; a macrotask lets them.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.allSettled([...(asking.get(scope) ?? [])]);
}

/** The scope every read that resolves a concept is under: the Dictionary, item pages, admin's summary. */
export const DICTIONARY_READS = "dictionary";

/** Test seam. */
export function __resetReadGenerations(): void {
  generations.clear();
  asking.clear();
}
