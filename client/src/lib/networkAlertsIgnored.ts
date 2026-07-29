import { fetchAlertPrefs, publishAlertPrefs } from "@/services/nostr";

/**
 * "Ignored" store for Network Alerts.
 *
 * Ignore is a review decision — you looked at a flagged account and weren't
 * concerned — so we hide it WITHOUT taking any Nostr action (nothing published,
 * they're never notified).
 *
 * Crucially it is NOT permanent. We record the verified-report count at the
 * moment you ignored, and re-surface the account only if that count materially
 * worsens. Ignoring someone at 9 reports should not blind you when they reach
 * 60 — that's exactly when you'd want to know. The result is quiet by default,
 * loud only when something actually changed, so the list never becomes homework
 * and never silently hides an escalation.
 *
 * Stored per-observer in localStorage and mirrored to the user's own NIP-78 app
 * data (NIP-44 encrypted to self — which accounts you dismissed is private
 * moderation state) so decisions follow them across devices.
 */

interface IgnoredEntry {
  pubkey: string;
  /**
   * Verified reports when ignored — the escalation baseline. `null` for entries
   * migrated from the older format, which stored no baseline; those stay
   * ignored indefinitely rather than being resurfaced on a guess.
   */
  atReports: number | null;
}

interface IgnoredAlerts {
  entries: IgnoredEntry[];
  updated_at: number;
}

const storageKey = (observer: string) => `brainstorm_network_alerts_ignored:${observer}`;

/** Re-surface once reports double, or grow by 5 — whichever is the higher bar. */
export function hasEscalated(atReports: number | null, currentReports: number): boolean {
  if (atReports == null) return false;
  return currentReports >= Math.max(atReports * 2, atReports + 5);
}

function normalize(raw: any): IgnoredEntry[] {
  if (Array.isArray(raw?.entries)) {
    return raw.entries
      .filter((e: any) => e && typeof e.pubkey === "string")
      .map((e: any) => ({ pubkey: e.pubkey, atReports: typeof e.atReports === "number" ? e.atReports : null }));
  }
  // Legacy shape: { pubkeys: string[] } with no baseline recorded.
  if (Array.isArray(raw?.pubkeys)) {
    return raw.pubkeys.filter((p: any) => typeof p === "string").map((pubkey: string) => ({ pubkey, atReports: null }));
  }
  return [];
}

function load(observer: string): IgnoredEntry[] {
  if (!observer) return [];
  try {
    const raw = localStorage.getItem(storageKey(observer));
    if (!raw) return [];
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(observer: string, entries: IgnoredEntry[]): Map<string, number | null> {
  const byKey = new Map<string, IgnoredEntry>();
  for (const e of entries) byKey.set(e.pubkey, e);
  const next = Array.from(byKey.values());
  if (observer) {
    try {
      localStorage.setItem(storageKey(observer), JSON.stringify({ entries: next, updated_at: Date.now() } satisfies IgnoredAlerts));
    } catch {
      // ignore (private mode / SSR)
    }
  }
  void publishAlertPrefs({ entries: next }).catch(() => {});
  return new Map(next.map((e) => [e.pubkey, e.atReports]));
}

/** Map of ignored pubkey → the report count when it was ignored (or null). */
export function ignoredAlertMap(observer: string): Map<string, number | null> {
  return new Map(load(observer).map((e) => [e.pubkey, e.atReports]));
}

/** Ignore an account, recording its current report count as the escalation baseline. */
export function ignoreAlert(observer: string, pubkey: string, atReports: number): Map<string, number | null> {
  return persist(observer, [...load(observer), { pubkey, atReports }]);
}

export function unignoreAlert(observer: string, pubkey: string): Map<string, number | null> {
  return persist(observer, load(observer).filter((e) => e.pubkey !== pubkey));
}

/** Merge the account's published ignore list into the local one. */
export async function hydrateIgnoredFromNostr(observer: string): Promise<Map<string, number | null>> {
  const local = load(observer);
  if (!observer) return new Map(local.map((e) => [e.pubkey, e.atReports]));
  const prefs = await fetchAlertPrefs();
  const remote = normalize(prefs);
  if (remote.length === 0) return new Map(local.map((e) => [e.pubkey, e.atReports]));
  // Local wins on conflict — it's the copy the user most recently acted on here.
  const merged = new Map<string, IgnoredEntry>();
  for (const e of remote) merged.set(e.pubkey, e);
  for (const e of local) merged.set(e.pubkey, e);
  const list = Array.from(merged.values());
  if (list.length === local.length) return new Map(local.map((e) => [e.pubkey, e.atReports]));
  return persist(observer, list);
}
