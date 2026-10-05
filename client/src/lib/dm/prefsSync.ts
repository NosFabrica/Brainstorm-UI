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
 * A device's edits are merged, not raced: it remembers the account's copy as of its
 * last sync (`sync.base`), and before every publish reads the current copy and applies
 * only what it changed since — this pin added, that mute removed — onto it. Two
 * devices editing different chats both keep their edits; the same chat, the later
 * edit wins. (Publishing whole lists on `updated_at` alone let a tab opened yesterday
 * undo, with one pin, a mute made on the phone today.) Until a device has merged once (`sync.joined`)
 * its lists are only unioned in: a replaceable event is overwritten whole, so a
 * device that hasn't seen the account's copy must never publish over it — not
 * on a timeout, not on a copy it couldn't decrypt, not on a pin made before
 * the first fetch came back.
 */
import { activeAccount, hasExternalSigner, type PublishOutcome } from "@/accounts/signing";
import { DM_PREFS_D_TAG, fetchPrivateAppData, publishAlertPrefs } from "@/services/nostr";
import {
  SYNCED_DM_FIELDS,
  applySyncedDmPrefs,
  onSyncedDmPrefsChange,
  readDmPrefs,
  strings,
  syncedFieldsEqual,
  syncedFieldsOf,
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
  for (const f of SYNCED_DM_FIELDS) if (Array.isArray(raw[f])) out[f] = strings(raw[f]);
  return out;
}

export interface DmPrefsPlan {
  /** Written to this device first. */
  write?: { fields: Partial<SyncedDmPrefs>; sync: DmPrefsSync };
  publish: boolean;
}

/**
 * This device's edits since `base`, applied to `remote`: what it added (in its order,
 * pins at the front — they are newest first), and what it removed, taken out.
 */
export function mergeDmPrefs(base: SyncedDmPrefs, local: SyncedDmPrefs, remote: SyncedDmPrefs): SyncedDmPrefs {
  const out = {} as SyncedDmPrefs;
  for (const f of SYNCED_DM_FIELDS) {
    const had = new Set(base[f]);
    const has = new Set(local[f]);
    const added = local[f].filter((x) => !had.has(x));
    const removed = new Set(base[f].filter((x) => !has.has(x)));
    const kept = remote[f].filter((x) => !removed.has(x) && !added.includes(x));
    out[f] = f === "pinned" ? [...added, ...kept] : [...kept, ...added];
  }
  return out;
}

/**
 * What to do with this device's copy and the account's. Pure: `hydrateDmPrefs`
 * does the I/O. `remote` is the account's copy, or what the relays said instead.
 */
export function reconcileDmPrefs(
  local: DmPrefs,
  remote: RemoteDmPrefs | "absent" | "unknown",
  now: number,
): DmPrefsPlan {
  if (remote === "unknown") return { publish: false };
  const sync = local.sync;
  if (!sync?.joined) {
    if (remote === "absent") {
      // Proven empty: this device's copy is the first. Joined once the publish lands —
      // or now, when it has nothing to send, so its next change goes straight out.
      if (!SYNCED_DM_FIELDS.some((f) => local[f].length)) {
        return { write: { fields: {}, sync: { at: sync?.at ?? 0, dirty: false, joined: true } }, publish: false };
      }
      return { write: { fields: {}, sync: { at: sync?.at ?? now, dirty: true, joined: false } }, publish: true };
    }
    const merged = {} as SyncedDmPrefs;
    for (const f of SYNCED_DM_FIELDS) merged[f] = [...new Set([...(remote[f] ?? local[f]), ...local[f]])];
    const theirs = Object.fromEntries(SYNCED_DM_FIELDS.map((f) => [f, remote[f] ?? []])) as SyncedDmPrefs;
    const ahead = !syncedFieldsEqual(merged, theirs);
    return {
      write: {
        fields: merged,
        sync: ahead
          ? { at: Math.max(now, remote.updatedAt + 1), dirty: true, joined: true }
          : { at: remote.updatedAt, dirty: false, joined: true },
      },
      publish: ahead,
    };
  }
  // The relays lost it, or it was deleted: put this device's back.
  if (remote === "absent") return { write: { fields: {}, sync: { ...sync, dirty: true } }, publish: true };
  // A field an older writer left out keeps this device's copy.
  const theirs = Object.fromEntries(SYNCED_DM_FIELDS.map((f) => [f, remote[f] ?? local[f]])) as SyncedDmPrefs;
  if (!sync.dirty) {
    // Nothing of ours waiting: take the account's copy if it moved on.
    if (remote.updatedAt > sync.at) {
      const fields: Partial<SyncedDmPrefs> = {};
      for (const f of SYNCED_DM_FIELDS) if (remote[f]) fields[f] = remote[f];
      return { write: { fields, sync: { at: remote.updatedAt, dirty: false, joined: true } }, publish: false };
    }
    return { publish: false };
  }
  // Our own publish, landed without us hearing back.
  if (remote.updatedAt === sync.at && syncedFieldsEqual(theirs, syncedFieldsOf(local)))
    return { write: { fields: {}, sync: { ...sync, dirty: false } }, publish: false };
  // Edits waiting here: apply them to the account's copy as it is now. A device synced
  // before bases were kept has none; its lists against the account's are its edits.
  const merged = mergeDmPrefs(sync.base ?? theirs, syncedFieldsOf(local), theirs);
  return {
    write: {
      fields: merged,
      // The edit keeps its own time, moved past the copy it was merged onto.
      sync: { at: Math.max(sync.at, remote.updatedAt + 1), dirty: true, joined: true, base: theirs },
    },
    publish: true,
  };
}

