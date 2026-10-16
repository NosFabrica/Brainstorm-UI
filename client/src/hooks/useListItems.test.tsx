// @vitest-environment jsdom
/**
 * A list's items for List Management: one ask for every item filed under the
 * list, up to the relay's cap, into the store; the newest version of each back
 * out; and whether the answer may be short of the list.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";

type F = Record<string, unknown>;
const readMock = vi.fn(async (_filters: F[], _timeoutMs: number, _relays: string[]) => [] as NostrEvent[]);
vi.mock("@/services/listReads", () => ({
  readListEvents: (f: F[], t: number, r: string[]) => readMock(f, t, r),
}));
vi.mock("@/config/tagging", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  tagRelays: () => ["wss://hub.example"],
}));

import { useListItems } from "./useListItems";

let n = 0;
const ev = (pubkey: string, kind: number, tags: string[][], created_at = 100) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind,
    pubkey,
    created_at,
    content: "",
    sig: "s",
    tags,
  }) as NostrEvent;

/** A list header by `author`, and its coordinate. Each test takes its own, so no ask or event is shared. */
const list = (author: string) => {
  const header = ev(author, 39998, [
    ["d", "places"],
    ["names", "Place", "Places"],
  ]);
  return { header, coordinate: `39998:${author}:places` };
};
const item = (author: string, d: string, z: string, created_at: number) =>
  ev(
    author,
    39999,
    [
      ["d", d],
      ["z", z],
    ],
    created_at,
  );

/** What a relay read does: each event into the store, and all of them back. */
const answerWith = (events: NostrEvent[]) =>
  readMock.mockImplementation(async () => {
    events.forEach((e) => eventStore.add(e));
    return events;
  });

