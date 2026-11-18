// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const publish = vi.fn((_event: NostrEvent, _opts?: unknown) => Promise.resolve({ ok: true, from: "search" }));
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => ({ publish }) }));

/** A fresh module: what a new session starts from, with only storage carried over. */
const load = async () => {
  vi.resetModules();
  return import("./searchSeed");
};

const ev = (over: Partial<NostrEvent> = {}): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "f".repeat(64),
    kind: 1,
    tags: [],
    content: "hi",
    created_at: 10,
    sig: "s",
    ...over,
  }) as NostrEvent;

beforeEach(() => {
  publish.mockClear();
  localStorage.clear();
});

describe("searchLacks", () => {
  it("is true when search answered without it", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(ev(), undefined, true)).toBe(true);
  });

  it("is false when search was not heard from: a refusal or timeout is not an absence", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(ev(), undefined, false)).toBe(false);
  });

  it("is false when search holds the same event, or a newer version", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(ev(), ev(), true)).toBe(false);
    expect(searchLacks(ev({ created_at: 10 }), ev({ id: "b".repeat(64), created_at: 11 }), true)).toBe(false);
  });

  it("is true when the relays found a newer version than search's", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(ev({ created_at: 12 }), ev({ id: "b".repeat(64), created_at: 11 }), true)).toBe(true);
  });

  it("never hands over what search has no use for: protected, ephemeral, expired", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(ev({ tags: [["-"]] }), undefined, true)).toBe(false);
    expect(searchLacks(ev({ kind: 20001 }), undefined, true)).toBe(false);
    expect(searchLacks(ev({ tags: [["expiration", "1"]] }), undefined, true)).toBe(false);
    expect(searchLacks(ev({ tags: [["expiration", String(4_000_000_000)]] }), undefined, true)).toBe(true);
  });

  it("is false with nothing found", async () => {
    const { searchLacks } = await load();
    expect(searchLacks(undefined, undefined, true)).toBe(false);
  });
});

describe("seedSearchRelay", () => {
  it("publishes the wire fields alone, once", async () => {
    const { seedSearchRelay } = await load();
    const withCache = Object.assign(ev(), { seen: new Set(["x"]) });
    seedSearchRelay(withCache);
    seedSearchRelay(withCache);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(Object.keys(publish.mock.calls[0][0]).sort()).toEqual(
      ["content", "created_at", "id", "kind", "pubkey", "sig", "tags"].sort(),
    );
  });

  // Search can accept an event and never serve it; every visit would push it again.
  it("remembers what it handed over across sessions", async () => {
    (await load()).seedSearchRelay(ev());
    (await load()).seedSearchRelay(ev());
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("forgets the oldest past its bound", async () => {
    const { seedSearchRelay } = await load();
    for (let i = 0; i < 501; i++) seedSearchRelay(ev({ id: i.toString(16).padStart(64, "0") }));
    const kept = JSON.parse(localStorage.getItem("brainstorm_search_seeded")!) as string[];
    expect(kept).toHaveLength(500);
    expect(kept[0]).toBe("1".padStart(64, "0"));
  });

  it("still works when storage is unusable", async () => {
    localStorage.setItem("brainstorm_search_seeded", "{not json");
    const { seedSearchRelay } = await load();
    seedSearchRelay(ev());
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejection: the reader already has the event", async () => {
    const { seedSearchRelay } = await load();
    publish.mockRejectedValueOnce(new Error("blocked"));
    expect(() => seedSearchRelay(ev({ id: "c".repeat(64) }))).not.toThrow();
    await Promise.resolve();
  });
});
