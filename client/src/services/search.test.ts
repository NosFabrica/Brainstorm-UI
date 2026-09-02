// @vitest-environment jsdom
/**
 * The relay-backed search seam. The relay is faked at the transport edge
 * (lib/searchRelay) with a controllable frame stream that reports its own
 * teardown — what these tests assert is behavior the UI depends on:
 * what goes on the wire, how snapshots arrive, and that cancellation is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

interface ReqFrame {
  type: "OPEN" | "EVENT" | "EOSE" | "CLOSED";
  from: string;
  id: string;
  event?: NostrEvent;
  reason?: string;
  filters?: unknown[];
}

const reqMock = vi.fn();
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (...args: unknown[]) => reqMock(...args) }),
}));
const houseMock = vi.fn(() => Promise.resolve<string | null>("f".repeat(64)));
vi.mock("@/services/trustSource", () => ({
  resolveHouseObserver: () => houseMock(),
}));
const getReplaceableMock = vi.fn<(kind: number, pubkey: string) => NostrEvent | undefined>(() => undefined);
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (kind: number, pubkey: string) => getReplaceableMock(kind, pubkey),
    add: (event: unknown) => event,
  },
}));

import { searchStream, suggestProfiles, kindsForTab, TAB_KINDS, type SearchSnapshot } from "./search";

const HOUSE = "f".repeat(64);

function controllable() {
  const subject = new Subject<ReqFrame>();
  const torndown = { count: 0 };
  const source = new Observable<ReqFrame>((subscriber) => {
    const inner = subject.subscribe(subscriber);
    return () => {
      torndown.count++;
      inner.unsubscribe();
    };
  });
  reqMock.mockImplementation(() => source);
  return { subject, torndown };
}

function ev(id: string, kind = 0, pubkey = "a".repeat(64), content = "{}"): NostrEvent {
  return { id, kind, pubkey, tags: [], content, created_at: 1, sig: "s" } as NostrEvent;
}

const frame = (event: NostrEvent): ReqFrame => ({ type: "EVENT", from: "wss://x", id: "s", event });
const EOSE: ReqFrame = { type: "EOSE", from: "wss://x", id: "s" };

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => vi.clearAllMocks());

describe("searchStream", () => {
  it("streams people hits incrementally, with the house observer on the wire", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];

    searchStream("jack", { tab: "people", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick(); // observer resolution is async — the REQ opens after it

    // The wire: query text passes through verbatim, observer appended, tab → kinds.
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filter = reqMock.mock.calls[0][0] as { kinds?: number[]; search: string; limit: number };
    expect(filter.kinds).toEqual([0]);
    expect(filter.search).toBe(`jack observer:${HOUSE}`);
    expect(filter.limit).toBeGreaterThan(0);

    subject.next(frame(ev("e1", 0, "b".repeat(64), JSON.stringify({ name: "jack" }))));
    await tick();
    expect(snaps.at(-1)!.hits).toHaveLength(1);
    expect(snaps.at(-1)!.eose).toBe(false);
    expect(snaps.at(-1)!.hits[0].author?.name).toBe("jack");

    subject.next(frame(ev("e2", 0, "c".repeat(64))));
    subject.next(EOSE);
    await tick();
    const last = snaps.at(-1)!;
    expect(last.hits.map((h) => h.event.id)).toEqual(["e1", "e2"]);
    expect(last.eose).toBe(true);
    expect(last.error).toBeNull();
  });
});

describe("cancellation", () => {
  it("tears the REQ down and never calls back after cancel", async () => {
    const { subject, torndown } = controllable();
    const snaps: SearchSnapshot[] = [];

    const cancel = searchStream("jack", { tab: "people", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    subject.next(frame(ev("e1")));
    await tick();
    const before = snaps.length;

    cancel();
    expect(torndown.count).toBe(1);
    subject.next(frame(ev("e2")));
    subject.next(EOSE);
    await tick();
    expect(snaps.length).toBe(before);
  });

  it("cancelling before the observer resolves opens no REQ at all", async () => {
    controllable();
    const cancel = searchStream("jack", { tab: "people", pov: "nosfabrica" }, () => {});
    cancel(); // synchronously, before the async observer resolution finishes
    await tick();
    expect(reqMock).not.toHaveBeenCalled();
  });
});

describe("the observer lens", () => {
  it("uses the user's own pubkey for mywot", async () => {
    controllable();
    const me = "1".repeat(64);
    searchStream("jack", { tab: "people", pov: "mywot", userPubkey: me }, () => {});
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe(`jack observer:${me}`);
  });

  it("never double-tags a query that already names a lens", async () => {
    controllable();
    searchStream("jack observer:" + "2".repeat(64), { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    searchStream("jack include:spam", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe("jack observer:" + "2".repeat(64));
    expect((reqMock.mock.calls[1][0] as { search: string }).search).toBe("jack include:spam");
  });

  it("falls back to include:spam when no observer can be resolved", async () => {
    // The relay refuses lens-less reads outright — a missing house observer
    // must degrade to the unranked corpus, not a dead search box.
    houseMock.mockResolvedValueOnce(null);
    controllable();
    searchStream("jack", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe("jack include:spam");
  });
});

describe("failure surfaces honestly", () => {
  it("a CLOSED reason lands in the snapshot error", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    searchStream("x", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    subject.next({ type: "CLOSED", from: "wss://x", id: "s", reason: "auth-required: no lens" });
    await tick();
    expect(snaps.at(-1)!.error).toContain("auth-required");
  });
});

describe("suggestProfiles", () => {
  it("resolves at EOSE with deduped profiles, capped at the limit", async () => {
    const { subject } = controllable();
    const pending = suggestProfiles("ja", { pov: "nosfabrica" }, { limit: 2 });
    await tick();
    subject.next(frame(ev("p1", 0, "a".repeat(64), JSON.stringify({ name: "jack" }))));
    subject.next(frame(ev("p1b", 0, "a".repeat(64), JSON.stringify({ name: "jack dupe" }))));
    subject.next(frame(ev("p2", 0, "b".repeat(64), JSON.stringify({ name: "jane" }))));
    subject.next(frame(ev("p3", 0, "c".repeat(64), JSON.stringify({ name: "jam" }))));
    subject.next(EOSE);
    const results = await pending;
    expect(results.map((r) => r.name)).toEqual(["jack", "jane"]);
  });
});

/** Multi-REQ fake: every req() call gets its own subject; filters recorded. */
function multiReq() {
  const calls: { filter: Record<string, unknown>; subject: Subject<ReqFrame> }[] = [];
  reqMock.mockImplementation((filter: Record<string, unknown>) => {
    const subject = new Subject<ReqFrame>();
    calls.push({ filter, subject });
    return new Observable<ReqFrame>((subscriber) => {
      const inner = subject.subscribe(subscriber);
      return () => inner.unsubscribe();
    });
  });
  return calls;
}

