import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressCache } from "./addressCache";

const ev = (id: string, created_at: number) => ({ id, pubkey: "a".repeat(64), kind: 39999, created_at, tags: [] });

describe("AddressCache", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the newest version whatever order the relays answer in, a tie to the lower id (NIP-01)", () => {
    const cache = new AddressCache<ReturnType<typeof ev>>({ ttlMs: 60_000, cap: 10 });
    expect(cache.hold("x", ev("b", 20)).id).toBe("b");
    expect(cache.hold("x", ev("a", 10)).id).toBe("b");
    expect(cache.fresh("x")?.id).toBe("b");
    cache.hold("x", ev("c", 30));
    expect(cache.fresh("x")?.id).toBe("c");
    cache.hold("x", ev("0", 30));
    expect(cache.fresh("x")?.id).toBe("0");
  });

  it("is fresh for a while after a relay last answered, and held after that", () => {
    vi.useFakeTimers();
    const cache = new AddressCache<ReturnType<typeof ev>>({ ttlMs: 60_000, cap: 10 });
    cache.hold("x", ev("b", 20));
    vi.advanceTimersByTime(61_000);
    expect(cache.fresh("x")).toBeUndefined();
    expect(cache.held("x")?.id).toBe("b");
    // A relay answers again, with the same version: fresh again.
    cache.hold("x", ev("b", 20));
    expect(cache.fresh("x")?.id).toBe("b");
  });

  it("holds at most `cap` addresses, the least recently answered going first", () => {
    const cache = new AddressCache<ReturnType<typeof ev>>({ ttlMs: 60_000, cap: 2 });
    cache.hold("x", ev("x", 1));
    cache.hold("y", ev("y", 1));
    cache.hold("x", ev("x", 1));
    cache.hold("z", ev("z", 1));
    expect(cache.held("y")).toBeUndefined();
    expect(cache.held("x")?.id).toBe("x");
    expect(cache.held("z")?.id).toBe("z");
    cache.clear();
    expect(cache.held("x")).toBeUndefined();
  });
});