/**
 * NIP-44 refuses plaintext over 65535 bytes, and a 1:1 room key alone is 129.
 * `accepted` only ever grows, so without a bound a long-lived account would one
 * day stop syncing for good. Over budget, the published copy drops the oldest
 * accepted requests first, then the oldest mutes, then the oldest pins; this
 * device keeps all of them.
 */
const MAX_PLAINTEXT_BYTES = 60_000;

export function fitDmPrefsPayload<T extends SyncedDmPrefs>(payload: T): T {
  let size = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (size <= MAX_PLAINTEXT_BYTES) return payload;
  const accepted = [...payload.accepted];
  const muted = [...payload.muted];
  const pinned = [...payload.pinned];
  // `accepted` and `muted` append, so their oldest lead; `pinned` is newest first.
  const drop = (list: string[], oldestFirst: boolean) => {
    const gone = oldestFirst ? list.shift()! : list.pop()!;
    size -= new TextEncoder().encode(gone).length + 3; // its quotes and comma
  };
  while (size > MAX_PLAINTEXT_BYTES && accepted.length) drop(accepted, true);
  while (size > MAX_PLAINTEXT_BYTES && muted.length) drop(muted, true);
  while (size > MAX_PLAINTEXT_BYTES && pinned.length) drop(pinned, false);
  return { ...payload, accepted, muted, pinned };
}

/** A burst of pin/mute toggles is one publish. */
const DEBOUNCE_MS = 1500;
const RETRY_MS = 15_000;
const MAX_RETRIES = 3;
/** Boot and opening Messages straight after are one read, not two. */
const FRESH_MS = 30_000;
/** How often an open tab in view looks for other devices' changes. */
const REFRESH_MS = 2 * 60_000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrating = new Map<string, Promise<void>>();
const hydratedAt = new Map<string, number>();
/** The account's copy as last read, so an unchanged one is neither decrypted nor re-parsed. */
const seen = new Map<string, { id: string; remote: RemoteDmPrefs | null }>();
/** Newest `created_at` (s) seen or published per account: the next publish goes past it, or relays keep the older. */
const lastCreatedAt = new Map<string, number>();
let running = false;
let queue: Promise<unknown> = Promise.resolve();

/** One at a time, so an older copy can never be signed after a newer one. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function schedule(pubkey: string, delay: number, attempt = 0): void {
  if (!running) return;
  clearTimeout(timers.get(pubkey));
  timers.set(
    pubkey,
    setTimeout(() => {
      timers.delete(pubkey);
      void serial(() => publishNow(pubkey, { attempt }));
    }, delay),
  );
}

/** The account's copy as the relays have it now, or what they said instead. */
async function readRemote(pubkey: string): Promise<RemoteDmPrefs | "absent" | "unknown"> {
  const got = await fetchPrivateAppData(DM_PREFS_D_TAG, { knownId: seen.get(pubkey)?.id });
  if (activeAccount()?.pubkey !== pubkey) return "unknown";
  if (got.status === "found" || got.status === "unchanged") {
    lastCreatedAt.set(pubkey, Math.max(lastCreatedAt.get(pubkey) ?? 0, got.createdAt));
  }
  if (got.status === "found") {
    const parsed = parseRemoteDmPrefs(got.data);
    seen.set(pubkey, { id: got.id, remote: parsed });
    // Ours, readable, but not in a shape we know: nothing in it to keep.
    return parsed ?? "absent";
  }
  if (got.status === "unchanged") return seen.get(pubkey)?.remote ?? "absent";
  return got.status;
}

