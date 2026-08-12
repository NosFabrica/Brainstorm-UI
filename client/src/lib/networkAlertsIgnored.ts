import { fetchAlertPrefs, publishAlertPrefs } from "@/services/nostr";
import type { PublishOutcome } from "@/accounts/signing";
import { accountKey } from "@/lib/accountStorage";

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

const storageKey = (observer: string) => accountKey("brainstorm_network_alerts_ignored", observer);

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

// ---------------------------------------------------------------------------
// Sync state.
//
// The NIP-78 copy is what makes this list follow you between devices, and it
// used to be published fire-and-forget with the result discarded. When it
// failed, this device still showed its local copy and looked completely normal —
// the user only found out when ignored accounts reappeared somewhere else.
//
// The failures are not equivalent, so they aren't treated as such:
//   • transient (relays refused) — retrying fixes it, so retry and say nothing.
//   • persistent (no signer, can't encrypt) — retrying can't fix it; the UI says
//     so once, and the list surfaces standing "on this device only" wording.
//   • not logged in — there's no account to sync to and nobody to tell.
// ---------------------------------------------------------------------------
export type IgnoreSyncState = "ok" | "retrying" | "local-only";

let syncState: IgnoreSyncState = "ok";
const syncListeners = new Set<(s: IgnoreSyncState) => void>();

export function getIgnoreSyncState(): IgnoreSyncState {
  return syncState;
}

export function onIgnoreSyncChange(fn: (s: IgnoreSyncState) => void): () => void {
  syncListeners.add(fn);
  return () => { syncListeners.delete(fn); };
}

function setSyncState(next: IgnoreSyncState) {
  if (next === syncState) return;
  syncState = next;
  for (const fn of syncListeners) { try { fn(next); } catch { /* a listener must not break the others */ } }
}

/**
 * Errors another attempt cannot fix — worth telling the user about.
 *
 * `publishAlertPrefs` can no longer return "No signer available"; a Signer that
 * isn't there now comes back as `deferred`, handled on its own branch below.
 */
function isPermanentFailure(error?: string): boolean {
  return error === "Could not encrypt";
}

const dirtyKey = (observer: string) => accountKey("brainstorm_alert_prefs_dirty", observer);
const isDirty = (observer: string) => {
  try { return !!observer && localStorage.getItem(dirtyKey(observer)) === "1"; } catch { return false; }
};
const setDirty = (observer: string, on: boolean) => {
  try {
    if (!observer) return;
    if (on) localStorage.setItem(dirtyKey(observer), "1");
    else localStorage.removeItem(dirtyKey(observer));
  } catch { /* private mode */ }
};

let inFlight: Promise<IgnoreSyncState> = Promise.resolve("ok");
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Publish the CURRENT stored list — deliberately re-read rather than taking a
 * caller's snapshot. kind-30078 is replaceable, so a retry is idempotent and
 * always ships the newest state instead of resurrecting whatever was pending
 * when the failure happened.
 */
export function flushIgnoredToNostr(
  observer: string,
  { background = false }: { background?: boolean } = {},
): Promise<IgnoreSyncState> {
  inFlight = (async () => {
    const res = await publishAlertPrefs({ entries: load(observer) }, undefined, {
      background,
    }).catch((): PublishOutcome => ({ success: false, error: "All relays failed" }));
    if (res.success) {
      setDirty(observer, false);
      setSyncState("ok");
      return "ok" as const;
    }
    if (res.error === "Not logged in") return syncState; // nothing to sync to
    // Waiting on the user, not on the network — either the Account is Locked and
    // nobody asked for this (`deferred`), or they were asked and said no
    // (`cancelled`). A timer against either is a modal on a fifteen-second loop,
    // which is what this used to do: a cancel carries no `error`, so it fell
    // through to the transient branch and re-armed. The next mutation or app open
    // is the retry, and that one the user will have initiated.
    if (res.deferred || res.cancelled) {
      setDirty(observer, true);
      setSyncState("retrying");
      // And disarm anything an earlier transient failure left armed: that timer
      // would fire fifteen seconds later and put the prompt back in front of
      // someone who has just declined it.
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return "retrying" as const;
    }
    if (isPermanentFailure(res.error)) {
      setDirty(observer, true);
      setSyncState("local-only");
      return "local-only" as const;
    }
    // Transient: keep it quiet, mark it dirty, and try again shortly. The next
    // mutation or app open retries too, so a missed timer isn't fatal.
    setDirty(observer, true);
    setSyncState("retrying");
    if (retryTimer) clearTimeout(retryTimer);
    // Carries the mode: a background flush that hit a relay blip must not come
    // back fifteen seconds later as a password prompt.
    retryTimer = setTimeout(() => { void flushIgnoredToNostr(observer, { background }); }, 15_000);
    return "retrying" as const;
  })();
  return inFlight;
}

