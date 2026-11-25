// @vitest-environment jsdom
/**
 * The shared author lookup: the device answers for people it already knows,
 * and only the rest are asked of the relay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const reqMock = vi.fn();
const frames = new Subject<{ type: string; event?: NostrEvent }>();
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({
    req: (...args: unknown[]) => {
      reqMock(...args);
      return frames;
    },
  }),
}));
/** What the memory store holds, by pubkey. */
const inStore = new Map<string, NostrEvent>();
/** What the store answers an add with: by default the event, as if kept. */
const addMock = vi.fn((e: unknown) => e);
vi.mock("@/lib/eventStore", () => ({
  eventStore: { add: (e: unknown) => addMock(e), getReplaceable: (_kind: number, pk: string) => inStore.get(pk) },
}));
const loadReplaceableMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/loaders", () => ({ loadReplaceable: (...args: unknown[]) => loadReplaceableMock(...args) }));
const held = new Map<string, { event: NostrEvent; at: number }>();
const readsMock = vi.fn();
/** When the device learned the store's copies that came off it, by event id. */
const learned = new Map<string, number>();
vi.mock("@/lib/eventCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/eventCache")>();
  return {
    ...actual,
    readProfileRows: (pubkeys: string[]) => {
      readsMock(pubkeys);
      return Promise.resolve(new Map([...held].filter(([pk]) => pubkeys.includes(pk))));
    },
    deviceLearnedAt: (event: NostrEvent) => learned.get(event.id),
  };
});

import { wantProfile, __resetAuthorProfileQueue } from "./authorProfileQueue";
import { PROFILE_FRESH_MS } from "@/lib/eventCache";

const profile = (pubkey: string): NostrEvent =>
  ({ id: `id-${pubkey}`, kind: 0, pubkey, tags: [], content: "{}", created_at: 1, sig: "s" }) as NostrEvent;
const settle = async () => {
  await vi.advanceTimersByTimeAsync(200);
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  reqMock.mockClear();
  addMock.mockReset();
  addMock.mockImplementation((e) => e);
  loadReplaceableMock.mockClear();
  readsMock.mockClear();
  held.clear();
  inStore.clear();
  learned.clear();
  __resetAuthorProfileQueue();
});
afterEach(() => vi.useRealTimers());

