import { ALERT_PREFS_D_TAG, fetchPrivateAppData, publishAlertPrefs, type PrivateAppData } from "@/services/nostr";
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
 *
 * The NIP-78 copy is one replaceable event, overwritten whole, so every write
 * reads it first and merges (lib/dm/prefsSync does the same for chats):
 *
 *  - nothing is published until the account's copy has been read or the relays
 *    prove there is none (`fetchPrivateAppData`). "Couldn't read it" used to
 *    look like "there is none", and one ignore on a new device replaced the
 *    whole list with that one entry;
 *  - each decision carries its time, and an un-ignore is kept as a removal
 *    (`removed`), so a merge brings back neither an entry removed elsewhere nor
 *    one this device removed. The newest decision about an account wins.
 */

interface IgnoredEntry {
  pubkey: string;
  /**
   * Verified reports when ignored — the escalation baseline. `null` for entries
   * migrated from the older format, which stored no baseline; those stay
   * ignored indefinitely rather than being resurfaced on a guess.
   */
  atReports: number | null;
  /** When it was ignored (ms); 0 for entries written before decisions carried a time. */
  at: number;
}

/** An un-ignore, kept so a merge with a copy that still has the entry doesn't bring it back. */
interface Removal {
  pubkey: string;
  at: number;
}

interface IgnoredState {
  entries: IgnoredEntry[];
  removed: Removal[];
}

interface IgnoredAlerts extends IgnoredState {
  updated_at: number;
}

/** A removal older than this is dropped: every device has long since merged it. */
const REMOVAL_KEPT_MS = 365 * 24 * 60 * 60 * 1000;

const storageKey = (observer: string) => accountKey("brainstorm_network_alerts_ignored", observer);

/** Re-surface once reports double, or grow by 5 — whichever is the higher bar. */
export function hasEscalated(atReports: number | null, currentReports: number): boolean {
  if (atReports == null) return false;
  return currentReports >= Math.max(atReports * 2, atReports + 5);
}

type RawEntry = { pubkey?: unknown; atReports?: unknown; at?: unknown } | null;

const timeOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function normalize(raw: { entries?: unknown; pubkeys?: unknown; removed?: unknown } | null | undefined): IgnoredState {
  let entries: IgnoredEntry[] = [];
  if (Array.isArray(raw?.entries)) {
    entries = raw.entries
      .filter((e: RawEntry): e is { pubkey: string; atReports?: unknown } => !!e && typeof e.pubkey === "string")
      .map((e: { pubkey: string; atReports?: unknown; at?: unknown }) => ({
        pubkey: e.pubkey,
        atReports: typeof e.atReports === "number" ? e.atReports : null,
        at: timeOf(e.at),
      }));
  } else if (Array.isArray(raw?.pubkeys)) {
    // Legacy shape: { pubkeys: string[] } with no baseline recorded.
    entries = raw.pubkeys
      .filter((p: unknown): p is string => typeof p === "string")
      .map((pubkey: string) => ({ pubkey, atReports: null, at: 0 }));
  }
  const removed = Array.isArray(raw?.removed)
    ? raw.removed
        .filter((r: RawEntry): r is { pubkey: string; at?: unknown } => !!r && typeof r.pubkey === "string")
        .map((r: { pubkey: string; at?: unknown }) => ({ pubkey: r.pubkey, at: timeOf(r.at) }))
    : [];
  return { entries, removed };
}

function loadState(observer: string): IgnoredState {
  if (!observer) return { entries: [], removed: [] };
  try {
    const raw = localStorage.getItem(storageKey(observer));
    if (!raw) return { entries: [], removed: [] };
    return normalize(JSON.parse(raw));
  } catch {
    return { entries: [], removed: [] };
  }
}

const load = (observer: string): IgnoredEntry[] => loadState(observer).entries;

/**
 * Two copies of the list as one: per account, the newest decision — an ignore
 * or an un-ignore — wins; on a tie the ignore stays. Old removals are dropped.
 */
