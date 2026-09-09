/**
 * The UI is a JavaScript payload that never goes down; the servers behind it
 * do. This store notices — the API over HTTP, the search relay over its
 * socket — so the app can say "taking a quick break" instead of a skeleton
 * or a bare 500 (Benjamin + the dev, 2026-09-09). A verdict is never one
 * failed call: two failures on different routes inside a window earn a
 * confirming probe, and only the probe's answer decides.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { __resetServerStatus, getServerStatus, isTransportFailure, onRecover, reportApiFailure, retryNow, subscribeServerStatus, watchRelay } from "./serverStatus";

const PROBE = "http://test.local/.well-known/nostr.json?name=_";

beforeEach(() => {
  vi.useFakeTimers();
  __resetServerStatus();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the API's health", () => {
  it("two failures on different routes within the window earn one probe, and a probe that fails marks the API down", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    subscribeServerStatus(listener);

    reportApiFailure("/user/aaa/overview");
    expect(fetchMock).not.toHaveBeenCalled();
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(PROBE);
    expect(getServerStatus().api).toBe("down");
    expect(listener).toHaveBeenCalled();
  });

  it("a probe that answers — even with a 404 — keeps the API up and forgets the failures", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    reportApiFailure("/user/aaa/overview");
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServerStatus().api).toBe("ok");
    // The window was cleared by the answer: one more failure is one, not three.
    reportApiFailure("/user/bbb/overview");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("one route failing twice — a slow endpoint timing out — earns no probe; only a second route does", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    reportApiFailure("/user/aaa/stats");
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getServerStatus().api).toBe("ok");
  });

  it("only transport failures count: the network, a timeout, a gateway 502/503/504 — never a 4xx or a cancelled request", () => {
    expect(isTransportFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransportFailure(Object.assign(new Error("timed out"), { name: "TimeoutError" }))).toBe(true);
    expect(isTransportFailure(new Response("", { status: 503 }))).toBe(true);
    expect(isTransportFailure(new Response("", { status: 404 }))).toBe(false);
    expect(isTransportFailure(new Response("", { status: 401 }))).toBe(false);
    expect(isTransportFailure(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
    expect(isTransportFailure(new Error("Failed to fetch user data (404)"))).toBe(false);
  });

  // Down is not forever: the store keeps asking, and the pages refill the
  // moment the server answers — without a reload.
  it("while down it probes at 10, 20, then every 30 seconds, and the first answer brings it back and tells the app once", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    const recovered = vi.fn();
    onRecover(recovered);
    reportApiFailure("/user/aaa/overview");
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);
    expect(getServerStatus().api).toBe("down");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getServerStatus().api).toBe("down");
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getServerStatus().api).toBe("ok");
    expect(getServerStatus().recovery).toBe(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // Offline is the reader's network, not our server: no probe, no verdict —
  // and the moment they are back online, one probe settles it.
  it("offline earns no verdict; coming back online probes once", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    reportApiFailure("/user/aaa/overview");
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getServerStatus().api).toBe("ok");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServerStatus().api).toBe("down");
  });

  // A preview for design review, the `?demo=display` precedent — in memory
  // only, never persisted, and the probe loop leaves it alone.
  it("?sorry=api forces the API down for this page load, without a probe, and a probe cannot clear it", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/dashboard?sorry=api");
    __resetServerStatus();
    expect(getServerStatus().api).toBe("down");
    expect(getServerStatus().search).toBe("ok");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getServerStatus().api).toBe("down");
    window.history.replaceState({}, "", "/");
  });
});

// The page's Try again: a probe now, not at the next tick of the loop — and
// the page can say when the next automatic one is due, and that one runs.
describe("trying again", () => {
  it("says when the next probe is due, probes at once on Try again, and marks a probe in flight", async () => {
    let answer = async (): Promise<Response> => { throw new TypeError("Failed to fetch"); };
    vi.stubGlobal("fetch", vi.fn(() => answer()));
    reportApiFailure("/user/aaa/overview");
    reportApiFailure("/user/aaa/stats");
    await vi.advanceTimersByTimeAsync(0);
    expect(getServerStatus().api).toBe("down");
    expect(getServerStatus().nextProbeAt).toBe(Date.now() + 10_000);
    expect(getServerStatus().checking).toBe(false);
    let release: () => void = () => {};
    answer = () => new Promise((resolve) => { release = () => resolve(new Response("{}", { status: 200 })); });
    retryNow("api");
    await vi.advanceTimersByTimeAsync(0);
    expect(getServerStatus().checking).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(getServerStatus().checking).toBe(false);
    expect(getServerStatus().api).toBe("ok");
    expect(getServerStatus().nextProbeAt).toBeNull();
  });

  it("Try again on search restarts the search optimistically: ok now, counted as a recovery, and the watcher may say down again", () => {
    const relay = { connected$: new BehaviorSubject(false), ready$: new BehaviorSubject(false), error$: new BehaviorSubject<Error | null>(new Error("Connection error")) };
    const stop = watchRelay(relay);
    expect(getServerStatus().search).toBe("down");
    retryNow("search");
    expect(getServerStatus().search).toBe("ok");
    expect(getServerStatus().recovery).toBe(1);
    stop();
  });
});

// The search relay is a socket the library reconnects for us: `ready` goes
// false during its backoff and `error` is set on a failed connect, cleared on
// open. Those are settled facts, so the watcher needs no timer — and an idle
// socket the library closed cleanly is not an outage.
describe("the search relay's health", () => {
  function fakeRelay() {
    return { connected$: new BehaviorSubject(false), ready$: new BehaviorSubject(true), error$: new BehaviorSubject<Error | null>(null) };
  }

  it("a failed connect in backoff is down; the socket opening again is ok and counts as a recovery; an idle clean close is nothing", () => {
    const relay = fakeRelay();
    const stop = watchRelay(relay);
    expect(getServerStatus().search).toBe("ok");
    relay.error$.next(new Error("Connection error"));
    relay.ready$.next(false);
    expect(getServerStatus().search).toBe("down");
    relay.ready$.next(true);
    relay.connected$.next(true);
    relay.error$.next(null);
    expect(getServerStatus().search).toBe("ok");
    expect(getServerStatus().recovery).toBe(1);
    // keepAlive closes an idle socket cleanly: not connected, no error, ready.
    relay.connected$.next(false);
    expect(getServerStatus().search).toBe("ok");
    stop();
  });
});
