// @vitest-environment jsdom
/**
 * "If it has a version in the local store, it should use that one but still
 * ask for any updates and update them async when they arrive" (Vitor,
 * 2026-09-24). This hook is the listening half: what the device holds, at
 * once — a profile from disk however old — then each newer copy the store
 * receives. Never an older one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __useCacheStore, type CachedRow, type CacheStore } from "@/lib/eventCache";
import { useHeldReplaceable, useHeldReplaceables } from "./useHeldEvents";

const AUTHOR = "7".repeat(64);
let n = 0;
const article = (d: string, created_at: number, content = `v${created_at}`) =>
  ({ id: (++n).toString(16).padStart(64, "0"), kind: 30023, pubkey: AUTHOR, created_at, content, sig: "s", tags: [["d", d]] }) as NostrEvent;
const profile = (pubkey: string, created_at: number, name: string) =>
  ({ id: (++n).toString(16).padStart(64, "0"), kind: 0, pubkey, created_at, content: JSON.stringify({ name }), sig: "s", tags: [] }) as NostrEvent;

/** A device holding exactly these rows, learned at `at`. */
const device = (rows: CachedRow[]): CacheStore => ({
  get: async (addrs) => rows.filter((row) => addrs.includes(row.addr)),
  byAuthors: async (pubkeys) => rows.filter((row) => pubkeys.includes(row.pubkey)),
  put: async () => {},
  count: async () => rows.length,
  oldest: async () => [],
  remove: async () => {},
  clear: async () => {},
});

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
  __useCacheStore(undefined);
});
beforeEach(() => __useCacheStore(null));

describe("useHeldReplaceable", () => {
  it("renders the store's copy on the first render", () => {
    eventStore.add(article("first", 100));
    const { result } = renderHook(() => useHeldReplaceable(30023, AUTHOR, "first"));
    expect(result.current?.content).toBe("v100");
  });

  it("takes a newer version when one arrives, and ignores an older one", async () => {
    eventStore.add(article("edit", 100));
    const { result } = renderHook(() => useHeldReplaceable(30023, AUTHOR, "edit"));
    act(() => {
      eventStore.add(article("edit", 200));
    });
    await waitFor(() => expect(result.current?.content).toBe("v200"));
    act(() => {
      eventStore.add(article("edit", 150)); // a stale relay's copy
    });
    expect(result.current?.content).toBe("v200");
  });

  it("shows the first answer for an address it had never seen", async () => {
    const { result } = renderHook(() => useHeldReplaceable(30023, AUTHOR, "fresh"));
    expect(result.current).toBeUndefined();
    act(() => {
      eventStore.add(article("fresh", 300));
    });
    await waitFor(() => expect(result.current?.content).toBe("v300"));
  });

  it("does not take another address's events", () => {
    const { result } = renderHook(() => useHeldReplaceable(30023, AUTHOR, "mine"));
    act(() => {
      eventStore.add(article("theirs", 400));
    });
    expect(result.current).toBeUndefined();
  });

  it("shows a profile the device learned a year ago", async () => {
    const pk = "8".repeat(64);
    const old = profile(pk, 50, "held for a year");
    __useCacheStore(device([{ addr: `0:${pk}:`, pubkey: pk, kind: 0, event: old, at: Date.now() - 365 * 24 * 3600_000 }]));
    const { result } = renderHook(() => useHeldReplaceable(0, pk));
    await waitFor(() => expect(result.current?.content).toContain("held for a year"));
  });
});

describe("switching what it follows", () => {
  it("shows the new coordinate's held copy on the very render that switches", () => {
    eventStore.add(article("one", 10));
    eventStore.add(article("two", 20));
    const seen: (string | undefined)[] = [];
    const { rerender } = renderHook(
      ({ d }) => {
        const held = useHeldReplaceable(30023, AUTHOR, d);
        seen.push(held?.content);
        return held;
      },
      { initialProps: { d: "one" } },
    );
    seen.length = 0;
    rerender({ d: "two" });
    // Every render after the switch — the first included — has the copy.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((content) => content === "v20")).toBe(true);
  });
});

describe("the device's copies", () => {
  it("are read once, into the store, however many hooks show the person", async () => {
    const pk = "9".repeat(64);
    const rows = [{ addr: `0:${pk}:`, pubkey: pk, kind: 0, event: profile(pk, 60, "read once"), at: 0 }];
    const store = device(rows);
    const get = vi.spyOn(store, "get");
    __useCacheStore(store);
    const first = renderHook(() => useHeldReplaceable(0, pk));
    await waitFor(() => expect(first.result.current?.content).toContain("read once"));
    const second = renderHook(() => useHeldReplaceable(0, pk));
    expect(second.result.current?.content).toContain("read once"); // from memory, first render
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("useHeldReplaceables", () => {
  it("follows every coordinate it is given", async () => {
    eventStore.add(article("a", 10));
    const coords = [
      { kind: 30023, pubkey: AUTHOR, identifier: "a" },
      { kind: 30023, pubkey: AUTHOR, identifier: "b" },
    ];
    const { result } = renderHook(() => useHeldReplaceables(coords));
    expect(result.current.get(`30023:${AUTHOR}:a`)?.content).toBe("v10");
    act(() => {
      eventStore.add(article("b", 20));
    });
    await waitFor(() => expect(result.current.get(`30023:${AUTHOR}:b`)?.content).toBe("v20"));
  });
});
