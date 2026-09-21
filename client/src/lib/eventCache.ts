/**
 * A durable cache for the events the app's ROUTING is made of, so a reload does
 * not rebuild the routing table from relays.
 *
 * Sibling to `lib/profileCache`, which does the same for kind 0 under its own
 * freshness rules (docs/adr/0002). This one holds what decides where reads and
 * publishes GO; that one holds what they are displayed as.
 *
 * Without this, every page load starts from an empty `eventStore`: the NIP-65
 * relay list has to be fetched before anything can be routed, the contact list
 * after that, and the profile after that — two dependent relay round trips
 * before the app knows who you follow, each behind the loader's buffer.
 *
 * Only replaceable kinds, and only a short list of them. This is not a general
 * event cache: notes and articles are large, unbounded, and nothing blocks on
 * them. These five are small, exactly one per coordinate, and every one of them
 * sits on the critical path.
 *
 * Two layers, because they answer different questions:
 *
 * - **Hydration** puts the ACTIVE account's own events into the store before
 *   the first query. `loadReplaceable` checks the store synchronously and
 *   returns on a hit, so a hydrated event costs no network AND skips the
 *   loader's buffer entirely. This is what removes the round trips.
 * - **The IndexedDB store** holds everyone else's too, written in batches as
 *   they arrive. Nothing reads those back yet — that is the `cacheRequest` step
 *   — but the data is there and bounded.
 */
import { verifyEvent } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { persistEventsToCache } from "applesauce-core/helpers/event-cache";

import { eventStore } from "./eventStore";
import { loadKnownFollowList } from "./followStore";

/**
 * Kind 3 (contacts), 10002 (relay list), 10040 (trust provider) — the events
 * that decide WHERE everything else is read from and published to.
 *
 * Two deliberate absences. Kind 0 belongs to `lib/profileCache`, which holds
 * names and avatars under a two-age policy of its own; a second copy here would
 * be the same data under a worse rule. Kind 30078 is per-account data encrypted
 * to self and scoped by an `authors` filter alone, so persisting it would carry
 * one account's ciphertext across a switch into shared browser storage — the
 * line docs/adr/0002 draws, and the same line applies here.
 */
export const CACHED_KINDS = [3, 10002, 10040];
const CACHED = new Set(CACHED_KINDS);

const DB_NAME = "brainstorm-events";
const DB_VERSION = 1;
const STORE = "events";

/**
 * Roughly a few hundred KB of JSON. Big enough for a heavy browsing session's
 * profiles, small enough that eviction never has real work to do.
 */
const MAX_CACHED_EVENTS = 500;

/** How often a write batch is flushed. The library default; restated for clarity. */
const WRITE_BATCH_MS = 5_000;

interface CachedRow {
  /** `kind:pubkey:d` — one row per replaceable coordinate. */
  addr: string;
  pubkey: string;
  event: NostrEvent;
  /** For LRU eviction. Not the event's own timestamp. */
  cachedAt: number;
}

const coordinate = (event: NostrEvent): string => {
  const d = event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
  return `${event.kind}:${event.pubkey}:${d}`;
};

/**
 * `null` whenever IndexedDB cannot be used — private browsing, a blocked
 * origin, a test environment. Every caller treats that as "no cache", never as
 * an error: the app worked without this and must keep working without it.
 */
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(version?: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = version === undefined
        ? indexedDB.open(DB_NAME, DB_VERSION)
        : indexedDB.open(DB_NAME, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "addr" });
          store.createIndex("pubkey", "pubkey");
          store.createIndex("cachedAt", "cachedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = open().then(async (db) => {
    if (!db || db.objectStoreNames.contains(STORE)) return db;
    // The database exists at our version but has no object store — which any
    // other code that opened `brainstorm-events` WITHOUT a version would have
    // created. `onupgradeneeded` will never fire again at that version, so every
    // transaction would throw, be swallowed, and the cache would be silently and
    // permanently dead. Stepping the version forces the upgrade that builds it.
    const version = db.version + 1;
    db.close();
    return open(version);
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** Everything cached for one author. */
async function rowsFor(pubkey: string): Promise<CachedRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const index = db.transaction(STORE, "readonly").objectStore(STORE).index("pubkey");
    const rows = await promisify<CachedRow[]>(index.getAll(pubkey) as IDBRequest<CachedRow[]>);
    return rows ?? [];
  } catch {
    return [];
  }
}

