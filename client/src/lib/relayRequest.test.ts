// @vitest-environment node
/**
 * The fault these helpers exist to close: the old form raced
 * `firstValueFrom(pool.request(...))` against a bare `setTimeout`, and when the
 * timer won nothing unsubscribed the request — so the REQ stayed open against
 * every relay until EOSE, on a path taken on every page load.
 *
 * The pool is faked rather than mocked at the network layer, because what is
 * being asserted is subscription lifetime, and only the source can report that.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject, timeout } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const request = vi.fn();
vi.mock("./relayPool", () => ({ pool: { request: (...args: unknown[]) => request(...args) } }));
vi.mock("./eventStore", () => ({ eventStore: { add: (event: unknown) => event } }));

import { requestAll, requestNewest, requestOne } from "./relayRequest";

const RELAYS = ["wss://one", "wss://two"];
const FILTER = { kinds: [0], authors: ["a".repeat(64)] };

function event(id: string, created_at = 0): NostrEvent {
  return { id, created_at, kind: 0, pubkey: "p", tags: [], content: "", sig: "s" } as NostrEvent;
}

/**
 * A relay stream under the test's control, that reports its own teardown.
 *
 * It applies `timeout({ first })` exactly as `RelayGroup.request` does, because
 * `requestOne` leans on the pool for its deadline — a fake that skipped it would
 * be gentler than reality and would let a hang pass as green.
 */
function controllable() {
  const subject = new Subject<NostrEvent>();
  const torndown = { count: 0 };
  const source = new Observable<NostrEvent>((subscriber) => {
    const inner = subject.subscribe(subscriber);
    return () => {
      torndown.count++;
      inner.unsubscribe();
    };
  });
  request.mockImplementation((_relays, _filter, opts) =>
    source.pipe(timeout({ first: (opts as { timeout?: number })?.timeout ?? 30_000 })),
  );
  return { subject, torndown };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe("a request that no relay answers", () => {
  it("tears the subscription down instead of leaving the REQ open", async () => {
    const { torndown } = controllable();

    const pending = requestOne(RELAYS, FILTER, 1000);
    await vi.advanceTimersByTimeAsync(2000);

    // the pool's own `timeout` errors the stream, which unsubscribes it
    await expect(pending).resolves.toBeUndefined();
    expect(torndown.count).toBe(1);
  });

  it("hands the pool the deadline and the store, rather than racing a timer", () => {
    controllable();

    void requestOne(RELAYS, FILTER, 1000);

    expect(request).toHaveBeenCalledWith(RELAYS, FILTER, expect.objectContaining({ timeout: 1000 }));
    expect(request.mock.calls[0][2]).toHaveProperty("eventStore");
  });
});

describe("asking for one event", () => {
  it("takes the first answer and closes the request", async () => {
    const { subject, torndown } = controllable();

    const pending = requestOne(RELAYS, FILTER, 1000);
    subject.next(event("first"));

    await expect(pending).resolves.toMatchObject({ id: "first" });
    expect(torndown.count).toBe(1);
  });
});

describe("asking for the newest event", () => {
  it("waits out the window and picks the newest, not the fastest", async () => {
    const { subject } = controllable();

    const pending = requestNewest(RELAYS, FILTER, 1000);
    subject.next(event("stale", 100));
    subject.next(event("fresh", 200));
    subject.next(event("older", 150));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toMatchObject({ id: "fresh" });
  });

  it("breaks a created_at tie the way NIP-01 does", async () => {
    const { subject } = controllable();

    const pending = requestNewest(RELAYS, FILTER, 1000);
    subject.next(event("bbbb", 100));
    subject.next(event("aaaa", 100));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toMatchObject({ id: "aaaa" });
  });

  it("keeps what arrived when the window closes, rather than losing it", async () => {
    const { subject, torndown } = controllable();

    const pending = requestNewest(RELAYS, FILTER, 1000);
    subject.next(event("arrived", 100));
    await vi.advanceTimersByTimeAsync(5000); // relays never EOSE

    await expect(pending).resolves.toMatchObject({ id: "arrived" });
    expect(torndown.count).toBe(1);
  });

  it("is undefined when nothing answers", async () => {
    controllable();

    const pending = requestNewest(RELAYS, FILTER, 1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBeUndefined();
  });
});

describe("asking for everything", () => {
  it("de-dupes by id across relays", async () => {
    const { subject } = controllable();

    const pending = requestAll(RELAYS, FILTER, 1000);
    subject.next(event("one"));
    subject.next(event("two"));
    subject.next(event("one")); // the second relay's copy
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toHaveLength(2);
  });

  it("stops early once the caller has what it asked for", async () => {
    const { subject, torndown } = controllable();

    const pending = requestAll(RELAYS, FILTER, 60_000, { enough: (c) => c.size >= 2 });
    subject.next(event("one"));
    subject.next(event("two"));

    // resolves without anyone advancing the clock to the deadline
    await expect(pending).resolves.toHaveLength(2);
    expect(torndown.count).toBe(1);
  });

  it("returns what it collected when the window closes", async () => {
    const { subject } = controllable();

    const pending = requestAll(RELAYS, FILTER, 1000, { enough: (c) => c.size >= 99 });
    subject.next(event("one"));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toHaveLength(1);
  });

  it("is empty when nothing answers", async () => {
    controllable();

    const pending = requestAll(RELAYS, FILTER, 1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toEqual([]);
  });
});
