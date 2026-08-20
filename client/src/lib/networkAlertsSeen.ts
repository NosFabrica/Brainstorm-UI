/**
 * Local "seen" store for Network Alerts. The `/networkAlerts` endpoint only
 * returns a CURRENT snapshot (no change feed), so to make the module feel like a
 * live alert inbox we remember which flagged pubkeys the observer has already
 * seen and diff against them on the next visit — surfacing what's NEW client-side.
 *
 * First-ever visit establishes a silent baseline (nothing is "new" when there's
 * no prior visit to compare against).
 */
import { accountKey } from "@/lib/accountStorage";

interface SeenAlerts {
  pubkeys: string[];
  updated_at: number;
}

const storageKey = (observer: string) => accountKey("brainstorm_network_alerts_seen", observer);

function load(observer: string): SeenAlerts | null {
  if (!observer) return null;
  try {
    const raw = localStorage.getItem(storageKey(observer));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeenAlerts;
    if (!Array.isArray(parsed?.pubkeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Whether the observer has ever had a snapshot recorded (false = first visit). */
export function hasSeenBaseline(observer: string): boolean {
  return load(observer) !== null;
}

/** Set of flagged pubkeys already seen (empty on first visit). */
export function seenAlertSet(observer: string): Set<string> {
  return new Set(load(observer)?.pubkeys ?? []);
}

/** Timestamp (ms) of the last "mark seen", or null if never. */
export function lastSeenAt(observer: string): number | null {
  return load(observer)?.updated_at ?? null;
}

/** Persist the current flagged pubkeys as the new "seen" baseline. */
export function markAlertsSeen(observer: string, flaggedPubkeys: string[]): void {
  if (!observer) return;
  try {
    const payload: SeenAlerts = {
      pubkeys: Array.from(new Set(flaggedPubkeys)),
      updated_at: Date.now(),
    };
    localStorage.setItem(storageKey(observer), JSON.stringify(payload));
  } catch {
    // ignore (private mode / SSR)
  }
}

/**
 * Given the observer's current flagged pubkeys, return which are NEW since the
 * last visit. On the first-ever visit this returns [] and silently records the
 * baseline, so the module never greets a new user with "everything is new".
 */
export function computeNewAlerts(observer: string, currentFlagged: string[]): {
  isFirstVisit: boolean;
  newPubkeys: string[];
} {
  if (!hasSeenBaseline(observer)) {
    markAlertsSeen(observer, currentFlagged);
    return { isFirstVisit: true, newPubkeys: [] };
  }
  const seen = seenAlertSet(observer);
  return { isFirstVisit: false, newPubkeys: currentFlagged.filter((pk) => !seen.has(pk)) };
}
