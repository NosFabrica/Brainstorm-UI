/**
 * The events this device keeps between visits, in one place.
 *
 * Two things live here because they are the same mechanism with different
 * settings, not two ideas:
 *
 * - **Profiles (kind 0).** Names and avatars, so a reload does not ask the
 *   relay for sixty kind-0s it already had. Two ages: a young copy answers on
 *   its own, an older one is still shown while the relay is asked as well, and
 *   past a week it is not shown at all.
 * - **Routing (kinds 3, 10002, 10040).** Where reads and publishes GO. Without
 *   these the app rebuilds its routing table from relays on every load — the
 *   NIP-65 list, then the contact list, then everything routed by them.
 *
 * What may NOT be kept: kind 30078. It is per-account data encrypted to self
 * and scoped by an `authors` filter alone, so persisting it would carry one
 * account's ciphertext across a switch into shared browser storage. Anything
 * else new is unbounded, or nothing waits on it.
 *
 * The copy is advisory, never authoritative: these are replaceable kinds, so a
 * newer `created_at` always wins, and everything the app learns is written back
 * (`startEventCacheSync`) so a held copy cannot sit here uncorrected.
 */
import { verifyEvent } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";

import { openDb as openIdb, transact } from "./idb";
import { eventStore } from "./eventStore";
import { loadKnownFollowList } from "./followStore";

const DB_NAME = "brainstorm-events";
const STORE = "events";

/** Kind 0's own database, before profiles and routing shared one. */
const LEGACY_PROFILE_DB = "brainstorm-profiles";

/** How long a held profile answers without the relay being asked as well. */
export const PROFILE_FRESH_MS = 60 * 60 * 1000;
/** How long it answers at all. */
export const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Routing gets one age, not two. A stale name is worth showing while the relay
 * is asked; a stale relay list is not worth routing by, so it simply expires.
 */
const ROUTING_TTL_MS = 30 * 60 * 1000;

/** How long writes are gathered before they go to the device. */
const WRITE_BATCH_MS = 2000;

/** Bounded, so it cannot grow until the browser evicts the lot. */
export const MAX_CACHED = 2000;

/** Kinds worth a disk read. Everything else is unbounded or nobody waits on it. */
export const CACHED_KINDS = [0, 3, 10002, 10040];
const CACHED = new Set(CACHED_KINDS);

/** NIP-65, restated so this module needs no import from the routing one. */
const RELAY_LIST_KIND = 10002;

const ageLimit = (kind: number) => (kind === 0 ? PROFILE_TTL_MS : ROUTING_TTL_MS);
const freshLimit = (kind: number) => (kind === 0 ? PROFILE_FRESH_MS : ROUTING_TTL_MS);

export interface CachedRow {
  /** `kind:pubkey:d` — one row per replaceable coordinate. */
  addr: string;
  pubkey: string;
  kind: number;
  event: NostrEvent;
  /** When this copy was last learned — the eviction order and the age. */
  at: number;
}

export function coordinate(event: NostrEvent): string {
  const d = event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
  return `${event.kind}:${event.pubkey}:${d}`;
}

/** What this module needs of the device's storage. */
export interface CacheStore {
  get: (addrs: string[]) => Promise<CachedRow[]>;
  byAuthors: (pubkeys: string[]) => Promise<CachedRow[]>;
  put: (rows: CachedRow[]) => Promise<void>;
  count: () => Promise<number>;
  oldest: (n: number) => Promise<string[]>;
  remove: (addrs: string[]) => Promise<void>;
  clear: () => Promise<void>;
}

let store: CacheStore | null | undefined;

function build(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE)) return;
  const created = db.createObjectStore(STORE, { keyPath: "addr" });
  created.createIndex("at", "at");
  created.createIndex("pubkey", "pubkey");
}

/**
 * The database, with its store guaranteed.
 *
 * Opened WITHOUT a version on purpose. Two things can leave the store missing:
 * a first run (nothing exists yet) and anything that opened
 * `brainstorm-events` versionless before we did, which creates it at version 1
 * with no object store — and `onupgradeneeded` never fires again at that
 * version, so every transaction would throw, be swallowed by the guards that
 * make a missing cache survivable, and the cache would be silently dead.
 *
 * A versionless open adopts whatever is there, so the repair below can step
 * PAST it. Naming a fixed version here instead would work exactly once: the
 * repair moves the database to 2, and every later open at 1 then fails with a
 * VersionError — the cache dead for good rather than for a session.
 */
