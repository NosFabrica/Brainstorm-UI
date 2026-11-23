/**
 * The shared side socket for per-row questions: one socket however many rows ask, opened on
 * the first lease and closed once nobody has held one for a while.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const opened: { url: string; close: ReturnType<typeof vi.fn> }[] = [];
vi.mock("applesauce-relay", () => ({
  Relay: class {
    url: string;
    close = vi.fn();
    constructor(url: string) {
      this.url = url;
      opened.push(this);
    }
  },
}));
vi.mock("./relayPool", () => ({ pool: { relays: new Map(), relay: vi.fn() }, warmRelay: vi.fn() }));
vi.mock("./runtimeEnv", () => ({ env: { VITE_SEARCH_RELAY_URL: "wss://search.example" } }));
vi.mock("@/lib/serverStatus", () => ({ watchRelay: () => () => {} }));

import { SIDE_IDLE_MS, __resetSideSearchRelay, leaseSideSearchRelay } from "./searchRelay";

beforeEach(() => {
  vi.useFakeTimers();
  opened.length = 0;
  __resetSideSearchRelay();
  opened.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("leaseSideSearchRelay", () => {
  it("hands every row the one socket, and opens it only when first asked", () => {
    expect(opened).toHaveLength(0);
    const a = leaseSideSearchRelay()!;
    const b = leaseSideSearchRelay()!;
    expect(opened).toHaveLength(1);
    expect(a.relay).toBe(b.relay);
    expect(opened[0].url).toBe("wss://search.example");
  });

  it("closes once nobody has held it for the idle time, and opens afresh after", () => {
    const a = leaseSideSearchRelay()!;
    const b = leaseSideSearchRelay()!;
    a.release();
    vi.advanceTimersByTime(SIDE_IDLE_MS * 2);
    expect(opened[0].close).not.toHaveBeenCalled();
    b.release();
    vi.advanceTimersByTime(SIDE_IDLE_MS - 1);
    expect(opened[0].close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(opened[0].close).toHaveBeenCalledTimes(1);
    leaseSideSearchRelay();
    expect(opened).toHaveLength(2);
  });

  it("a lease taken while it idles keeps it open, and releasing twice counts once", () => {
    const a = leaseSideSearchRelay()!;
    a.release();
    vi.advanceTimersByTime(SIDE_IDLE_MS - 1);
    const b = leaseSideSearchRelay()!;
    a.release();
    vi.advanceTimersByTime(SIDE_IDLE_MS * 2);
    expect(opened[0].close).not.toHaveBeenCalled();
    expect(b.relay).toBe(opened[0]);
  });
});
