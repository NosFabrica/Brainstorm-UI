import type { NostrEvent } from "nostr-tools";
import { openDb, transact } from "./idb";
import { eventStore } from "./eventStore";

/**
 * Names and avatars kept on the device between visits.
 *
 * Kind 0 ONLY. Per-account entries (kind 30078) are encrypted to self and
 * scoped by an `authors` filter alone (lib/eventStore.ts) — writing those to
 * shared browser storage would carry one account's ciphertext across a switch.
 *
 * A held profile answers straight away, but only a young one answers ALONE:
 * past `PROFILE_FRESH_MS` it is still shown and the relay is asked as well, so
 * the next visit has the new name. Past `PROFILE_TTL_MS` it is not shown at
 * all. Everything the app learns about a profile is written back
 * (`startProfileCacheSync`), including the User's own edits — without that a
 * held copy would sit here uncorrected however often the app saw a newer one.
 */

const DB_NAME = "brainstorm-profiles";
const STORE = "profiles";
const DB_VERSION = 1;

/** How long a held profile answers without the relay being asked as well. */
export const PROFILE_FRESH_MS = 60 * 60 * 1000;
/** How long it answers at all. */
export const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How long writes are gathered before they go to the device. */
const WRITE_BATCH_MS = 2000;
/** Bounded, so it cannot grow until the browser evicts the lot. */
export const MAX_PROFILES = 2000;

export interface ProfileRow {
  event: NostrEvent;
  /** When this copy was last learned — the eviction order and the age. */
  at: number;
}

/** What this module needs of the device's storage. */
export interface ProfileStore {
  get: (pubkeys: string[]) => Promise<ProfileRow[]>;
  put: (rows: ProfileRow[]) => Promise<void>;
  count: () => Promise<number>;
  oldest: (n: number) => Promise<string[]>;
  remove: (pubkeys: string[]) => Promise<void>;
}

let store: ProfileStore | null | undefined;

function indexedDbStore(): ProfileStore | null {
  if (typeof indexedDB === "undefined") return null;
  const db = () =>
    openDb(DB_NAME, DB_VERSION, (open) => {
      if (!open.objectStoreNames.contains(STORE)) {
        open.createObjectStore(STORE, { keyPath: "event.pubkey" }).createIndex("at", "at");
      }
    });
  return {
    get: async (pubkeys) => {
      const open = await db();
      try {
        const rows = await transact<ProfileRow[]>(open, STORE, "readonly", (s, keep) => {
          const found: ProfileRow[] = [];
          keep(found);
          for (const pk of pubkeys) {
            const req = s.get(pk);
            req.onsuccess = () => req.result && found.push(req.result as ProfileRow);
          }
        });
        return rows ?? [];
      } finally {
        open.close();
      }
    },
    put: async (rows) => {
      const open = await db();
      try {
        await transact(open, STORE, "readwrite", (s) => rows.forEach((row) => s.put(row)));
      } finally {
        open.close();
      }
    },
    count: async () => {
      const open = await db();
      try {
        return (
          (await transact<number>(open, STORE, "readonly", (s, keep) => {
            const req = s.count();
            req.onsuccess = () => keep(req.result);
          })) ?? 0
        );
      } finally {
        open.close();
      }
    },
    oldest: async (n) => {
      const open = await db();
      try {
        return (
          (await transact<string[]>(open, STORE, "readonly", (s, keep) => {
            const keys: string[] = [];
            keep(keys);
            const cursor = s.index("at").openKeyCursor();
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (!c || keys.length >= n) return;
              keys.push(String(c.primaryKey));
              c.continue();
            };
          })) ?? []
        );
      } finally {
        open.close();
      }
    },
    remove: async (pubkeys) => {
      const open = await db();
      try {
        await transact(open, STORE, "readwrite", (s) => pubkeys.forEach((pk) => s.delete(pk)));
      } finally {
        open.close();
      }
    },
  };
}

function device(): ProfileStore | null {
  if (store === undefined) {
    try {
      store = indexedDbStore();
    } catch {
      store = null;
    }
  }
  return store;
}

/** The rows held for these pubkeys, with their age — expired ones left out. */
export async function readProfileRows(pubkeys: string[]): Promise<Map<string, ProfileRow>> {
  const held = new Map<string, ProfileRow>();
  const s = device();
  if (!s || pubkeys.length === 0) return held;
  try {
    const alive = Date.now() - PROFILE_TTL_MS;
    for (const row of await s.get(pubkeys)) {
      if (row.at >= alive && row.event?.kind === 0) held.set(row.event.pubkey, row);
    }
  } catch {
    /* the device has nothing to say — ask the relay */
  }
  return held;
}

/**
 * Held profiles young enough to answer on their own, for applesauce's
 * `cacheRequest`: that hook REMOVES the pointers it answers from the loading
 * sequence, so an older copy must fall through to the relays instead.
 */
export async function readProfiles(pubkeys: string[]): Promise<Map<string, NostrEvent>> {
  const fresh = Date.now() - PROFILE_FRESH_MS;
  const rows = await readProfileRows(pubkeys);
  const held = new Map<string, NostrEvent>();
  for (const [pubkey, row] of rows) if (row.at >= fresh) held.set(pubkey, row.event);
  return held;
}

/** Hold these profiles for next time, newest copy winning, oldest evicted. */
export async function writeProfiles(events: NostrEvent[]): Promise<void> {
  const s = device();
  const profiles = events.filter((e) => e.kind === 0);
  if (!s || profiles.length === 0) return;
  try {
    const held = await s.get(profiles.map((e) => e.pubkey));
    const newest = new Map(held.map((r) => [r.event.pubkey, r.event.created_at]));
    const rows = profiles
      .filter((e) => e.created_at >= (newest.get(e.pubkey) ?? 0))
      .map((event) => ({ event, at: Date.now() }));
    if (rows.length === 0) return;
    await s.put(rows);
    const over = (await s.count()) - MAX_PROFILES;
    if (over > 0) await s.remove(await s.oldest(over));
  } catch {
    /* no room, no storage, no matter */
  }
}

/** Test seam: the device's store, or null for a device without one. */
export function __useProfileStore(fake: ProfileStore | null | undefined): void {
  store = fake;
}

/**
 * Keep the device's copy level with whatever the app learns: a profile from a
 * search, a loader, or the User's own edit all arrive in the store, so that is
 * where this listens. Without it a held copy would answer for a week while a
 * newer one sat in memory beside it.
 */
export function startProfileCacheSync(): () => void {
  const pending = new Map<string, NostrEvent>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const batch = [...pending.values()];
    pending.clear();
    void writeProfiles(batch);
  };
  const sub = eventStore.insert$.subscribe((event: NostrEvent) => {
    if (event.kind !== 0) return;
    const held = pending.get(event.pubkey);
    if (held && held.created_at >= event.created_at) return;
    pending.set(event.pubkey, event);
    // Batched: a page of results inserts a hundred of these in a burst.
    timer ??= setTimeout(flush, WRITE_BATCH_MS);
  });
  return () => {
    sub.unsubscribe();
    if (timer) clearTimeout(timer);
    flush();
  };
}