async function open(): Promise<IDBDatabase> {
  const db = await openIdb(DB_NAME, undefined, build);
  if (db.objectStoreNames.contains(STORE)) return db;
  const version = db.version + 1;
  db.close();
  return openIdb(DB_NAME, version, build);
}

function indexedDbStore(): CacheStore | null {
  if (typeof indexedDB === "undefined") return null;
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (s: IDBObjectStore, keep: (value: T) => void) => void,
  ): Promise<T | undefined> => {
    const db = await open();
    try {
      return await transact<T>(db, STORE, mode, work);
    } finally {
      db.close();
    }
  };

  return {
    get: async (addrs) =>
      (await run<CachedRow[]>("readonly", (s, keep) => {
        const found: CachedRow[] = [];
        keep(found);
        for (const addr of addrs) {
          const req = s.get(addr);
          req.onsuccess = () => req.result && found.push(req.result as CachedRow);
        }
      })) ?? [],

    // One transaction for the whole set: a read per author would be up to the
    // loader's buffer size (200) of them, serialized, in front of the step that
    // exists to avoid a network round trip.
    byAuthors: async (pubkeys) => {
      const wanted = new Set(pubkeys);
      return (
        (await run<CachedRow[]>("readonly", (s, keep) => {
          const found: CachedRow[] = [];
          keep(found);
          const req = s.getAll();
          req.onsuccess = () => {
            for (const row of (req.result ?? []) as CachedRow[]) {
              if (row && wanted.has(row.pubkey)) found.push(row);
            }
          };
        })) ?? []
      );
    },

    put: async (rows) => {
      await run("readwrite", (s) => rows.forEach((row) => s.put(row)));
    },

    count: async () => (await run<number>("readonly", (s, keep) => {
      const req = s.count();
      req.onsuccess = () => keep(req.result);
    })) ?? 0,

    oldest: async (n) =>
      (await run<string[]>("readonly", (s, keep) => {
        const keys: string[] = [];
        keep(keys);
        const cursor = s.index("at").openKeyCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c || keys.length >= n) return;
          keys.push(String(c.primaryKey));
          c.continue();
        };
      })) ?? [],

    remove: async (addrs) => {
      await run("readwrite", (s) => addrs.forEach((addr) => s.delete(addr)));
    },

    clear: async () => {
      await run("readwrite", (s) => s.clear());
    },
  };
}

function device(): CacheStore | null {
  if (store === undefined) {
    try {
      store = indexedDbStore();
    } catch {
      store = null;
    }
  }
  return store;
}

/**
 * A cached event is only as trustworthy as the disk it came from, and
 * IndexedDB is writable by anything that can run script on this origin.
 *
 * The ROUTING kinds are verified, because a forged kind-10002 steers where we
 * PUBLISH. Kind 0 is not: it is display only, thousands of them would be
 * thousands of signature checks on the read path, and the one place a profile
 * field is acted on — `getVerifiedProfileLud16`, before paying — verifies the
 * event itself.
 */
