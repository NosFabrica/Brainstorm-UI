// @vitest-environment jsdom
/**
 * A list's items render from the EventStore while the relays are asked
 * (docs/adr/0005): each relay's items show as they land — the books list is
 * 1–2 MB, and the slower relay can take three times as long — and an item
 * published later (the reader's own) joins them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";

const HEADER = `39998:${"a".repeat(64)}:books`;
const io = vi.hoisted(() => ({
  conceptItems: vi.fn(async (): Promise<unknown> => []),
  listItems: vi.fn(async (): Promise<unknown> => ({ items: [], truncated: false })),
  matches: vi.fn(async (): Promise<unknown> => []),
}));
vi.mock("@/services/dictionary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dictionary")>()),
  loadConceptItems: () => io.conceptItems(),
  loadListItems: () => io.listItems(),
  searchListItems: () => io.matches(),
}));

import { useConceptItems, useConceptMatches, useListItems } from "./useConceptItems";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  __resetAsks();
});

let n = 0;
const item = (title: string, header = HEADER) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 39999,
    pubkey: "b".repeat(64),
    created_at: 100 + n,
    content: "",
    sig: "s",
    tags: [
      ["d", title],
      ["z", header],
    ],
  }) as NostrEvent;
const entry = (header = HEADER) => ({ communityCoordinate: header, resolved: null }) as never;

describe("useConceptItems", () => {
  it("shows each relay's items as they reach the store, then one published later", async () => {
    let finish!: () => void;
    io.conceptItems.mockImplementation(
      () =>
        new Promise((resolve) => {
          eventStore.add(item("fast"));
          finish = () => resolve([eventStore.add(item("slow"))]);
        }),
    );
    const { result } = renderHook(() => useConceptItems(entry()));
    await waitFor(() => expect(result.current.data?.map((i) => i.tags[0][1])).toEqual(["fast"]));
    act(() => finish());
    await waitFor(() => expect(result.current.data?.map((i) => i.tags[0][1])).toEqual(["slow", "fast"]));
    act(() => {
      eventStore.add(item("mine"));
    });
    await waitFor(() => expect(result.current.data?.[0]?.tags[0][1]).toBe("mine"));
  });

  it("is pending until it has something to show, and reads nothing when off", async () => {
    io.conceptItems.mockClear();
    const off = renderHook(() => useConceptItems(entry(`39998:${"c".repeat(64)}:none`), false));
    expect(off.result.current).toEqual({ data: undefined, isPending: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(io.conceptItems).not.toHaveBeenCalled();
  });
});

describe("useListItems", () => {
  it("says the read was cut off when its answer was, from the store's items", async () => {
    const header = `39998:${"d".repeat(64)}:places`;
    io.listItems.mockImplementation(async () => ({ items: [eventStore.add(item("one", header))], truncated: true }));
    const { result } = renderHook(() => useListItems([header]));
    await waitFor(() => expect(result.current.data?.truncated).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    act(() => {
      eventStore.add(item("two", header));
    });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
  });
});

describe("useConceptMatches", () => {
  it("is the search's own answer, as the store holds it", async () => {
    const header = `39998:${"e".repeat(64)}:people`;
    const found = item("alice", header);
    io.matches.mockImplementation(async () => [eventStore.add(found)]);
    const { result } = renderHook(() => useConceptMatches(entry(header), ["alice"]));
    await waitFor(() => expect(result.current.data?.map((i) => i.id)).toEqual([found.id]));
  });
});
