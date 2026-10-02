/**
 * Pinned, muted and accepted chats on every device the account signs in on.
 *
 * They ride in one kind-30078 (NIP-78) app-data event, `d` = `DM_PREFS_D_TAG`,
 * whose content is NIP-44 encrypted to the account's own key — the same path as
 * the Network Alerts ignore list. Never in the clear: a room key is the set of
 * people in a chat, so the list says who you talk to. `publishAlertPrefs` only
 * ever signs what `encryptToSelf` returned and publishes nothing when it can't.
 *
 * Amethyst keeps its pinned rooms the same way, inside its own settings blob
 * (`d` = "AmethystSettings"). That blob is replaced whole on every write, so we
 * keep ours apart rather than share it.
 *
 * Conflicts are last-writer-wins on `updated_at`, the moment the reader last
 * changed any of the three (lib/dm/prefs stamps it). The one exception is a
 * device's first sync, which unions both copies so nobody loses the pins they
 * made before this existed.
 */
import { activeAccount, type PublishOutcome } from "@/accounts/signing";
import { DM_PREFS_D_TAG, fetchAlertPrefs, publishAlertPrefs } from "@/services/nostr";
import {
  SYNCED_DM_FIELDS,
  applySyncedDmPrefs,
  onSyncedDmPrefsChange,
  readDmPrefs,
  syncedFieldsEqual,
  type DmPrefs,
  type DmPrefsSync,
  type SyncedDmPrefs,
} from "./prefs";

/** The decrypted content. A field an older writer left out is absent, not empty: absent keeps this device's copy. */
export interface RemoteDmPrefs extends Partial<SyncedDmPrefs> {
  updatedAt: number;
}

export function parseRemoteDmPrefs(raw: Record<string, unknown> | null | undefined): RemoteDmPrefs | null {
  if (!raw || typeof raw.updated_at !== "number") return null;
  const out: RemoteDmPrefs = { updatedAt: raw.updated_at };
  for (const f of SYNCED_DM_FIELDS) {
    const v = raw[f];
    if (Array.isArray(v)) out[f] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export type DmPrefsPlan =
  | { kind: "keep" }
  | { kind: "publish" }
  | { kind: "adopt"; fields: Partial<SyncedDmPrefs>; sync: DmPrefsSync; publish: boolean };

/** What to do with this device's copy and the account's. Pure: `hydrateDmPrefs` does the I/O. */
export function reconcileDmPrefs(local: DmPrefs, remote: RemoteDmPrefs | null, now: number): DmPrefsPlan {
  if (!remote) {
    // Nothing readable on the account. A change made here goes up; so does a device's
    // first copy, but without a stamp — if this was only a relay timeout or a signer
    // that couldn't ask, the next sync still merges instead of overwriting.
    if (local.sync?.dirty) return { kind: "publish" };
    if (!local.sync && SYNCED_DM_FIELDS.some((f) => local[f].length)) return { kind: "publish" };
    return { kind: "keep" };
  }
  if (!local.sync) {
    const merged = {} as SyncedDmPrefs;
    for (const f of SYNCED_DM_FIELDS) merged[f] = [...new Set([...(remote[f] ?? local[f]), ...local[f]])];
    const theirs = Object.fromEntries(SYNCED_DM_FIELDS.map((f) => [f, remote[f] ?? []])) as SyncedDmPrefs;
    const ahead = !syncedFieldsEqual(merged, theirs);
    return {
      kind: "adopt",
      fields: merged,
      sync: ahead ? { at: now, dirty: true } : { at: remote.updatedAt, dirty: false },
      publish: ahead,
    };
  }
  if (remote.updatedAt > local.sync.at) {
    const fields: Partial<SyncedDmPrefs> = {};
    for (const f of SYNCED_DM_FIELDS) if (remote[f]) fields[f] = remote[f];
    return { kind: "adopt", fields, sync: { at: remote.updatedAt, dirty: false }, publish: false };
  }
  if (remote.updatedAt < local.sync.at) return { kind: "publish" };
  // Same moment: it is our own publish, landed without us hearing back.
  return local.sync.dirty
    ? { kind: "adopt", fields: {}, sync: { at: local.sync.at, dirty: false }, publish: false }
    : { kind: "keep" };
}

/** A burst of pin/mute toggles is one publish. */
const DEBOUNCE_MS = 1500;
const RETRY_MS = 15_000;
const MAX_RETRIES = 3;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let queue: Promise<unknown> = Promise.resolve();

/** One at a time, so an older copy can never be signed after a newer one. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function schedule(pubkey: string, delay: number, attempt = 0): void {
  clearTimeout(timers.get(pubkey));
  timers.set(
    pubkey,
    setTimeout(() => {
      timers.delete(pubkey);
      void serial(() => publishNow(pubkey, attempt));
    }, delay),
  );
}

async function publishNow(pubkey: string, attempt = 0): Promise<void> {
  // Another account is active now: this one's change stays dirty until it's back.
  if (activeAccount()?.pubkey !== pubkey) return;
  const prefs = readDmPrefs(pubkey);
  const at = prefs.sync?.at ?? Date.now();
  const res = await publishAlertPrefs(
    { v: 1, updated_at: at, pinned: prefs.pinned, muted: prefs.muted, accepted: prefs.accepted },
    DM_PREFS_D_TAG,
    // Nobody asked to unlock for a pin: a Locked Account defers to the next sync.
    { background: true },
  ).catch((): PublishOutcome => ({ success: false, error: "All relays failed" }));
  if (res.success) {
    // Only what was sent is confirmed: a change made while it was in flight stays dirty.
    const now = readDmPrefs(pubkey).sync;
    if (!now || now.at === at) applySyncedDmPrefs(pubkey, {}, { at, dirty: false });
    return;
  }
  // Waiting on the reader (locked, declined, signer away) or unable to encrypt at all:
  // a timer can't fix those. The next change or the next time Messages opens retries.
  if (res.deferred || res.cancelled || res.signerUnreachable || res.error === "Not logged in") return;
  if (res.error === "Could not encrypt") return;
  if (attempt < MAX_RETRIES) schedule(pubkey, RETRY_MS, attempt + 1);
}

/**
 * Bring the account's copy in and send this device's up if it is newer. Runs when
 * the inbox starts for a key held here and whenever Messages opens.
 */
export function hydrateDmPrefs(pubkey: string): Promise<void> {
  return serial(async () => {
    if (!pubkey || activeAccount()?.pubkey !== pubkey) return;
    const raw = await fetchAlertPrefs(6000, DM_PREFS_D_TAG).catch(() => null);
    // Switched accounts mid-fetch: what came back isn't this account's.
    if (activeAccount()?.pubkey !== pubkey) return;
    const plan = reconcileDmPrefs(readDmPrefs(pubkey), parseRemoteDmPrefs(raw), Date.now());
    if (plan.kind === "adopt") applySyncedDmPrefs(pubkey, plan.fields, plan.sync);
    if (plan.kind === "publish" || (plan.kind === "adopt" && plan.publish)) await publishNow(pubkey);
  });
}

/** Publish the reader's pin/mute/accept changes as they make them. Returns the stop. */
export function startDmPrefsSync(): () => void {
  onSyncedDmPrefsChange((pubkey) => schedule(pubkey, DEBOUNCE_MS));
  return () => {
    onSyncedDmPrefsChange(null);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
