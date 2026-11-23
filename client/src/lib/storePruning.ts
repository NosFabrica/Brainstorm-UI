/**
 * Keeps the event store from growing for the life of the tab.
 *
 * Nothing ever left it: an installed app open for days held every note,
 * reaction and assertion any screen had shown. Past `PRUNE_ABOVE` events, once
 * the browser is idle, the least recently used are dropped until `PRUNE_TO`
 * remain — never one the app reads without showing it, and without taking a
 * row off a screen that shows it:
 *
 * - **Silently.** Removed from the store's memory without a `remove$`, as the
 *   library's own `prune` does: a mounted list holds its rows in its model and
 *   keeps them. Removing through the store would announce each one, and every
 *   timeline matching it would drop the row — claims don't prevent that, since
 *   a timeline lets go of its first page's claims as soon as it has read them
 *   (`TimelineModel` claims the initial read, which completes).
 * - **Claimed** events stay: an event a live subscription received and still
 *   holds claimed.
 * - **Replaceable** kinds stay (0, 3, 10000–19999): profiles, follow and mute
 *   lists, relay lists (10002, 10050), the trust declaration (10040) — the
 *   cached and routing kinds, read synchronously by routing, publishing and
 *   every name on screen. One per author each, so they are bounded anyway.
 * - **The reader's own** events stay, whatever their kind: their app data, their
 *   lists, what they just published.
 *
 * What goes is asked for again when next wanted: the asks' windows are
 * forgotten with it (lib/askOnce `forgetSettled`), so a screen mounted later
 * asks the relays instead of finding a window that says "asked" and a store
 * that no longer has the answer.
 *
 * `EventMemory.prune` is not used directly because it knows nothing of kinds
 * or owners. This walks the same least-recently-used order
 * (`eventStore.unclaimed()`) and removes the same way.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "./eventStore";
import { forgetSettled } from "./askOnce";
import { whenIdle } from "./idle";

/** Past this many events, the store is pruned. */
export const PRUNE_ABOVE = 20_000;
/** …down to this many, so it isn't pruned again a few events later. */
export const PRUNE_TO = 15_000;
/** How often the size is looked at. Cheap: a counter. */
const CHECK_EVERY_MS = 60_000;

const isReplaceableKind = (kind: number) => kind === 0 || kind === 3 || (kind >= 10_000 && kind < 20_000);

/**
 * Drop unclaimed events, oldest-used first, down to `target`. Returns how many
 * went. `own` is the reader's own pubkeys, whose events are never dropped.
 */
export function pruneStore(own: ReadonlySet<string>, target = PRUNE_TO): number {
  const over = eventStore.memory.size - target;
  if (over <= 0) return 0;
  // Collected first, removed after: removing while the LRU is walked would
  // move the cursor under the walk.
  const doomed: NostrEvent[] = [];
  for (const event of eventStore.unclaimed()) {
    if (doomed.length >= over) break;
    if (isReplaceableKind(event.kind) || own.has(event.pubkey)) continue;
    doomed.push(event);
  }
  // (An expiring one may still fire later: the store's removal then finds nothing.)
  for (const event of doomed) eventStore.memory.remove(event);
  if (doomed.length) forgetSettled();
  return doomed.length;
}

/**
 * Look at the store's size every minute and prune it when idle. `own` is read
 * at each prune, so an account added later is protected too. Returns a stop.
 */
export function startStorePruning(own: () => Iterable<string>): () => void {
  let cancelIdle: (() => void) | null = null;
  const check = () => {
    if (cancelIdle || eventStore.memory.size <= PRUNE_ABOVE) return;
    cancelIdle = whenIdle(
      () => {
        cancelIdle = null;
        pruneStore(new Set(own()));
      },
      { timeoutMs: 10_000 },
    );
  };
  const timer = setInterval(check, CHECK_EVERY_MS);
  return () => {
    clearInterval(timer);
    cancelIdle?.();
    cancelIdle = null;
  };
}
