import { fetchAlertPrefs, publishAlertPrefs } from "@/services/nostr";

/**
 * "Ignored" store for Network Alerts. Ignore is a review decision — the user has
 * looked at a flagged account and isn't concerned — so we hide it from the alert
 * list WITHOUT taking any Nostr action against them (unlike mute/unfollow/report:
 * nothing is published about them, and they're never notified).
 *
 * Two layers:
 *  - localStorage, per-observer → instant reads/writes, works signed-out-of-relays.
 *  - NIP-78 (kind 30078, d=brainstorm.world/alert-prefs), NIP-44 encrypted to
 *    self → the list follows the user across devices. Encrypted because which
 *    flagged accounts you dismissed is private moderation state.
 *
 * localStorage is the source of truth for rendering; the remote copy is merged in
 * on load (union, so a dismissal made on another device is never resurrected) and
 * published best-effort on write. A failed publish never blocks the UI.
 */

interface IgnoredAlerts {
  pubkeys: string[];
  updated_at: number;
}

const storageKey = (observer: string) => `brainstorm_network_alerts_ignored:${observer}`;

function load(observer: string): IgnoredAlerts | null {
  if (!observer) return null;
  try {
    const raw = localStorage.getItem(storageKey(observer));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IgnoredAlerts;
    if (!Array.isArray(parsed?.pubkeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(observer: string, pubkeys: string[]): Set<string> {
  const unique = Array.from(new Set(pubkeys));
  if (observer) {
    try {
      localStorage.setItem(storageKey(observer), JSON.stringify({ pubkeys: unique, updated_at: Date.now() } satisfies IgnoredAlerts));
    } catch {
      // ignore (private mode / SSR)
    }
  }
  return new Set(unique);
}

/** Mirror the current list to the user's encrypted NIP-78 prefs. Best-effort:
 *  relays being slow or a signer being unavailable must never block the UI. */
function syncUp(pubkeys: string[]): void {
  void publishAlertPrefs({ ignored: Array.from(new Set(pubkeys)) }).catch(() => {});
}

/** Set of flagged pubkeys the observer has ignored (local copy). */
export function ignoredAlertSet(observer: string): Set<string> {
  return new Set(load(observer)?.pubkeys ?? []);
}

/**
 * Merge the account's published (encrypted) ignore list into the local one and
 * return the union. Call once on mount; safe to call when signed out (no-op).
 */
export async function hydrateIgnoredFromNostr(observer: string): Promise<Set<string>> {
  const local = load(observer)?.pubkeys ?? [];
  if (!observer) return new Set(local);
  const prefs = await fetchAlertPrefs();
  const remote = Array.isArray((prefs as any)?.ignored) ? ((prefs as any).ignored as unknown[]) : [];
  const remoteKeys = remote.filter((x): x is string => typeof x === "string");
  if (remoteKeys.length === 0) return new Set(local);
  const union = [...local, ...remoteKeys];
  // Only rewrite (and re-publish) when the remote actually added something.
  if (union.length === new Set(local).size) return new Set(local);
  const merged = persist(observer, union);
  syncUp(Array.from(merged));
  return merged;
}

/** Ignore a flagged account; returns the new ignored set. */
export function ignoreAlert(observer: string, pubkey: string): Set<string> {
  const next = persist(observer, [...(load(observer)?.pubkeys ?? []), pubkey]);
  syncUp(Array.from(next));
  return next;
}

/** Ignore several at once (bulk "ignore all in extended reach"). */
export function ignoreAlerts(observer: string, pubkeys: string[]): Set<string> {
  const next = persist(observer, [...(load(observer)?.pubkeys ?? []), ...pubkeys]);
  syncUp(Array.from(next));
  return next;
}

/** Un-ignore (restore) a previously ignored account; returns the new ignored set. */
export function unignoreAlert(observer: string, pubkey: string): Set<string> {
  const next = persist(observer, (load(observer)?.pubkeys ?? []).filter((pk) => pk !== pubkey));
  syncUp(Array.from(next));
  return next;
}

/** Restore a batch (Undo for a bulk ignore). */
export function unignoreAlerts(observer: string, pubkeys: string[]): Set<string> {
  const drop = new Set(pubkeys);
  const next = persist(observer, (load(observer)?.pubkeys ?? []).filter((pk) => !drop.has(pk)));
  syncUp(Array.from(next));
  return next;
}
