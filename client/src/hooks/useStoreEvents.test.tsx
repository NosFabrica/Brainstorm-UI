// @vitest-environment jsdom
/**
 * A feed renders from the store as each event lands, not after the slowest
 * relay; whatever the ask returns that the store didn't keep still shows; and
 * the relays are asked once per key per window, however many mounts want it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { useStoreEvents } from "./useStoreEvents";

let n = 0;
const note = (pubkey: string, created_at: number, tags: string[][] = []) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 1,
    pubkey,
    created_at,
    content: "hi",
    sig: "s",
    tags,
  }) as NostrEvent;

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => __resetAsks());

describe("useStoreEvents", () => {
  it("shows each event as the store receives it, before the ask finishes", async () => {
    const pk = "a".repeat(64);
    const ask = vi.fn(() => new Promise<NostrEvent[]>(() => {}));
    const { result } = renderHook(() => useStoreEvents(`notes:${pk}`, [{ kinds: [1], authors: [pk] }], ask));
    expect(result.current.loading).toBe(true);

    act(() => {
      eventStore.add(note(pk, 100));
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.loading).toBe(false);

    act(() => {
      eventStore.add(note(pk, 200));
    });
    await waitFor(() => expect(result.current.events.map((e) => e.created_at)).toEqual([200, 100]));
  });

  it("keeps what the ask returned that the store does not hold, if it matches", async () => {
    const pk = "b".repeat(64);
    const other = "c".repeat(64);
    const ask = vi.fn(async () => [note(pk, 50), note(other, 60)]);
    const { result } = renderHook(() => useStoreEvents(`notes:${pk}`, [{ kinds: [1], authors: [pk] }], ask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.pubkey)).toEqual([pk]);
  });

  it("settles empty as not loading", async () => {
    const pk = "d".repeat(64);
    const { result } = renderHook(() => useStoreEvents(`notes:${pk}`, [{ kinds: [1], authors: [pk] }], async () => []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
  });

  it("asks once per key while the window lasts, and joins an ask already out", async () => {
    const pk = "e".repeat(64);
    let answer!: (v: NostrEvent[]) => void;
    const ask = vi.fn(() => new Promise<NostrEvent[]>((resolve) => (answer = resolve)));
    const filters = [{ kinds: [1], authors: [pk] }];
    const first = renderHook(() => useStoreEvents(`notes:${pk}`, filters, ask));
    const second = renderHook(() => useStoreEvents(`notes:${pk}`, filters, ask));
    expect(ask).toHaveBeenCalledTimes(1);

    await act(async () => answer([note(pk, 10)]));
    expect(first.result.current.events).toHaveLength(1);
    expect(second.result.current.events).toHaveLength(1);

    const third = renderHook(() => useStoreEvents(`notes:${pk}`, filters, ask));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(third.result.current.events).toHaveLength(1);
    expect(third.result.current.loading).toBe(false);
  });

  it("asks nothing without a key", () => {
    const ask = vi.fn(async () => []);
    const { result } = renderHook(() => useStoreEvents(null, null, ask));
    expect(ask).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("with stream off, holds the list it mounted with until the ask settles", async () => {
    const pk = "f".repeat(64);
    eventStore.add(note(pk, 10));
    let answer!: (v: NostrEvent[]) => void;
    const ask = vi.fn(() => new Promise<NostrEvent[]>((resolve) => (answer = resolve)));
    const { result } = renderHook(() =>
      useStoreEvents(`feed:${pk}`, [{ kinds: [1], authors: [pk] }], ask, { minMs: 60_000, stream: false }),
    );
    expect(result.current.events).toHaveLength(1);

    act(() => {
      eventStore.add(note(pk, 20));
    });
    expect(result.current.events).toHaveLength(1);

    await act(async () => answer([]));
    await waitFor(() => expect(result.current.events.map((e) => e.created_at)).toEqual([20, 10]));
  });
});