async function publishNow(pubkey: string, { attempt = 0, first = false } = {}): Promise<void> {
  // Another account is active now: this one's change stays dirty until it's back.
  if (activeAccount()?.pubkey !== pubkey) return;
  const prefs = readDmPrefs(pubkey);
  const sync = prefs.sync;
  // Nothing new to say, or not merged yet — `hydrateDmPrefs` publishes once it has.
  if (!sync?.dirty || (!sync.joined && !first)) return;
  if (!first) {
    // Read before writing: another device may have changed the account's copy since
    // this one last looked, and a replaceable event is overwritten whole.
    const remote = await readRemote(pubkey);
    if (activeAccount()?.pubkey !== pubkey) return;
    if (remote === "unknown") {
      // Couldn't tell what's there: publishing blind could undo another device's edit.
      if (attempt < MAX_RETRIES) schedule(pubkey, RETRY_MS, attempt + 1);
      return;
    }
    const plan = reconcileDmPrefs(readDmPrefs(pubkey), remote, Date.now());
    if (plan.write) applySyncedDmPrefs(pubkey, plan.write.fields, plan.write.sync);
    if (!plan.publish) return;
    return publishNow(pubkey, { attempt, first: true });
  }
  const account = activeAccount();
  if (account?.pubkey !== pubkey) return;
  const createdAt = Math.max(Math.floor(Date.now() / 1000), (lastCreatedAt.get(pubkey) ?? 0) + 1);
  const res = await publishAlertPrefs(
    fitDmPrefsPayload({
      v: 1,
      updated_at: sync.at,
      pinned: prefs.pinned,
      muted: prefs.muted,
      accepted: prefs.accepted,
    }),
    DM_PREFS_D_TAG,
    // Nobody asked to unlock for a pin: a Locked key defers to the next sync. An
    // extension's prompt is its own, and this only runs for one on the reader's
    // act (a pin, Messages opening), so it is asked.
    { background: !hasExternalSigner(account), createdAt },
  ).catch((): PublishOutcome => ({ success: false, error: "All relays failed" }));
  // Signed out or switched while it was out: the row may be gone, and must stay gone.
  if (activeAccount()?.pubkey !== pubkey) return;
  if (res.success) {
    lastCreatedAt.set(pubkey, createdAt);
    // Only what was sent is confirmed: a change made while it was in flight stays dirty.
    if (readDmPrefs(pubkey).sync?.at === sync.at) {
      applySyncedDmPrefs(pubkey, {}, { at: sync.at, dirty: false, joined: true });
    }
    return;
  }
  // Waiting on the reader (locked, declined, signer away) or unable to encrypt at all:
  // a timer can't fix those. The next change or the next time Messages opens retries.
  if (res.deferred || res.cancelled || res.declined || res.signerUnreachable || res.error === "Not logged in") return;
  if (res.error === "Could not encrypt") return;
  // A timer is nobody's act: through an extension or bunker it would be a prompt
  // out of nowhere. Theirs retries on the next change, or when Messages opens.
  if (hasExternalSigner(account)) return;
  if (attempt < MAX_RETRIES) schedule(pubkey, RETRY_MS, attempt + 1);
}

/**
 * Bring the account's copy in and send this device's up if it is newer. Runs when
 * the inbox starts for a key held here and whenever Messages opens; a second call
 * while one is running, or soon after one got an answer, is the same call.
 */
export function hydrateDmPrefs(pubkey: string): Promise<void> {
  if (!pubkey) return Promise.resolve();
  const inFlight = hydrating.get(pubkey);
  if (inFlight) return inFlight;
  if (Date.now() - (hydratedAt.get(pubkey) ?? 0) < FRESH_MS) return Promise.resolve();
  const run = serial(async () => {
    if (activeAccount()?.pubkey !== pubkey) return;
    const remote = await readRemote(pubkey);
    // Switched accounts mid-fetch: what came back isn't this account's.
    if (activeAccount()?.pubkey !== pubkey) return;
    const plan = reconcileDmPrefs(readDmPrefs(pubkey), remote, Date.now());
    if (plan.write) applySyncedDmPrefs(pubkey, plan.write.fields, plan.write.sync);
    if (plan.publish) await publishNow(pubkey, { first: true });
    // Only a read that settled things counts: "couldn't tell", or a first copy that
    // didn't make it out, leaves the next open or the next change to ask again.
    if (remote !== "unknown" && readDmPrefs(pubkey).sync?.joined) hydratedAt.set(pubkey, Date.now());
  }).finally(() => hydrating.delete(pubkey));
  hydrating.set(pubkey, run);
  return run;
}

/** Publish the reader's pin/mute/accept changes as they make them. Returns the stop. */
export function startDmPrefsSync(): () => void {
  running = true;
  // Not merged yet: the change waits for the merge, which publishes it.
  onSyncedDmPrefsChange((pubkey) =>
    readDmPrefs(pubkey).sync?.joined ? schedule(pubkey, DEBOUNCE_MS) : void hydrateDmPrefs(pubkey),
  );
  // An open tab follows the other devices: when it comes back into view, and every few
  // minutes while it's in view. hydrateDmPrefs skips a read made in the last FRESH_MS.
  // Only for a key held here: an extension or bunker asks the reader for every
  // read and write, and nobody asked for these. Theirs syncs when Messages opens
  // and when they pin, mute or accept a chat. (Closing an extension's prompt
  // focuses the tab again, so a refresh on focus would open the next prompt.)
  const refresh = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const account = activeAccount();
    if (account && !hasExternalSigner(account)) void hydrateDmPrefs(account.pubkey);
  };
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) {
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
  }
  const every = hasWindow ? setInterval(refresh, REFRESH_MS) : undefined;
  return () => {
    running = false;
    onSyncedDmPrefsChange(null);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    if (hasWindow) {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    }
    clearInterval(every);
  };
}