// The events here are unsigned, so the store takes them on trust for this file.
const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = () => true;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  __resetAsks();
  readMock.mockReset();
  readMock.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useListItems", () => {
  it("asks the hub and our index for up to 10,000 of the list's items, and allows 20 seconds", async () => {
    const { header, coordinate } = list("a".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock).toHaveBeenCalledWith([{ kinds: [39999, 9999], "#z": [coordinate], limit: 10_000 }], 20_000, [
      "wss://hub.example",
    ]);
  });

  it("returns the newest version of each item filed under the list, newest first", async () => {
    const author = "b".repeat(64);
    const { header, coordinate } = list(author);
    const older = item(author, "cafe", coordinate, 10);
    const newer = item(author, "cafe", coordinate, 30);
    const bar = item(author, "bar", coordinate, 20);
    answerWith([newer, older, bar]);
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.items.map((i) => i.id)).toEqual([newer.id, bar.id]);
    expect(result.current.truncated).toBe(false);
  });

  it("reads a 9998 list by its id, and leaves out an item filed under another list", async () => {
    const author = "c".repeat(64);
    const header = ev(author, 9998, [["names", "Thing", "Things"]]);
    const byZ = ev(author, 9999, [["z", header.id]], 20);
    const byE = ev(author, 9999, [["e", header.id]], 10);
    // A z elsewhere wins over an e here: it is filed under the other list.
    const elsewhere = ev(
      author,
      9999,
      [
        ["z", `39998:${author}:other`],
        ["e", header.id],
      ],
      30,
    );
    answerWith([byZ, byE, elsewhere]);
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(readMock.mock.calls[0][0]).toEqual([
      { kinds: [39999, 9999], "#z": [header.id], limit: 10_000 },
      { kinds: [39999, 9999], "#e": [header.id], limit: 10_000 },
    ]);
    expect(result.current.items.map((i) => i.id)).toEqual([byZ.id, byE.id]);
  });

  it("says the read reached the relay's cap when its answer holds 10,000 events", async () => {
    const author = "d".repeat(64);
    const { header, coordinate } = list(author);
    answerWith(Array.from({ length: 10_000 }, (_, i) => item(author, `d${i}`, coordinate, 1 + i)));
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.items).toHaveLength(10_000);
    expect(result.current.truncated).toBe(true);
  });

  it("asks again when told to read again", async () => {
    const author = "e".repeat(64);
    const { header, coordinate } = list(author);
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.items).toEqual([]);

    const late = item(author, "late", coordinate, 5);
    answerWith([late]);
    act(() => result.current.reload());
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(readMock.mock.calls[1]).toEqual(readMock.mock.calls[0]);
    expect(result.current.items.map((i) => i.id)).toEqual([late.id]);
  });

  it("asks again when told to read again after the tab was left and come back to", async () => {
    const author = "9".repeat(64);
    const { header, coordinate } = list(author);
    const first = renderHook(() => useListItems(header));
    await waitFor(() => expect(first.result.current.settled).toBe(true));
    act(() => first.result.current.reload());
    await waitFor(() => expect(first.result.current.settled).toBe(true));
    expect(readMock).toHaveBeenCalledTimes(2);
    first.unmount();

    // Back within the window: served the latest read, then asking again reads again.
    const second = renderHook(() => useListItems(header));
    await waitFor(() => expect(second.result.current.settled).toBe(true));
    expect(readMock).toHaveBeenCalledTimes(2);
    const late = item(author, "late", coordinate, 5);
    answerWith([late]);
    act(() => second.result.current.reload());
    await waitFor(() => expect(second.result.current.settled).toBe(true));
    expect(readMock).toHaveBeenCalledTimes(3);
    expect(second.result.current.items.map((i) => i.id)).toEqual([late.id]);
  });

  it("does not say the read reached the cap for events the store kept from before it", async () => {
    const author = "a1".repeat(32);
    const { header, coordinate } = list(author);
    // Held from earlier reads; this read answers with fewer than the cap.
    Array.from({ length: 10_000 }, (_, i) => item(author, `old${i}`, coordinate, 1 + i)).forEach((e) =>
      eventStore.add(e),
    );
    answerWith([item(author, "new", coordinate, 20_000)]);
    const { result } = renderHook(() => useListItems(header));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.items.length).toBeGreaterThan(10_000);
    expect(result.current.truncated).toBe(false);
  });

  it("asks nothing for a header with no reference, and is settled at once", () => {
    // A 39998 with no `d` has no coordinate for an item to name.
    const header = ev("f".repeat(64), 39998, [["names", "Place", "Places"]]);
    const { result } = renderHook(() => useListItems(header));
    expect(readMock).not.toHaveBeenCalled();
    expect(result.current.settled).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.truncated).toBe(false);
    expect(result.current.cutOff).toBe(false);
  });

  /** A read that answers `ms` after it is asked. */
  const answerAfter = (ms: number) =>
    readMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), ms)));

  it("says a read was cut off when it ran to its 20 second deadline", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const { header } = list("1".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    expect(result.current.cutOff).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.cutOff).toBe(true);
  });

  it("says so of a read that settled within half a second of the deadline", async () => {
    vi.useFakeTimers();
    answerAfter(19_600);
    const { header } = list("5".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_600);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.cutOff).toBe(true);
  });

  it("does not say so of a read the relays finished answering", async () => {
    vi.useFakeTimers();
    answerAfter(19_000);
    const { header } = list("2".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.cutOff).toBe(false);
  });

  it("still says a read was cut off to a mount served the earlier answer", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const { header } = list("3".repeat(64));
    const first = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    first.unmount();
    // Within the window, so this mount asks nothing: what it knows of the read is what was kept.
    const second = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.settled).toBe(true);
    expect(second.result.current.cutOff).toBe(true);
  });

  it("tells a mount the latest read's flag, not the first's", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const { header } = list("b2".repeat(32));
    const first = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(first.result.current.cutOff).toBe(true);
    answerAfter(50);
    act(() => first.result.current.reload());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(first.result.current.cutOff).toBe(false);
    first.unmount();
    const second = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(second.result.current.settled).toBe(true);
    expect(second.result.current.cutOff).toBe(false);
  });

  it("forgets a cut off read once reading again is answered in time", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const { header } = list("4".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.cutOff).toBe(true);
    answerAfter(50);
    act(() => result.current.reload());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.cutOff).toBe(false);
  });

  it("keeps saying a read was cut off while reading again is out, then follows the new answer", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const { header } = list("6".repeat(64));
    const { result } = renderHook(() => useListItems(header));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.cutOff).toBe(true);
    act(() => result.current.reload());
    expect(result.current.settled).toBe(false);
    expect(result.current.cutOff).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.settled).toBe(false);
    expect(result.current.cutOff).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.cutOff).toBe(true);
  });

  it("does not carry a cut off read over to a list it was not read of", async () => {
    vi.useFakeTimers();
    answerAfter(20_000);
    const cutOff = list("7".repeat(64)).header;
    const first = renderHook(() => useListItems(cutOff));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(first.result.current.cutOff).toBe(true);
    answerAfter(50);
    const other = renderHook(() => useListItems(list("8".repeat(64)).header));
    expect(other.result.current.settled).toBe(false);
    expect(other.result.current.cutOff).toBe(false);
  });
});
