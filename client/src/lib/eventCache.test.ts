// @vitest-environment node
/**
 * The durable cache for the events the app's routing and identity are made of.
 *
 * Node, not jsdom: events are really signed here so the verification this
 * module does is the real thing, and jsdom's foreign-realm Uint8Array fails
 * @noble's checks (see `test/setup.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools";
import "fake-indexeddb/auto";

const storeAdd = vi.fn((event: NostrEvent) => event);
const loadReplaceableMock = vi.fn(async () => undefined);
const snapshot: { event?: unknown } = {};

vi.mock("./eventStore", () => ({
  eventStore: { add: (e: NostrEvent) => storeAdd(e), insert$: { pipe: () => ({ subscribe: () => ({ unsubscribe() {} }) }) } },
}));
vi.mock("./loaders", () => ({
  loadReplaceable: (...a: unknown[]) => loadReplaceableMock(...(a as [])),
}));
vi.mock("./followStore", () => ({
  loadKnownFollowList: () => (snapshot.event ? { event: snapshot.event, count: 1, updated_at: 1 } : null),
}));

const SECRET = new Uint8Array(32).fill(7);
const ME = getPublicKey(SECRET);
const OTHER_SECRET = generateSecretKey();
const OTHER = getPublicKey(OTHER_SECRET);

const signed = (kind: number, tags: string[][] = [], secret = SECRET): NostrEvent =>
  finalizeEvent({ kind, created_at: 1, tags, content: "" } as never, secret) as NostrEvent;

let cache: typeof import("./eventCache");

/** An open connection blocks `deleteDatabase` forever, so close it first. */
const dropDb = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("brainstorm-events");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  delete snapshot.event;
  cache = await import("./eventCache");
});

afterEach(async () => {
  cache.__resetEventCache();
  await dropDb();
});

describe("hydrating the store at boot", () => {
  /** Phase 0: every existing user already has this snapshot on disk. */
  it("puts the saved contact list in the store without asking a relay", async () => {
    snapshot.event = signed(3, [["p", OTHER]]);

    const added = await cache.hydrateEventStore(ME);

    expect(added).toBe(1);
    expect(storeAdd.mock.calls[0][0]).toMatchObject({ kind: 3, pubkey: ME });
  });

  /**
   * IndexedDB is writable by anything that can run script on this origin, and a
   * forged kind-10002 would steer where we PUBLISH.
   */
  it("refuses an event whose signature does not check out", async () => {
    snapshot.event = { ...signed(3), sig: "0".repeat(128) };

    expect(await cache.hydrateEventStore(ME)).toBe(0);
    expect(storeAdd).not.toHaveBeenCalled();
  });

  it("refuses an event signed by somebody else", async () => {
    snapshot.event = signed(3, [], OTHER_SECRET);

    expect(await cache.hydrateEventStore(ME)).toBe(0);
    expect(storeAdd).not.toHaveBeenCalled();
  });

  it("does nothing at all when nobody is signed in", async () => {
    snapshot.event = signed(3);

    expect(await cache.hydrateEventStore(null)).toBe(0);
    expect(storeAdd).not.toHaveBeenCalled();
  });

  /**
   * The address loader STOPS at its first hit and `loadReplaceable` returns a
   * held event without asking anyone — so hydrating without refreshing would
   * pin a user to the relay list they had when the cache was written, forever.
   */
  it("re-asks the relays for everything it hydrated", async () => {
    snapshot.event = signed(3);

    await cache.hydrateEventStore(ME);
    await vi.waitFor(() => expect(loadReplaceableMock).toHaveBeenCalled());

    expect(loadReplaceableMock).toHaveBeenCalledWith(
      3,
      ME,
      expect.objectContaining({ fromRelays: true }),
    );
  });

  it("hydrates once per account, however often it is asked", async () => {
    snapshot.event = signed(3);

    await Promise.all([cache.hydrateEventStore(ME), cache.hydrateEventStore(ME)]);

    expect(storeAdd).toHaveBeenCalledTimes(1);
  });

  /** Switching accounts must hydrate the one switched TO, not re-hand the old. */
  it("hydrates again for a different account", async () => {
    snapshot.event = signed(3);
    await cache.hydrateEventStore(ME);
    snapshot.event = signed(3, [], OTHER_SECRET);

    await cache.hydrateEventStore(OTHER);

    expect(storeAdd.mock.calls.map((c) => c[0].pubkey)).toEqual([ME, OTHER]);
  });
});

describe("waiting on the cache", () => {
  it("resolves immediately when no hydration was started", async () => {
    await expect(cache.whenHydrated()).resolves.toBeUndefined();
  });

  it("resolves only once hydration has finished", async () => {
    snapshot.event = signed(3);
    let done = false;
    void cache.hydrateEventStore(ME).then(() => { done = true; });

    await cache.whenHydrated();

    expect(done).toBe(true);
  });
});