export function mergeIgnored(a: IgnoredState, b: IgnoredState, now = Date.now()): IgnoredState {
  const entries = new Map<string, IgnoredEntry>();
  for (const e of [...a.entries, ...b.entries]) {
    const cur = entries.get(e.pubkey);
    if (!cur || e.at > cur.at) entries.set(e.pubkey, e);
  }
  const removed = new Map<string, Removal>();
  for (const r of [...a.removed, ...b.removed]) {
    const cur = removed.get(r.pubkey);
    if (!cur || r.at > cur.at) removed.set(r.pubkey, r);
  }
  for (const [pk, r] of removed) {
    const e = entries.get(pk);
    if (e && e.at >= r.at) removed.delete(pk);
    else if (e) entries.delete(pk);
    else if (now - r.at > REMOVAL_KEPT_MS) removed.delete(pk);
  }
  const byKey = (x: { pubkey: string }, y: { pubkey: string }) => (x.pubkey < y.pubkey ? -1 : 1);
  return { entries: [...entries.values()].sort(byKey), removed: [...removed.values()].sort(byKey) };
}

const sameState = (a: IgnoredState, b: IgnoredState) => {
  const byKey = (x: { pubkey: string }, y: { pubkey: string }) => (x.pubkey < y.pubkey ? -1 : 1);
  const key = (s: IgnoredState) =>
    JSON.stringify([
      [...s.entries].sort(byKey).map((e) => [e.pubkey, e.atReports, e.at]),
      [...s.removed].sort(byKey).map((r) => [r.pubkey, r.at]),
    ]);
  return key(a) === key(b);
};