function trustworthy(row: CachedRow | undefined): row is CachedRow {
  const event = row?.event;
  if (!event || !CACHED.has(event.kind) || event.pubkey !== row.pubkey) return false;
  if (event.kind === 0) return true;
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

/** The rows held for these coordinates, with their age — expired ones left out. */
async function liveRows(addrs: string[]): Promise<CachedRow[]> {
  const s = device();
  if (!s || addrs.length === 0) return [];
  try {
    const now = Date.now();
    return (await s.get(addrs)).filter((row) => trustworthy(row) && row.at >= now - ageLimit(row.kind));
  } catch {
    return []; // the device has nothing to say — ask the relay
  }
}

/** The profiles held for these pubkeys, with their age — expired ones left out. */
export async function readProfileRows(pubkeys: string[]): Promise<Map<string, CachedRow>> {
  const held = new Map<string, CachedRow>();
  for (const row of await liveRows(pubkeys.map((pk) => `0:${pk}:`))) held.set(row.pubkey, row);
  return held;
}

/**
 * Held events young enough to answer ON THEIR OWN, for applesauce's
 * `cacheRequest`: that hook REMOVES the pointers it answers from the loading
 * sequence, so an older copy must fall through to the relays instead.
 */
export async function cachedEventsForFilters(
  filters: { kinds?: number[]; authors?: string[]; "#d"?: string[] }[],
): Promise<NostrEvent[]> {
  const s = device();
  const wanted = new Set(filters.flatMap((f) => f.authors ?? []));
  if (!s || wanted.size === 0) return [];

  let rows: CachedRow[];
  try {
    rows = await s.byAuthors([...wanted]);
  } catch {
    return [];
  }

  const now = Date.now();
  const byAuthor = new Map<string, CachedRow[]>();
  for (const row of rows) {
    const bucket = byAuthor.get(row.pubkey);
    if (bucket) bucket.push(row);
    else byAuthor.set(row.pubkey, [row]);
  }

  const out = new Map<string, NostrEvent>();
  for (const filter of filters) {
    for (const pubkey of filter.authors ?? []) {
      for (const row of byAuthor.get(pubkey) ?? []) {
        if (row.at < now - freshLimit(row.kind)) continue;
        if (filter.kinds && !filter.kinds.includes(row.kind)) continue;
        if (filter["#d"]) {
          const d = row.event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
          if (!filter["#d"].includes(d)) continue;
        }
        if (!trustworthy(row)) continue;
        out.set(row.event.id, row.event);
      }
    }
  }
  return [...out.values()];
}

/** Hold these events for next time, newest copy winning, oldest evicted. */
export async function writeEvents(events: NostrEvent[]): Promise<void> {
  const s = device();
  const worth = events.filter((e) => CACHED.has(e.kind));
  if (!s || worth.length === 0) return;
  try {
    const addrs = worth.map(coordinate);
    const held = await s.get(addrs);
    const newest = new Map(held.map((row) => [row.addr, row.event.created_at]));
    const at = Date.now();
    const rows = worth
      .filter((event) => event.created_at >= (newest.get(coordinate(event)) ?? 0))
      .map((event) => ({ addr: coordinate(event), pubkey: event.pubkey, kind: event.kind, event, at }));
    if (rows.length === 0) return;
    await s.put(rows);
    const over = (await s.count()) - MAX_CACHED;
    if (over > 0) await s.remove(await s.oldest(over));
  } catch {
    /* no room, no storage, no matter */
  }
}

let hydration: Promise<number> | null = null;
let hydratingFor: string | null = null;

/** Long enough for a disk read, short enough that nobody stares at a spinner. */
const HYDRATION_DEADLINE_MS = 1500;

/**
 * Resolves once hydration has finished, or immediately when none was started.
 *
 * The routed reads await this, because hydration is asynchronous and a query
 * that fires first would miss a relay list that is about to be in the store and
 * go to the relays for nothing. Bounded: a storage layer that never answers
 * must not hang the app instead of falling back to the relays.
 */
export function whenHydrated(): Promise<void> {
  if (!hydration) return Promise.resolve();
  return Promise.race([
    hydration.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, HYDRATION_DEADLINE_MS)),
  ]);
}

/**
 * Put the active account's own ROUTING events into the store, then refresh them.
 *
 * `loadReplaceable` checks the store synchronously and returns on a hit, so a
 * hydrated event costs no network AND skips the loader's buffer — which is what
 * removes the round trips a cold start otherwise pays before it can route.
 *
 * Profiles are not hydrated: they reach the store through `cacheRequest` on
 * demand, and hydrating every one of them would be a signature check and a
 * store insert for people this visit may never mention.
 */
export function hydrateEventStore(pubkey: string | null | undefined): Promise<number> {
  if (!pubkey) return Promise.resolve(0);
  // Keyed by WHO, not just "has run": switching accounts has to hydrate the
  // account switched to, and a bare guard would hand back the previous one's.
  if (hydration && hydratingFor === pubkey) return hydration;
  hydratingFor = pubkey;
  hydration = hydrate(pubkey);
  return hydration;
}