/** Resolves when the publish kicked off by the last mutation has settled. */
export function whenIgnoreSyncSettles(): Promise<IgnoreSyncState> {
  return inFlight;
}

/**
 * True when this account has changes that never reached the relays.
 *
 * `syncState` lives in module memory, so it resets to "ok" on every reload —
 * fine for surfaces that hydrate on mount (they re-flush and the truth comes
 * back), wrong for one loaded cold like Settings, which would go back to
 * claiming "saved to your account" on a device where it never was. The dirty
 * flag is persisted precisely so that claim can be checked without a round trip.
 */
export function hasUnsyncedIgnores(observer: string): boolean {
  return isDirty(observer);
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
  void flushIgnoredToNostr(observer);
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

/**
 * Ignore many accounts in one shot — a single persist + single NIP-78 publish,
 * not one per account. Used by the "Ignore all" bulk action; persist() de-dupes
 * by pubkey so re-ignoring an already-ignored account just refreshes its
 * escalation baseline.
 */
export function ignoreMany(observer: string, items: { pubkey: string; atReports: number }[]): Map<string, number | null> {
  return persist(observer, [...load(observer), ...items.map((i) => ({ pubkey: i.pubkey, atReports: i.atReports }))]);
}

/** Un-ignore many accounts in one shot (the Undo for ignoreMany). */
export function unignoreMany(observer: string, pubkeys: string[]): Map<string, number | null> {
  const drop = new Set(pubkeys);
  return persist(observer, load(observer).filter((e) => !drop.has(e.pubkey)));
}

/**
 * Give a baseline to entries that never had one.
 *
 * Entries written by the older storage format carry `atReports: null`, and
 * `hasEscalated` returns false for those — so they stay hidden at ANY report
 * count, forever. That makes the promise we show next to the Ignore button
 * ("they'll show up again if a lot more people report them") false for anyone
 * who ignored an account before the baseline existed. Rather than soften the
 * copy, adopt today's count as their baseline the first time we see them again,
 * which is the same thing ignoring them now would have recorded.
 *
 * Returns the updated map, or null when there was nothing to fix — persist()
 * publishes, so the caller must not write on every render. Entries missing from
 * `current` keep their null and get picked up whenever they next appear.
 */
export function backfillIgnoredBaselines(
  observer: string,
  current: { pubkey: string; verifiedReporterCount: number }[],
): Map<string, number | null> | null {
  if (!observer) return null;
  const list = load(observer);
  if (!list.some((e) => e.atReports == null)) return null;
  const counts = new Map(current.map((e) => [e.pubkey, e.verifiedReporterCount]));
  let changed = false;
  const next = list.map((e) => {
    if (e.atReports != null) return e;
    const at = counts.get(e.pubkey);
    if (typeof at !== "number") return e;
    changed = true;
    return { ...e, atReports: at };
  });
  return changed ? persist(observer, next) : null;
}

// ---------------------------------------------------------------------------
// "Acted-on" store — accounts the user unfollowed / muted / reported. Unlike
// ignore (a reversible local dismiss), these are real actions, so the account
// stays hidden PERMANENTLY and everywhere: persisted per-account and shared by
// the dashboard module and the /alerts page (each mounts its own hook), so a
// report on one surface hides it on the other and survives a reload — instead of
// reappearing until the backend's next recalculation drops it from the feed.
const actedKey = (observer: string) => accountKey("brainstorm_network_alerts_acted", observer);

export function actedAlertSet(observer: string): Set<string> {
  if (!observer) return new Set();
  try {
    const raw = localStorage.getItem(actedKey(observer));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function markActed(observer: string, pubkey: string): Set<string> {
  const next = actedAlertSet(observer);
  next.add(pubkey);
  if (observer) {
    try { localStorage.setItem(actedKey(observer), JSON.stringify(Array.from(next))); } catch {}
  }
  return next;
}

/** Merge the account's published ignore list into the local one. */
export async function hydrateIgnoredFromNostr(observer: string): Promise<Map<string, number | null>> {
  const local = load(observer);
  if (!observer) return new Map(local.map((e) => [e.pubkey, e.atReports]));
  // "Next app open" retry: a change made while the relays were unreachable is
  // still only on this device, and this runs on mount, so it's the natural place
  // to try again. Fire-and-forget — a stale local copy shouldn't delay the read
  // below, and a second failure just re-arms the flag.
  // In background: this rides along with a page load, so a Locked Account waits
  // for a later one rather than being shown a password prompt it never asked for.
  if (isDirty(observer)) void flushIgnoredToNostr(observer, { background: true });
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
