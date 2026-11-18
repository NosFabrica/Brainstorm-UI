import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const publish = vi.fn((_event: NostrEvent, _opts?: unknown) => Promise.resolve({ ok: true, from: "search" }));
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => ({ publish }) }));

import { resetSeededForTests, searchLacks, seedSearchRelay } from "./searchSeed";

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
  resetSeededForTests();
});

describe("searchLacks", () => {
  it("is true when search answered without it", () => {
    expect(searchLacks(ev(), undefined, true)).toBe(true);
  });

  it("is false when search was not heard from: a refusal or timeout is not an absence", () => {
    expect(searchLacks(ev(), undefined, false)).toBe(false);
  });

  it("is false when search holds the same event, or a newer version", () => {
    expect(searchLacks(ev(), ev(), true)).toBe(false);
    expect(searchLacks(ev({ created_at: 10 }), ev({ id: "b".repeat(64), created_at: 11 }), true)).toBe(false);
  });

  it("is true when the relays found a newer version than search's", () => {
    expect(searchLacks(ev({ created_at: 12 }), ev({ id: "b".repeat(64), created_at: 11 }), true)).toBe(true);
  });

  it("never hands over a NIP-70 protected event: only its author may publish it", () => {
    expect(searchLacks(ev({ tags: [["-"]] }), undefined, true)).toBe(false);
  });

  it("is false with nothing found", () => {
    expect(searchLacks(undefined, undefined, true)).toBe(false);
  });
});

describe("seedSearchRelay", () => {
  it("publishes the wire fields alone, once per event per session", () => {
    const withCache = Object.assign(ev(), { seen: new Set(["x"]) });
    seedSearchRelay(withCache);
    seedSearchRelay(withCache);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(Object.keys(publish.mock.calls[0][0]).sort()).toEqual(
      ["content", "created_at", "id", "kind", "pubkey", "sig", "tags"].sort(),
    );
  });

  it("swallows a rejection: the reader already has the event", async () => {
    publish.mockRejectedValueOnce(new Error("blocked"));
    expect(() => seedSearchRelay(ev({ id: "c".repeat(64) }))).not.toThrow();
    await Promise.resolve();
  });
});