describe("the author queue and the device's own copy", () => {
  it("answers from the device without asking the relay", async () => {
    held.set("a".repeat(64), { event: profile("a".repeat(64)), at: Date.now() });
    const got: NostrEvent[] = [];
    wantProfile("a".repeat(64), (p) => got.push(p));
    await settle();
    expect(got.map((p) => p.pubkey)).toEqual(["a".repeat(64)]);
    expect(reqMock).not.toHaveBeenCalled();
  });

  it("asks the relay only for the people it does not know", async () => {
    held.set("a".repeat(64), { event: profile("a".repeat(64)), at: Date.now() });
    wantProfile("a".repeat(64), () => {});
    wantProfile("b".repeat(64), () => {});
    await settle();
    expect(reqMock).toHaveBeenCalledTimes(1);
    expect((reqMock.mock.calls[0][0] as { authors: string[] }).authors).toEqual(["b".repeat(64)]);
  });

  it("shows an old copy at once and asks after it, so the next visit is right", async () => {
    const stale = Date.now() - PROFILE_FRESH_MS - 1;
    held.set("d".repeat(64), { event: profile("d".repeat(64)), at: stale });
    const got: NostrEvent[] = [];
    wantProfile("d".repeat(64), (p) => got.push(p));
    await settle();
    expect(got).toHaveLength(1);
    expect(reqMock).toHaveBeenCalledTimes(1);
    expect((reqMock.mock.calls[0][0] as { authors: string[] }).authors).toEqual(["d".repeat(64)]);
  });

  // A copy is shown however old it is now, so an old one the search relay
  // cannot refresh — it does not index everyone — goes to the profile relays.
  it("asks the profile relays after an old copy the search relay has no answer for", async () => {
    const stale = Date.now() - PROFILE_FRESH_MS - 1;
    held.set("e".repeat(64), { event: profile("e".repeat(64)), at: stale });
    wantProfile("e".repeat(64), () => {});
    await settle();
    frames.next({ type: "EOSE" });
    await Promise.resolve();
    expect(loadReplaceableMock).toHaveBeenCalledWith(0, "e".repeat(64), { fromRelays: true });
  });

  it("leaves the profile relays alone when the search relay did refresh it", async () => {
    const stale = Date.now() - PROFILE_FRESH_MS - 1;
    held.set("f".repeat(64), { event: profile("f".repeat(64)), at: stale });
    wantProfile("f".repeat(64), () => {});
    await settle();
    frames.next({ type: "EVENT", event: { ...profile("f".repeat(64)), created_at: 2 } });
    frames.next({ type: "EOSE" });
    await Promise.resolve();
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("leaves a stale copy alone when the loader is already refreshing it", async () => {
    const { claimRefresh } = await import("@/lib/eventCache");
    const pk = "9".repeat(64);
    expect(claimRefresh(`0:${pk}:`, 0)).toBe(true); // the loader got there first
    held.set(pk, { event: profile(pk), at: Date.now() - PROFILE_FRESH_MS - 1 });
    const got: NostrEvent[] = [];
    wantProfile(pk, (p) => got.push(p));
    await settle();
    expect(got).toHaveLength(1); // still shown
    expect(reqMock).not.toHaveBeenCalled(); // not asked twice
  });
});

describe("the author queue and the store", () => {
  it("answers someone the store holds at once, without reading the device or asking a relay", async () => {
    const pk = "1".repeat(64);
    inStore.set(pk, profile(pk));
    const got: NostrEvent[] = [];
    wantProfile(pk, (p) => got.push(p));
    expect(got).toHaveLength(1); // no flush to wait for
    await settle();
    expect(readsMock).not.toHaveBeenCalled();
    expect(reqMock).not.toHaveBeenCalled();
  });

  it("still asks after an old device copy the store holds", async () => {
    const pk = "2".repeat(64);
    const copy = profile(pk);
    inStore.set(pk, copy);
    learned.set(copy.id, Date.now() - PROFILE_FRESH_MS - 1);
    const got: NostrEvent[] = [];
    wantProfile(pk, (p) => got.push(p));
    expect(got).toHaveLength(1);
    await settle();
    expect(readsMock).not.toHaveBeenCalled();
    expect(reqMock).toHaveBeenCalledTimes(1);
    expect((reqMock.mock.calls[0][0] as { authors: string[] }).authors).toEqual([pk]);
  });

  it("reads the device only for the queued people the store did not get meanwhile", async () => {
    const a = "3".repeat(64);
    const b = "4".repeat(64);
    const got: string[] = [];
    wantProfile(a, (p) => p && got.push(p.pubkey));
    wantProfile(b, () => {});
    inStore.set(a, profile(a)); // a search's device peek, before the queue flushes
    await settle();
    expect(got).toEqual([a]);
    expect(readsMock).toHaveBeenCalledWith([b]);
    expect((reqMock.mock.calls[0][0] as { authors: string[] }).authors).toEqual([b]);
  });
});

describe("the author queue and what the relay sends", () => {
  it("never hands on a profile the store refused, and counts its author unanswered", async () => {
    const pk = "5".repeat(64);
    addMock.mockImplementation(() => null);
    const got: (NostrEvent | null)[] = [];
    wantProfile(pk, (p) => got.push(p));
    await settle();
    frames.next({ type: "EVENT", event: profile(pk) });
    frames.next({ type: "EOSE" });
    await Promise.resolve();
    expect(got).toEqual([null]);
  });

  it("hands on the store's kept copy, not the relay's", async () => {
    const pk = "6".repeat(64);
    const winner = { ...profile(pk), id: "winner", created_at: 9 };
    addMock.mockImplementation(() => winner);
    const got: (NostrEvent | null)[] = [];
    wantProfile(pk, (p) => got.push(p));
    await settle();
    frames.next({ type: "EVENT", event: profile(pk) });
    frames.next({ type: "EOSE" });
    await Promise.resolve();
    expect(got).toEqual([winner]);
  });

  it("never hands on a device copy the store refused", async () => {
    const pk = "7".repeat(64);
    held.set(pk, { event: profile(pk), at: Date.now() });
    addMock.mockImplementation(() => null);
    const got: (NostrEvent | null)[] = [];
    wantProfile(pk, (p) => got.push(p));
    await settle();
    expect(got.filter(Boolean)).toEqual([]);
  });
});