/**
 * Everything cached for a set of authors, in ONE transaction.
 *
 * A read per author would be up to `bufferSize` (200) serialized IndexedDB
 * round trips in front of the step that exists to avoid a network round trip.
 * The whole store is `MAX_CACHED_EVENTS` rows, so reading it once and grouping
 * in memory is cheaper than querying the index repeatedly.
 */
async function rowsForAuthors(pubkeys: Set<string>): Promise<Map<string, CachedRow[]>> {
  const grouped = new Map<string, CachedRow[]>();
  if (!pubkeys.size) return grouped;
  const db = await openDb();
  if (!db) return grouped;
  try {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const rows = await promisify<CachedRow[]>(store.getAll() as IDBRequest<CachedRow[]>);
    for (const row of rows ?? []) {
      if (!row || !pubkeys.has(row.pubkey)) continue;
      const bucket = grouped.get(row.pubkey);
      if (bucket) bucket.push(row);
      else grouped.set(row.pubkey, [row]);
    }
  } catch {
    /* an unreadable cache is a miss, never an error */
  }
  return grouped;
}

async function writeEvents(events: NostrEvent[]): Promise<void> {
  const worth = events.filter((event) => CACHED.has(event.kind));
  if (!worth.length) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const cachedAt = Date.now();
    for (const event of worth) {
      store.put({ addr: coordinate(event), pubkey: event.pubkey, event, cachedAt } satisfies CachedRow);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* a cache write is never worth failing a read over */
  }
  await evict();
}

/** Oldest-written rows go first, once the cache is over its cap. */
async function evict(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const count = await promisify(store.count());
    if (count === null || count <= MAX_CACHED_EVENTS) return;
    let over = count - MAX_CACHED_EVENTS;
    const cursorRequest = store.index("cachedAt").openCursor();
    await new Promise<void>((resolve) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || over <= 0) return resolve();
        cursor.delete();
        over -= 1;
        cursor.continue();
      };
      cursorRequest.onerror = () => resolve();
    });
  } catch {
    /* over the cap is survivable; a thrown eviction is not */
  }
}

/**
 * A cached event is only as trustworthy as the disk it came from, and IndexedDB
 * is writable by anything that can run script on this origin. A forged kind-10002
 * would steer where we PUBLISH, so nothing is hydrated unsigned.
 */
function verified(event: NostrEvent | undefined | null, pubkey: string): event is NostrEvent {
  if (!event || event.pubkey !== pubkey || !CACHED.has(event.kind)) return false;
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

let hydration: Promise<number> | null = null;
let hydratingFor: string | null = null;

/**
 * Resolves once hydration has finished, or immediately when none was started.
 *
 * The read paths await this before consulting the store, because hydration is
 * asynchronous (IndexedDB is) and a query that fires first would miss a cache
 * that is about to be there and go to the relays for nothing.
 */
export function whenHydrated(): Promise<void> {
  if (!hydration) return Promise.resolve();
  // Bounded. Every routed read waits on this, and a storage layer that never
  // answers — a blocked `indexedDB.open`, a wedged private-mode shim — would
  // otherwise hang the app rather than fall back to the relays.
  return Promise.race([
    hydration.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, HYDRATION_DEADLINE_MS)),
  ]);
}

/** Long enough for a disk read, short enough that nobody stares at a spinner. */
const HYDRATION_DEADLINE_MS = 1500;

/**
 * Put the active account's own events into the store, then refresh them.
 *
 * Stale-while-revalidate, and the revalidate half is not optional: the address
 * loader's sequence STOPS at its first hit, and `loadReplaceable` returns a
 * held event without asking anyone. Hydrating without refreshing would pin a
 * user to whatever relay list they had when the cache was written, forever.
 */
