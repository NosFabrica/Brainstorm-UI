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
import { IDBFactory } from "fake-indexeddb";

const storeAdd = vi.fn((event: NostrEvent) => event);
const storeReplaceable = vi.fn((..._a: unknown[]): NostrEvent | undefined => undefined);
const loadReplaceableMock = vi.fn(async (..._a: unknown[]) => undefined);
const snapshot: { event?: unknown } = {};

vi.mock("./eventStore", () => ({
  eventStore: {
    add: (e: NostrEvent) => storeAdd(e),
    getReplaceable: (...a: unknown[]) => storeReplaceable(...a),
    insert$: { subscribe: () => ({ unsubscribe() {} }) },
  },
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

const signed = (kind: number, tags: string[][] = [], secret = SECRET, created_at = 1): NostrEvent =>
  finalizeEvent({ kind, created_at, tags, content: "" } as never, secret) as NostrEvent;

let cache: typeof import("./eventCache");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  delete snapshot.event;
  // A fresh device each time — no connection to close, no delete to be blocked.
  indexedDB = new IDBFactory();
  cache = await import("./eventCache");
  cache.__useCacheStore(undefined);
});

afterEach(() => {
  cache.__resetEventCache();
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

  /**
   * And it has to re-ask the right relays. A pointer with no relays reaches the
   * lookup set and nothing else, so app-data and the trust declaration — which
   * live on the user's OWN relays — would be "refreshed" against relays that
   * never had them, and the stale disk copy would serve for the whole session.
   */
  it("refreshes on the relays the cached list names, not the default set", async () => {
    await cache.writeEvents([
      signed(10002, [["r", "wss://mine.example", "write"]]),
      signed(10040, [["30382:rank", "a".repeat(64), "wss://ta.example"]]),
    ]);

    await cache.hydrateEventStore(ME);
    await vi.waitFor(() =>
      expect(loadReplaceableMock.mock.calls.filter((c) => c[0] === 10040)).toHaveLength(1),
    );

    // Every refresh this hydration started names the cached list's write
    // relays. Counted by kind rather than in total: a previous case's
    // fire-and-forget revalidation can still be landing.
    for (const kind of [10002, 10040]) {
      const call = loadReplaceableMock.mock.calls.find((c) => c[0] === kind);
      expect(call?.[2]).toMatchObject({ relays: ["wss://mine.example/"] });
    }
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
  /** Every row on the device, whatever its kind. */
  const readAll = async () => {
    const events = await cache.cachedEventsForFilters([
      { authors: [ME, ...Array.from({ length: 520 }, (_, i) => i.toString(16).padStart(64, "0"))] },
    ]);
    return events;
  };

  it("survives a reload — a cached relay list hydrates on the next boot", async () => {
    const relayList = signed(10002, [["r", "wss://mine.example"]]);
    await cache.writeEvents([relayList]);

    cache.__resetEventCache(); // as a page unload would
    vi.resetModules();
    const fresh = await import("./eventCache");
    const added = await fresh.hydrateEventStore(ME);
    cache = fresh; // so afterEach closes the connection that is actually open

    expect(added).toBe(1);
    expect(storeAdd.mock.calls[0][0]).toMatchObject({ kind: 10002 });
  });

  it("keeps only the kinds worth a disk read", async () => {
    // A profile and a relay list are both worth one; a note is not.
    await cache.writeEvents([signed(10002), signed(0), signed(1, [["t", "note"]])]);

    expect(new Set((await readAll()).map((e) => e.kind))).toEqual(new Set([0, 10002]));
  });

  it("one row per coordinate, not one per version", async () => {
    // Both really signed: a mutated copy would be rejected as tampered, which
    // would prove nothing about the keying.
    await cache.writeEvents([signed(10040), signed(10040, [], SECRET, 99)]);

    const held = await readAll();
    expect(held).toHaveLength(1);
    expect(held[0].created_at).toBe(99);
  });

  /** Unbounded growth is the failure mode a cache nobody prunes always has. */
  it("stays under its cap", async () => {
    const one = signed(10040);
    const many = Array.from({ length: cache.MAX_CACHED + 20 }, (_, i) => ({
      ...one,
      pubkey: i.toString(16).padStart(64, "0"),
    })) as NostrEvent[];

    await cache.writeEvents(many);

    expect((await readAll()).length).toBeLessThanOrEqual(cache.MAX_CACHED);
  });

  /**
   * `persistEventsToCache` batches for five seconds. Clearing without stopping
   * it lets the in-flight batch write the browsing trail straight back after
   * sign-out has wiped it.
   */
  it("stops writing when the cache is cleared", async () => {
    cache.startEventCacheSync();

    await cache.clearEventCache();

    expect(cache.__isWriting()).toBe(false);
  });

  /**
   * Anything that opens `brainstorm-events` without naming a version creates it
   * at version 1 with no object store — and `onupgradeneeded` never fires again
   * at that version, so every transaction would throw, be swallowed, and the
   * cache would be silently dead for the life of the browser profile.
   */
  it("repairs a database that exists without its object store", async () => {
    cache.__resetEventCache();
    await new Promise<void>((resolve) => {
      const request = indexedDB.open("brainstorm-events"); // versionless, no store
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => resolve();
    });

    await cache.writeEvents([signed(10002)]);

    expect(await readAll()).toHaveLength(1);
  });

  it("forgets everything on sign-out", async () => {
    await cache.writeEvents([signed(10002)]);

    await cache.clearEventCache();

    expect(await readAll()).toHaveLength(0);
  });
});

/**
 * What the address loader is answered with. The sequence stops at its first
 * hit, so anything served here is something the relays are NOT asked about —
 * which is the win, and the reason for both the refresh of stale copies and
 * the signature check.
 */
describe("the device connection", () => {
  it("opens the database once for many reads and writes", async () => {
    const opens = vi.spyOn(indexedDB, "open");
    await cache.writeEvents([signed(10002)]);
    await cache.cachedEventsForFilters([{ kinds: [10002], authors: [ME] }]);
    await cache.readProfileRows([ME]);
    await cache.writeEvents([signed(10040)]);
    expect(opens).toHaveBeenCalledTimes(1);
    opens.mockRestore();
  });

  it("reads only the authors asked about", async () => {
    await cache.writeEvents([signed(10002), signed(10002, [], OTHER_SECRET)]);
    const found = await cache.cachedEventsForFilters([{ kinds: [10002], authors: [OTHER] }]);
    expect(found.map((e) => e.pubkey)).toEqual([OTHER]);
  });
});

describe("answering the loader from disk", () => {
  const ask = (filter: Record<string, unknown>) => cache.cachedEventsForFilters([filter as never]);

  it("serves an event it holds for the asked author and kind", async () => {
    const relayList = signed(10002, [["r", "wss://mine.example"]]);
    await cache.writeEvents([relayList]);

    const found = await ask({ kinds: [10002], authors: [ME] });

    expect(found.map((e) => e.id)).toEqual([relayList.id]);
  });

  it("does not answer for a kind that was not asked for", async () => {
    await cache.writeEvents([signed(10002)]);

    expect(await ask({ kinds: [0], authors: [ME] })).toEqual([]);
  });

  /**
   * No kind cached here is addressable today, so the loader will not send a
   * `#d`. The matching stays, and stays covered, because the day one is added
   * a filter that ignored `#d` would hand back the wrong row.
   */
  it("matches the d tag when a filter carries one", async () => {
    await cache.writeEvents([signed(10040, [["d", "prefs"]])]);

    expect(await ask({ kinds: [10040], authors: [ME], "#d": ["other"] })).toEqual([]);
    expect(await ask({ kinds: [10040], authors: [ME], "#d": ["prefs"] })).toHaveLength(1);
  });

  it("does not answer for an author nobody asked about", async () => {
    await cache.writeEvents([signed(10002)]);

    expect(await ask({ kinds: [10002], authors: [OTHER] })).toEqual([]);
  });

  /**
   * Staleness has to be bounded: a hit means the loader never asks the relays.
   * Routing is kept until evicted (Vitor, 2026-09-24), so a stale copy still
   * answers — an old relay list routes better than the default set — and the
   * bound is a refresh sent to the relays behind it.
   *
   * Only the clock is moved, not the timers — fake-indexeddb schedules its own
   * work on real ones, and faking those deadlocks every read.
   */
  it("answers with a fresh entry and asks nobody", async () => {
    await cache.writeEvents([signed(10002)]);
    expect(await ask({ kinds: [10002], authors: [ME] })).toHaveLength(1);
    await Promise.resolve();
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("still answers once the entry is stale, and refreshes it from the relays", async () => {
    await cache.writeEvents([signed(10002)]);
    const later = Date.now() + 31 * 60_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    try {
      expect(await ask({ kinds: [10002], authors: [ME] })).toHaveLength(1);
      await vi.waitFor(() => expect(loadReplaceableMock).toHaveBeenCalledTimes(1));
      expect(loadReplaceableMock.mock.calls[0].slice(0, 2)).toEqual([10002, ME]);
      expect(loadReplaceableMock.mock.calls[0][2]).toMatchObject({ fromRelays: true });

      // One refresh covers every read inside the window.
      await ask({ kinds: [10002], authors: [ME] });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(loadReplaceableMock).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  // Every copy served from the device goes back through the store and so to
  // the writer; rewriting an identical copy reset its age on every read, and a
  // copy read often was never refreshed.
  it("does not make an entry fresh again by writing the same copy back", async () => {
    const list = signed(10002);
    await cache.writeEvents([list]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    try {
      await cache.writeEvents([list]); // the served copy, written back
      await ask({ kinds: [10002], authors: [ME] });
      await vi.waitFor(() => expect(loadReplaceableMock).toHaveBeenCalledTimes(1));
    } finally {
      clock.mockRestore();
    }
  });

  it("refreshes a stale relay list where relay lists are indexed, and a 10040 on a few of its author's relays", async () => {
    const outbox = ["a", "b", "c", "d", "e", "f"].map((x) => ["r", `wss://${x}.example/`]);
    storeReplaceable.mockImplementation((kind) => (kind === 10002 ? signed(10002, outbox) : undefined));
    await cache.writeEvents([signed(10002), signed(10040)]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    try {
      await ask({ kinds: [10002, 10040], authors: [ME] });
      await vi.waitFor(() => expect(loadReplaceableMock).toHaveBeenCalledTimes(2));
      const byKind = new Map(loadReplaceableMock.mock.calls.map((call) => [call[0], call[2] as { relays?: string[] }]));
      expect(byKind.get(10002)?.relays).toBeUndefined();
      expect(byKind.get(10040)?.relays).toHaveLength(4);
    } finally {
      clock.mockRestore();
      storeReplaceable.mockReset();
    }
  });

  it("keeps a routing entry however old it is", async () => {
    await cache.writeEvents([signed(10002)]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 365 * 24 * 3600_000);
    try {
      expect(await ask({ kinds: [10002], authors: [ME] })).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("refuses a tampered row rather than handing it to the loader", async () => {
    await cache.writeEvents([{ ...signed(10002), sig: "0".repeat(128) } as NostrEvent]);

    expect(await ask({ kinds: [10002], authors: [ME] })).toEqual([]);
  });
});
