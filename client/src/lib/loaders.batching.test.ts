// @vitest-environment node
/**
 * What actually leaves the machine when the app resolves people on screen.
 *
 * Two properties, both about REQ count, both easy to lose by accident in a
 * caller far from here:
 *
 * 1. A profile (kind 0) and its author's relay list (kind 10002) asked for in
 *    the same buffer window travel in ONE REQ. `fetchProfiles` warms the
 *    routing table beside the profile load for exactly this reason.
 * 2. Naming the lookup set as a pointer's relay hint does not send that REQ
 *    twice.
 *
 * Node, not jsdom: nothing here is signed, but the loaders' siblings run in
 * node and the pool mock is realm-sensitive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { of } from "rxjs";
import type { Filter } from "nostr-tools";

const requests: Array<{ relays: string[]; filters: Filter[] }> = [];

vi.mock("./relayPool", () => ({
  pool: {
    request: (relays: string[], filters: Filter[]) => {
      requests.push({ relays, filters });
      return of();
    },
  },
}));
vi.mock("./eventStore", () => ({
  eventStore: { getReplaceable: () => undefined, getEvent: () => undefined, add: (e: unknown) => e },
}));
vi.mock("./eventCache", () => ({
  cachedEventsForFilters: () => of(),
  whenHydrated: () => Promise.resolve(),
}));
vi.mock("./relays", () => ({
  PROFILE_RELAYS: ["wss://lookup.one/", "wss://lookup.two/"],
  CONTENT_RELAYS: ["wss://content.example/"],
}));

const LOOKUP = ["wss://lookup.one/", "wss://lookup.two/"];
const A = "a".repeat(64);
const B = "b".repeat(64);

let loaders: typeof import("./loaders");

beforeEach(async () => {
  vi.resetModules();
  requests.length = 0;
  loaders = await import("./loaders");
});

/** Every kind this REQ asks about, across all of its filters. */
const kindsIn = (req: { filters: Filter[] }) =>
  new Set(req.filters.flatMap((filter) => filter.kinds ?? []));

describe("what one window of pointers puts on the wire", () => {
  it("carries a profile and its author's relay list in a single REQ", async () => {
    await Promise.all([
      loaders.loadReplaceable(0, A, { timeoutMs: 400 }),
      loaders.loadReplaceable(0, B, { timeoutMs: 400 }),
      loaders.loadReplaceable(10002, A, { relays: LOOKUP, timeoutMs: 400 }),
      loaders.loadReplaceable(10002, B, { relays: LOOKUP, timeoutMs: 400 }),
    ]);

    expect(requests).toHaveLength(1);
    expect(kindsIn(requests[0])).toEqual(new Set([0, 10002]));
    // Both authors, whichever way applesauce chose to group them.
    const authors = new Set(requests[0].filters.flatMap((f) => f.authors ?? []));
    expect(authors).toEqual(new Set([A, B]));
  });

  /**
   * The sequence asks a pointer's hints before it asks `lookupRelays`. Naming
   * the lookup set as the hint used to send the same REQ to the same relays
   * twice — the second could never answer anything the first had not.
   */
  it("does not ask the lookup relays twice when they were named as the hint", async () => {
    await loaders.loadReplaceable(10002, A, { relays: LOOKUP, timeoutMs: 400 });

    expect(requests).toHaveLength(1);
    expect(requests[0].relays).toEqual(LOOKUP);
  });

  /**
   * A hint that is not the lookup set is still asked first, and narrowly: a
   * caller naming one relay must not be widened into all of them.
   */
  it("still asks a real hint first, and only that hint", async () => {
    await loaders.loadReplaceable(10002, A, { relays: ["wss://hinted.example/"], timeoutMs: 400 });

    expect(requests[0].relays).toEqual(["wss://hinted.example/"]);
    expect(requests[1].relays).toEqual(LOOKUP);
  });

  /** A subset of the lookup set is a narrower ask, so it stays a hint. */
  it("keeps a hint that is only part of the lookup set", async () => {
    await loaders.loadReplaceable(10002, A, { relays: ["wss://lookup.one/"], timeoutMs: 400 });

    expect(requests[0].relays).toEqual(["wss://lookup.one/"]);
  });
});
