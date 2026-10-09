/**
 * Facts we stamp onto individual history entries, so they survive a remount,
 * a reload, and the forward/back buttons — none of which a component ref or a
 * module variable survives.
 *
 * `window.history.length` cannot answer either question: it counts the whole
 * tab, including whatever the user visited before arriving here.
 */

const DEPTH_KEY = "bsDepth";
const HOPPED_KEY = "bsHopped";

/** Depth of the entry we are currently on; seeds the next entry we create. */
let currentDepth: number | null = null;
/** `history.length` when we last looked: a new entry that didn't grow it replaced the last. */
let lengthSeen = 0;

function readState(): Record<string, unknown> {
  try {
    return (window.history.state as Record<string, unknown> | null) ?? {};
  } catch {
    return {};
  }
}

function patchState(patch: Record<string, unknown>): void {
  try {
    window.history.replaceState({ ...readState(), ...patch }, "", window.location.href);
  } catch {
    /* ignore */
  }
}

/**
 * Stamp the current entry with how many in-app navigations sit behind it. Call
 * on every location change; entries we've already stamped (i.e. we got here by
 * going back) keep their number.
 */
export function trackHistoryEntry(): void {
  if (typeof window === "undefined") return;
  const stamped = readState()[DEPTH_KEY];
  const length = window.history.length;
  const grew = length > lengthSeen;
  lengthSeen = length;
  if (typeof stamped === "number") {
    currentDepth = stamped;
    return;
  }
  // The first entry of the load is depth 0 — nothing of ours sits behind it. A
  // replace (a redirect) wipes the stamp but adds no entry: it stays as deep as
  // the one it replaced. (A push after going back doesn't grow the list either,
  // and is under-counted by one — the safe way round: Back falls back to its
  // fallback instead of leaving the app.)
  currentDepth = currentDepth === null ? 0 : grew ? currentDepth + 1 : currentDepth;
  patchState({ [DEPTH_KEY]: currentDepth });
}

/** In-app navigations behind the current entry. 0 means Back leaves the app. */
export function historyDepth(): number {
  if (typeof window === "undefined") return 0;
  const stamped = readState()[DEPTH_KEY];
  return typeof stamped === "number" ? stamped : (currentDepth ?? 0);
}

/**
 * Mark the current entry as one we automatically navigated away from, so
 * returning to it does not fire the same hop again and bounce the user
 * straight forward. See `Landing`'s direct-identifier searches.
 */
export function markHopped(): void {
  if (typeof window === "undefined") return;
  patchState({ [HOPPED_KEY]: true });
}

/** True when the user reached this entry by going back to a hop's origin. */
export function hasHopped(): boolean {
  if (typeof window === "undefined") return false;
  return readState()[HOPPED_KEY] === true;
}
