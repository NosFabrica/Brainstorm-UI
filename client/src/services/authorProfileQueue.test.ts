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
  searchRelay: () => ({ req: (...args: unknown[]) => { reqMock(...args); return frames; } }),
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (e: unknown) => e } }));
const loadReplaceableMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/loaders", () => ({ loadReplaceable: (...args: unknown[]) => loadReplaceableMock(...args) }));
const held = new Map<string, { event: NostrEvent; at: number }>();
vi.mock("@/lib/eventCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/eventCache")>();
  return {
    ...actual,
    readProfileRows: (pubkeys: string[]) => Promise.resolve(new Map([...held].filter(([pk]) => pubkeys.includes(pk)))),
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
  loadReplaceableMock.mockClear();
  held.clear();
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
});