async function hydrate(pubkey: string): Promise<number> {
  const held: NostrEvent[] = [];

  // The contact-list snapshot predates this cache and every existing user
  // already has one — a kind-3 in the store on the first render, for free.
  const snapshot = loadKnownFollowList(pubkey)?.event as NostrEvent | undefined;
  if (snapshot && trustworthy({ addr: "", pubkey, kind: snapshot.kind, event: snapshot, at: 0 })) {
    held.push(snapshot);
  }

  const routing = CACHED_KINDS.filter((kind) => kind !== 0).map((kind) => `${kind}:${pubkey}:`);
  for (const row of await liveRows(routing)) held.push(row.event);

  let added = 0;
  for (const event of held) {
    try {
      // Replaceable, so the store keeps whichever is newest — a stale cached
      // copy loses to anything the relays have already returned.
      eventStore.add(event);
      added += 1;
    } catch {
      /* one bad row must not cost the rest */
    }
  }

  void revalidate(held);
  return added;
}

/**
 * Re-ask the relays for everything we hydrated, and let the store settle it.
 *
 * Not optional: the address loader's sequence STOPS at its first hit and
 * `loadReplaceable` returns a held event without asking anyone, so hydrating
 * without refreshing would pin a user to the relay list they had when the cache
 * was written, forever.
 */
async function revalidate(events: NostrEvent[]): Promise<void> {
  // Imported here, not at the top: `lib/loaders` and `lib/relayRouting` both
  // import THIS module, and a static import back would close the cycle at the
  // one moment it matters — module init, where the loader is built.
  const { loadReplaceable } = await import("./loaders");
  const { parseRelayList } = await import("./relayRouting");

  // ROUTED, not left to the lookup relays: a kind-10040 that lives only on the
  // user's own relays would otherwise be "refreshed" against a set that never
  // had it, and the stale disk copy would serve for the rest of the session.
  const cachedList = events.find((event) => event.kind === RELAY_LIST_KIND);
  const write = cachedList ? parseRelayList(cachedList).write : [];
  const relays = write.length ? write : undefined;

  await Promise.all(
    events.map((event) => {
      const identifier = event.tags.find((tag) => tag[0] === "d")?.[1];
      return loadReplaceable(event.kind, event.pubkey, {
        identifier,
        relays,
        fromRelays: true,
        timeoutMs: 8000,
      }).catch(() => undefined);
    }),
  );
}

let stopWriting: (() => void) | null = null;

/**
 * Keep the device's copy level with whatever the app learns: a profile from a
 * search, a relay list from a loader, the User's own edit — all arrive in the
 * store, so that is where this listens. Without it a held copy would answer for
 * its whole life while a newer one sat in memory beside it.
 */
export function startEventCacheSync(): () => void {
  if (stopWriting) return stopWriting;
  const pending = new Map<string, NostrEvent>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const batch = [...pending.values()];
    pending.clear();
    void writeEvents(batch);
  };
  const sub = eventStore.insert$.subscribe((event: NostrEvent) => {
    if (!CACHED.has(event.kind)) return;
    const addr = coordinate(event);
    const waiting = pending.get(addr);
    if (waiting && waiting.created_at >= event.created_at) return;
    pending.set(addr, event);
    // Batched: a page of results inserts a hundred of these in a burst.
    timer ??= setTimeout(flush, WRITE_BATCH_MS);
  });
  stopWriting = () => {
    sub.unsubscribe();
    if (timer) clearTimeout(timer);
    pending.clear();
    stopWriting = null;
  };
  return stopWriting;
}

/**
 * Drop everything. Called on sign-out: which profiles a person looked at is a
 * browsing trail, and it should not outlive the session on a shared device.
 */
export async function clearEventCache(): Promise<void> {
  // The writer first: it batches, so clearing without stopping it lets the
  // in-flight batch write the trail straight back after sign-out wiped it.
  stopWriting?.();
  hydration = null;
  hydratingFor = null;
  const s = device();
  if (!s) return;
  try {
    await s.clear();
  } catch {
    /* nothing to do */
  }
}

/** Profiles and routing shared a database from here on; the old one is dead. */
export function dropLegacyProfileDb(): void {
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(LEGACY_PROFILE_DB);
  } catch {
    /* it will simply sit there */
  }
}

/** Test seam — whether the batching writer is running. */
export function __isWriting(): boolean {
  return stopWriting !== null;
}

/** Test seam: the device's store, or null for a device without one. */
export function __useCacheStore(fake: CacheStore | null | undefined): void {
  store = fake;
}

/** Test seam. */
export function __resetEventCache(): void {
  hydration = null;
  hydratingFor = null;
  stopWriting?.();
  stopWriting = null;
}