export function hydrateEventStore(pubkey: string | null | undefined): Promise<number> {
  if (!pubkey) return Promise.resolve(0);
  // Keyed by WHO, not just "has run". Switching accounts has to hydrate the
  // account switched to; a bare guard would hand back the previous one's
  // promise and leave the new account cold.
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
  if (verified(snapshot, pubkey)) held.push(snapshot);

  for (const row of await rowsFor(pubkey)) {
    if (verified(row?.event, pubkey)) held.push(row.event);
  }

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
 * `fromRelays` is what makes this a refresh rather than a second cache read —
 * it skips the store check that hydration just guaranteed would hit. Results go
 * through the loader, which inserts them, so a newer copy simply wins.
 */
async function revalidate(events: NostrEvent[]): Promise<void> {
  // Imported here, not at the top: `lib/loaders` and `lib/relayRouting` both
  // import THIS module, and a static import back would close the cycle at the
  // one moment it matters — module init, where the loader is built.
  const { loadReplaceable } = await import("./loaders");
  const { parseRelayList } = await import("./relayRouting");

  // ROUTED, not left to the lookup relays. A pointer with no relays of its own
  // reaches `lookupRelays` and nothing else, so a kind-30078 or kind-10040 that
  // lives only on the user's own relays would be "refreshed" against a set that
  // never had it — and `loadReplaceable`'s store-first hit would then serve the
  // stale disk copy for the rest of the session.
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

/** NIP-65, restated here so this module needs no import from the routing one. */
const RELAY_LIST_KIND = 10002;

/**
 * How long a cached event may answer for somebody else before we ask the relays
 * again.
 *
 * The loading sequence STOPS at its first hit, so a cache with no expiry is a
 * cache that pins every author's relay list and profile to whatever they were
 * when we last saw them. The active account gets an explicit refresh instead
 * (`revalidate` above); everyone else gets this.
 */
const SERVE_TTL_MS = 30 * 60_000;

/** Ids already checked this session — an event is served once, then it is in the store. */
const knownGood = new Set<string>();

/**
 * Answer the address loader from disk, for authors other than the active one.
 *
 * Wired as `cacheRequest`, which the loader consults BEFORE any relay and which
 * short-circuits the rest of the sequence on a hit. That is the whole point —
 * a profile or relay list seen recently costs no round trip — and it is also
 * why the TTL above exists and why nothing unverified is returned.
 */
export async function cachedEventsForFilters(
  filters: { kinds?: number[]; authors?: string[]; "#d"?: string[] }[],
): Promise<NostrEvent[]> {
  const fresh = Date.now() - SERVE_TTL_MS;
  const out = new Map<string, NostrEvent>();

  const wanted = new Set<string>();
  for (const filter of filters) for (const pubkey of filter.authors ?? []) wanted.add(pubkey);
  const byAuthor = await rowsForAuthors(wanted);

  for (const filter of filters) {
    const authors = filter.authors ?? [];
    const kinds = filter.kinds;
    const identifiers = filter["#d"];
    for (const pubkey of authors) {
      for (const row of byAuthor.get(pubkey) ?? []) {
        if (!row || row.cachedAt < fresh) continue;
        const event = row.event;
        if (kinds && !kinds.includes(event.kind)) continue;
        if (identifiers) {
          const d = event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
          if (!identifiers.includes(d)) continue;
        }
        if (!knownGood.has(event.id)) {
          if (!verified(event, pubkey)) continue;
          knownGood.add(event.id);
        }
        out.set(event.id, event);
      }
    }
  }

  return Array.from(out.values());
}

let stopWriting: (() => void) | null = null;

/** Start batching new events out to disk. Idempotent. */
export function startEventCache(): void {
  if (stopWriting) return;
  stopWriting = persistEventsToCache(eventStore, async (events) => writeEvents(events), {
    batchTime: WRITE_BATCH_MS,
  });
}

/**
 * Drop everything. Called on sign-out: which profiles a person looked at is a
 * browsing trail, and leaving it on a shared device outlives the session it
 * belonged to.
 */
export async function clearEventCache(): Promise<void> {
  // The writer first. `persistEventsToCache` batches for five seconds, so
  // clearing without stopping it lets the in-flight batch write the browsing
  // trail straight back after sign-out wiped it.
  stopWriting?.();
  stopWriting = null;
  knownGood.clear();
  hydration = null;
  hydratingFor = null;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* nothing to do */
  }
}

/** Test seam — whether the batching writer is running. */
export function __isWriting(): boolean {
  return stopWriting !== null;
}

/** Test seam — exercises the write path without waiting on a 5s batch. */
export function __writeForTest(events: NostrEvent[]): Promise<void> {
  return writeEvents(events);
}

/** Test seam. Closes the connection, which a `deleteDatabase` would block on. */
export async function __resetEventCache(): Promise<void> {
  hydration = null;
  hydratingFor = null;
  knownGood.clear();
  stopWriting?.();
  stopWriting = null;
  const closing = dbPromise;
  dbPromise = null;
  // Awaited: a connection still open when `deleteDatabase` runs blocks it
  // forever, and the next test then opens a database that was never dropped.
  await closing?.then((db) => db?.close()).catch(() => undefined);
}