describe("author hydration", () => {
  it("batches unknown authors into one kind-0 REQ and re-emits with profiles", async () => {
    vi.useFakeTimers();
    try {
      const calls = multiReq();
      const snaps: SearchSnapshot[] = [];
      const alice = "a".repeat(64);
      const bob = "b".repeat(64);
      // Bob's profile is already in the event store — he must NOT be re-fetched.
      getReplaceableMock.mockImplementation((_k, pubkey) =>
        pubkey === bob ? ev("known", 0, bob, JSON.stringify({ name: "bob (cached)" })) : undefined,
      );

      searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
      await tick();
      calls[0].subject.next(frame(ev("n1", 1, alice, "note by alice")));
      calls[0].subject.next(frame(ev("n2", 1, bob, "note by bob")));
      calls[0].subject.next({ type: "EOSE", from: "wss://x", id: "s" });
      await tick();

      // Bob resolved synchronously from the store; alice pending.
      const atEose = snaps.at(-1)!;
      expect(atEose.hits.find((h) => h.event.id === "n2")!.author?.name).toBe("bob (cached)");
      expect(atEose.hits.find((h) => h.event.id === "n1")!.author).toBeNull();

      await vi.advanceTimersByTimeAsync(200); // hydration debounce elapses
      expect(calls).toHaveLength(2);
      expect(calls[1].filter.kinds).toEqual([0]);
      expect(calls[1].filter.authors).toEqual([alice]);
      expect(calls[1].filter.search).toBe("include:spam"); // the relay refuses lens-less reads

      calls[1].subject.next(frame(ev("prof", 0, alice, JSON.stringify({ name: "alice" }))));
      calls[1].subject.next({ type: "EOSE", from: "wss://x", id: "h" });
      await tick();
      expect(snaps.at(-1)!.hits.find((h) => h.event.id === "n1")!.author?.name).toBe("alice");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("kindsForTab", () => {
  it("maps every vertical and leaves Everything unconstrained", () => {
    expect(kindsForTab("people")).toEqual([0]);
    expect(kindsForTab("notes")).toEqual(TAB_KINDS.notes);
    expect(kindsForTab("everything")).toBeUndefined();
  });
});