function writeLocal(observer: string, state: IgnoredState): void {
  if (!observer) return;
  try {
    localStorage.setItem(
      storageKey(observer),
      JSON.stringify({ ...state, updated_at: Date.now() } satisfies IgnoredAlerts),
    );
  } catch {
    // ignore (private mode / SSR)
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
  return () => {
    syncListeners.delete(fn);
  };
}

function setSyncState(next: IgnoreSyncState) {
  if (next === syncState) return;
  syncState = next;
  for (const fn of syncListeners) {
    try {
      fn(next);
    } catch {
      /* a listener must not break the others */
    }
  }
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
  try {
    return !!observer && localStorage.getItem(dirtyKey(observer)) === "1";
  } catch {
    return false;
  }
};
const setDirty = (observer: string, on: boolean) => {
  try {
    if (!observer) return;
    if (on) localStorage.setItem(dirtyKey(observer), "1");
    else localStorage.removeItem(dirtyKey(observer));
  } catch {
    /* private mode */
  }
};

let inFlight: Promise<IgnoreSyncState> = Promise.resolve("ok");
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** One sync at a time, so an older copy is never signed after a newer one. */
let queue: Promise<unknown> = Promise.resolve();
/** Reads that couldn't tell what's there, in a row: a few are retried on a timer, then the next change or open is. */
let unreadInARow = 0;
const MAX_UNREAD_RETRIES = 3;
/** The account's copy as last read, so an unchanged one isn't decrypted again. */
const seen = new Map<string, { id: string; state: IgnoredState; createdAt: number }>();

/** The account's copy as the relays have it now — or that there is none, or that nobody could tell. */
async function readRemote(
  observer: string,
): Promise<{ state: IgnoredState; createdAt: number } | "absent" | "unknown"> {
  const got: PrivateAppData = await fetchPrivateAppData(ALERT_PREFS_D_TAG, { knownId: seen.get(observer)?.id }).catch(
    (): PrivateAppData => ({ status: "unknown" }),
  );
  if (got.status === "found") {
    const state = normalize(got.data as never);
    seen.set(observer, { id: got.id, state, createdAt: got.createdAt });
    return { state, createdAt: got.createdAt };
  }
  if (got.status === "unchanged") {
    const known = seen.get(observer);
    return known ? { state: known.state, createdAt: known.createdAt } : "unknown";
  }
  return got.status;
}

/**
 * Bring the account's copy and this device's together, and publish the result
 * if it says something the account's copy doesn't. Never publishes over a copy
 * it couldn't read: that is how one ignore used to replace the whole list.
 *
 * `push` is a flush of this device's changes: with no copy anywhere, this one is
 * the first. Without it (a page load), a device with nothing new to say stays quiet.
 */
async function syncNow(observer: string, { background, push }: { background: boolean; push: boolean }) {
  const remote = await readRemote(observer);
  if (remote === "unknown") {
    if (!push && !isDirty(observer)) return syncState;
    // Couldn't tell what's there: publishing blind could undo another device's edit.
    setDirty(observer, true);
    setSyncState("retrying");
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (++unreadInARow <= MAX_UNREAD_RETRIES) {
      retryTimer = setTimeout(() => void flushIgnoredToNostr(observer, { background: true }), 15_000);
    }
    return "retrying" as const;
  }
  unreadInARow = 0;
  const local = loadState(observer);
  const merged = remote === "absent" ? mergeIgnored(local, local) : mergeIgnored(local, remote.state);
  if (!sameState(merged, local)) writeLocal(observer, merged);
  const ahead = remote === "absent" ? push || isDirty(observer) : !sameState(merged, remote.state);
  if (!ahead) {
    setDirty(observer, false);
    setSyncState("ok");
    return "ok" as const;
  }
  const createdAt = Math.max(Math.floor(Date.now() / 1000), (remote === "absent" ? 0 : remote.createdAt) + 1);
  return publishMerged(observer, merged, { background, createdAt });
}

/**
 * Sync this device's list with the account's: read the account's copy, merge,
 * and publish the merge. Re-reads the stored list rather than taking a
 * caller's snapshot, so a retry always ships the newest state.
 */
export function flushIgnoredToNostr(
  observer: string,
  { background = false }: { background?: boolean } = {},
): Promise<IgnoreSyncState> {
  const run = queue.then(() => syncNow(observer, { background, push: true }));
  queue = run.catch(() => undefined);
  inFlight = run.catch(() => syncState);
  return inFlight;
}

async function publishMerged(
  observer: string,
  merged: IgnoredState,
  { background, createdAt }: { background: boolean; createdAt: number },
): Promise<IgnoreSyncState> {
  const res = await publishAlertPrefs({ ...merged, updated_at: Date.now() }, ALERT_PREFS_D_TAG, {
    background,
    createdAt,
  }).catch((): PublishOutcome => ({ success: false, error: "All relays failed" }));
  if (res.success) {
    // Only what was sent is confirmed: a change made while it was out stays dirty.
    if (sameState(loadState(observer), merged)) setDirty(observer, false);
    setSyncState("ok");
    return "ok" as const;
  }
  if (res.error === "Not logged in") return syncState; // nothing to sync to
  // Waiting on the user, not on the network — the Account is Locked and nobody
  // asked (`deferred`), they were asked and said no (`cancelled`, or `declined`
  // in their signer's own prompt, or it is on another profile), or their
  // remote signer has gone quiet and needs opening or re-pairing
  // (`signerUnreachable`, which on a timer would be an endless loop of NIP-46
  // requests each waiting out a 30s deadline). A timer against either is a modal on a fifteen-second loop,
  // which is what this used to do: a cancel carries no `error`, so it fell
  // through to the transient branch and re-armed. The next mutation or app open
  // is the retry, and that one the user will have initiated.
  if (res.deferred || res.cancelled || res.declined || res.signerUnreachable) {
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
  retryTimer = setTimeout(() => {
    void flushIgnoredToNostr(observer, { background });
  }, 15_000);
  return "retrying" as const;
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

/**
 * `background` is about who asked. The user-facing callers below are all
 * deliberate acts and may prompt a Locked Account for its Recovery password; the
 * two reached from `NetworkAlertsModule`'s mount effects asked for nothing and
 * must not.
 */
function persist(
  observer: string,
  state: IgnoredState,
  { background = false }: { background?: boolean } = {},
): Map<string, number | null> {
  const next = mergeIgnored(state, state);
  writeLocal(observer, next);
  setDirty(observer, true);
  unreadInARow = 0;
  void flushIgnoredToNostr(observer, { background });
  return new Map(next.entries.map((e) => [e.pubkey, e.atReports]));
}

/** This device's list with `pubkeys` ignored (at these baselines) now. */
function withIgnored(observer: string, items: { pubkey: string; atReports: number }[]): IgnoredState {
  const cur = loadState(observer);
  const now = Date.now();
  const named = new Set(items.map((i) => i.pubkey));
  return {
    entries: [
      ...cur.entries.filter((e) => !named.has(e.pubkey)),
      ...items.map((i) => ({ pubkey: i.pubkey, atReports: i.atReports, at: now })),
    ],
    removed: cur.removed.filter((r) => !named.has(r.pubkey)),
  };
}

/** This device's list with `pubkeys` un-ignored now, the removals kept. */
function withoutIgnored(observer: string, pubkeys: string[]): IgnoredState {
  const cur = loadState(observer);
  const now = Date.now();
  const named = new Set(pubkeys);
  return {
    entries: cur.entries.filter((e) => !named.has(e.pubkey)),
    removed: [...cur.removed.filter((r) => !named.has(r.pubkey)), ...pubkeys.map((pubkey) => ({ pubkey, at: now }))],
  };
}

/** Map of ignored pubkey → the report count when it was ignored (or null). */
export function ignoredAlertMap(observer: string): Map<string, number | null> {
  return new Map(load(observer).map((e) => [e.pubkey, e.atReports]));
}

/** Ignore an account, recording its current report count as the escalation baseline. */
export function ignoreAlert(observer: string, pubkey: string, atReports: number): Map<string, number | null> {
  return persist(observer, withIgnored(observer, [{ pubkey, atReports }]));
}

export function unignoreAlert(observer: string, pubkey: string): Map<string, number | null> {
  return persist(observer, withoutIgnored(observer, [pubkey]));
}

/**
 * Ignore many accounts in one shot — a single persist + single NIP-78 publish,
 * not one per account. Used by the "Ignore all" bulk action; persist() de-dupes
 * by pubkey so re-ignoring an already-ignored account just refreshes its
 * escalation baseline.
 */
export function ignoreMany(
  observer: string,
  items: { pubkey: string; atReports: number }[],
): Map<string, number | null> {
  return persist(observer, withIgnored(observer, items));
}

/** Un-ignore many accounts in one shot (the Undo for ignoreMany). */
export function unignoreMany(observer: string, pubkeys: string[]): Map<string, number | null> {
  return persist(observer, withoutIgnored(observer, pubkeys));
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
  const state = loadState(observer);
  const list = state.entries;
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
  return changed ? persist(observer, { ...state, entries: next }, { background: true }) : null;
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
    try {
      localStorage.setItem(actedKey(observer), JSON.stringify(Array.from(next)));
    } catch {}
  }
  return next;
}

/** Undo `markActed` — the action was taken back, so the alert may show again. */
export function unmarkActed(observer: string, pubkey: string): Set<string> {
  const next = actedAlertSet(observer);
  next.delete(pubkey);
  if (observer) {
    try {
      localStorage.setItem(actedKey(observer), JSON.stringify(Array.from(next)));
    } catch {}
  }
  return next;
}

/**
 * Merge the account's published ignore list into the local one, and send this
 * device's decisions up if the account's copy lacks them. A copy that couldn't
 * be read leaves the local list as it is, and publishes nothing.
 */
export async function hydrateIgnoredFromNostr(observer: string): Promise<Map<string, number | null>> {
  const toMap = () => new Map(load(observer).map((e) => [e.pubkey, e.atReports]));
  if (!observer) return toMap();
  // In background: this rides along with a page load, so a Locked Account waits
  // for a later one rather than being shown a password prompt it never asked for.
  // A change still only on this device (the relays were unreachable) goes up here too.
  const run = queue.then(() => syncNow(observer, { background: true, push: false }));
  queue = run.catch(() => undefined);
  inFlight = run.catch(() => syncState);
  await inFlight;
  return toMap();
}
