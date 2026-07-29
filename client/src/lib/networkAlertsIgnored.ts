/**
 * Local "ignored" store for Network Alerts. "Ignore" is a client-side dismiss —
 * the user has reviewed a flagged account and isn't concerned, so we hide it from
 * the alert list WITHOUT taking any Nostr action (unlike mute/unfollow/report).
 *
 * Per-observer + per-browser (localStorage), so ignoring on one account/device
 * doesn't leak to another. Ignored accounts drop off the dashboard + /alerts list
 * but are never truly lost — /alerts exposes a "Show ignored" toggle, and Undo is
 * offered right after the action.
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

function save(observer: string, pubkeys: string[]): Set<string> {
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

/** Set of flagged pubkeys the observer has ignored. */
export function ignoredAlertSet(observer: string): Set<string> {
  return new Set(load(observer)?.pubkeys ?? []);
}

/** Ignore a flagged account; returns the new ignored set. */
export function ignoreAlert(observer: string, pubkey: string): Set<string> {
  return save(observer, [...(load(observer)?.pubkeys ?? []), pubkey]);
}

/** Un-ignore (restore) a previously ignored account; returns the new ignored set. */
export function unignoreAlert(observer: string, pubkey: string): Set<string> {
  return save(observer, (load(observer)?.pubkeys ?? []).filter((pk) => pk !== pubkey));
}
