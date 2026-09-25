/**
 * The cached relay singletons follow the pool. services/relayAuth drops a
 * relay signed in as an account that may no longer sign, and a dropped relay
 * is closed for good — a cache still holding it would read from nothing.
 */
import { describe, expect, it } from "vitest";
import { pool } from "./relayPool";
import { zapstoreRelay } from "./zapstoreRelay";

describe("zapstoreRelay", () => {
  it("is the same relay while the pool holds it, and a fresh one once the pool has dropped it", () => {
    const first = zapstoreRelay();
    expect(zapstoreRelay()).toBe(first);

    pool.remove(first!);
    const next = zapstoreRelay();
    expect(next).not.toBe(first);
    expect(pool.relays.get(next!.url)).toBe(next);
  });
});
