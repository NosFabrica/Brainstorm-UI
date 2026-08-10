// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";
import type { RelayStatus } from "applesauce-relay";

import { relaysReachable$ } from "./remote-transport";

function fakePool(initial: Record<string, Partial<RelayStatus>> = {}) {
  const status$ = new BehaviorSubject(initial as Record<string, RelayStatus>);
  return { status$, set: (next: Record<string, Partial<RelayStatus>>) => status$.next(next as never) };
}

function watch(pool: ReturnType<typeof fakePool>, relays: string[]) {
  const seen: boolean[] = [];
  const sub = relaysReachable$(relays, pool as never).subscribe((up) => seen.push(up));
  return { seen, stop: () => sub.unsubscribe() };
}

describe("whether the relays are up", () => {
  // NIP-46 has no delivery signal, so without this "the relays are down" and
  // "they haven't approved yet" are the same thing on screen: nothing.
  it("starts pessimistic — nothing is reachable until a socket says so", () => {
    const pool = fakePool();
    const { seen, stop } = watch(pool, ["wss://ours"]);
    expect(seen).toEqual([false]);
    stop();
  });

  it("one connected relay is enough — a signer answers wherever it can see us", () => {
    const pool = fakePool();
    const { seen, stop } = watch(pool, ["wss://ours", "wss://theirs"]);

    pool.set({ "wss://theirs/": { url: "wss://theirs/", connected: true } });
    expect(seen).toEqual([false, true]);
    stop();
  });

  it("ignores a relay we aren't using", () => {
    const pool = fakePool();
    const { seen, stop } = watch(pool, ["wss://ours"]);

    pool.set({ "wss://someone-else/": { url: "wss://someone-else/", connected: true } });
    expect(seen).toEqual([false]);
    stop();
  });

  it("goes back down when the socket does", () => {
    const pool = fakePool();
    const { seen, stop } = watch(pool, ["wss://ours"]);

    pool.set({ "wss://ours/": { url: "wss://ours/", connected: true } });
    pool.set({ "wss://ours/": { url: "wss://ours/", connected: false } });
    expect(seen).toEqual([false, true, false]);
    stop();
  });
});