describe("what goes to disk", () => {
  /** Closes its connection — a leaked one blocks the next `deleteDatabase`. */
  const readAll = () =>
    new Promise<unknown[]>((resolve) => {
      const open = indexedDB.open("brainstorm-events", 1);
      open.onsuccess = () => {
        const db = open.result;
        const done = (rows: unknown[]) => {
          db.close();
          resolve(rows);
        };
        try {
          const req = db.transaction("events", "readonly").objectStore("events").getAll();
          req.onsuccess = () => done(req.result);
          req.onerror = () => done([]);
        } catch {
          done([]);
        }
      };
      open.onerror = () => resolve([]);
    });

  it("survives a reload — a cached relay list hydrates on the next boot", async () => {
    const relayList = signed(10002, [["r", "wss://mine.example"]]);
    await cache.__writeForTest([relayList]);

    cache.__resetEventCache(); // as a page unload would
    vi.resetModules();
    const fresh = await import("./eventCache");
    const added = await fresh.hydrateEventStore(ME);
    cache = fresh; // so afterEach closes the connection that is actually open

    expect(added).toBe(1);
    expect(storeAdd.mock.calls[0][0]).toMatchObject({ kind: 10002 });
  });

  it("keeps only the kinds worth a disk read", async () => {
    await cache.__writeForTest([signed(10002), signed(1, [["t", "note"]])]);

    const rows = (await readAll()) as { event: NostrEvent }[];
    expect(rows.map((r) => r.event.kind)).toEqual([10002]);
  });

  it("one row per coordinate, not one per version", async () => {
    await cache.__writeForTest([signed(0), { ...signed(0), created_at: 99 } as NostrEvent]);

    expect(await readAll()).toHaveLength(1);
  });

  /** Unbounded growth is the failure mode a cache nobody prunes always has. */
  it("stays under its cap", async () => {
    const one = signed(0);
    const many = Array.from({ length: 520 }, (_, i) => ({
      ...one,
      pubkey: i.toString(16).padStart(64, "0"),
    })) as NostrEvent[];

    await cache.__writeForTest(many);

    expect((await readAll()).length).toBeLessThanOrEqual(500);
  });

  it("forgets everything on sign-out", async () => {
    await cache.__writeForTest([signed(10002)]);

    await cache.clearEventCache();

    expect(await readAll()).toHaveLength(0);
  });
});

/**
 * What the address loader is answered with. The sequence stops at its first
 * hit, so anything served here is something the relays are NOT asked about —
 * which is the win, and the reason for both the expiry and the signature check.
 */
describe("answering the loader from disk", () => {
  const ask = (filter: Record<string, unknown>) => cache.cachedEventsForFilters([filter as never]);

  it("serves an event it holds for the asked author and kind", async () => {
    const relayList = signed(10002, [["r", "wss://mine.example"]]);
    await cache.__writeForTest([relayList]);

    const found = await ask({ kinds: [10002], authors: [ME] });

    expect(found.map((e) => e.id)).toEqual([relayList.id]);
  });

  it("does not answer for a kind that was not asked for", async () => {
    await cache.__writeForTest([signed(10002)]);

    expect(await ask({ kinds: [0], authors: [ME] })).toEqual([]);
  });

  it("matches the d tag for addressable kinds", async () => {
    await cache.__writeForTest([signed(30078, [["d", "prefs"]])]);

    expect(await ask({ kinds: [30078], authors: [ME], "#d": ["other"] })).toEqual([]);
    expect(await ask({ kinds: [30078], authors: [ME], "#d": ["prefs"] })).toHaveLength(1);
  });

  it("does not answer for an author nobody asked about", async () => {
    await cache.__writeForTest([signed(10002)]);

    expect(await ask({ kinds: [10002], authors: [OTHER] })).toEqual([]);
  });

  /**
   * Staleness has to be bounded: a hit means the relays are never consulted.
   *
   * Only the clock is moved, not the timers — fake-indexeddb schedules its own
   * work on real ones, and faking those deadlocks every read.
   */
  it("stops answering once the entry is stale", async () => {
    await cache.__writeForTest([signed(10002)]);
    expect(await ask({ kinds: [10002], authors: [ME] })).toHaveLength(1);

    const later = Date.now() + 31 * 60_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    try {
      expect(await ask({ kinds: [10002], authors: [ME] })).toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });

  it("refuses a tampered row rather than handing it to the loader", async () => {
    await cache.__writeForTest([{ ...signed(10002), sig: "0".repeat(128) } as NostrEvent]);

    expect(await ask({ kinds: [10002], authors: [ME] })).toEqual([]);
  });
});
