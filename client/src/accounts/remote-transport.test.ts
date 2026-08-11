// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { NostrConnectSigner } from "applesauce-signers";
import type { RelayStatus } from "applesauce-relay";

import { installRemoteTransport, PUBLISH_GRACE_MS, relaysReachable$ } from "./remote-transport";

function fakePool(initial: Record<string, Partial<RelayStatus>> = {}) {
  const status$ = new BehaviorSubject(initial as Record<string, RelayStatus>);
  return { status$, set: (next: Record<string, Partial<RelayStatus>>) => status$.next(next as never) };
}

function watch(pool: ReturnType<typeof fakePool>, relays: string[]) {
  const seen: boolean[] = [];
  const sub = relaysReachable$(relays, pool as never).subscribe((up) => seen.push(up));
  return { seen, stop: () => sub.unsubscribe() };
}

/**
 * A pool where each relay's publish settles when we say so.
 *
 * The real failure this reproduces: a relay we cannot reach does not reject, it
 * hangs for its whole 30s `publishTimeout`.
 */
const tick = () => new Promise((resolve) => setImmediate(resolve));

function publishPool() {
  const pending = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  return {
    pending,
    status$: new BehaviorSubject({}),
    publish: (relays: string[]) =>
      new Promise<void>((resolve, reject) => {
        pending.set(relays[0], { resolve, reject });
      }),
  };
}

describe("a request whose publish is waiting on a dead relay", () => {
  afterEach(() => vi.useRealTimers());

  // The library will not hand back the signer's response until publishMethod
  // settles. Gate that on every relay and one unreachable relay costs 30s per
  // request — which our own 30s deadline then reports as a silent signer.
  it("gets on with it as soon as one relay accepts", async () => {
    const pool = publishPool();
    installRemoteTransport(pool as never);

    const sent = NostrConnectSigner.publishMethod!(
      ["wss://ours", "wss://unreachable"],
      {} as never,
    );
    let settled = false;
    void Promise.resolve(sent).then(() => (settled = true));

    await tick();
    expect(settled).toBe(false);

    // ours accepts; the dead one is still hanging and always will be
    pool.pending.get("wss://ours")!.resolve();
    await tick();

    expect(settled).toBe(true);
    expect(pool.pending.has("wss://unreachable")).toBe(true);
  });

  it("does not let a relay that fails fast cut the others short", async () => {
    vi.useFakeTimers();
    const pool = publishPool();
    installRemoteTransport(pool as never);

    const sent = NostrConnectSigner.publishMethod!(["wss://broken", "wss://slow"], {} as never);
    let settled = false;
    void Promise.resolve(sent).then(() => (settled = true));

    pool.pending.get("wss://broken")!.reject(new Error("refused"));
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);

    // the grace is the backstop, so a request is never stuck on the publish
    await vi.advanceTimersByTimeAsync(PUBLISH_GRACE_MS);
    expect(settled).toBe(true);
  });
});

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
