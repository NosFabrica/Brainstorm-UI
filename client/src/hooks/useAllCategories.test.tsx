// @vitest-environment jsdom
/**
 * All's categories for its tab row: found among All's rows and the Dictionary's lists, counted
 * once each, most first, and kept for the visit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const asks: { keys: string[]; onCounts: (counts: Map<string, number | null>) => void }[] = [];
vi.mock("@/services/search", () => ({
  countCategories: (
    _query: string,
    categories: { key: string }[],
    _lens: unknown,
    onCounts: (counts: Map<string, number | null>) => void,
  ) => {
    asks.push({ keys: categories.map((c) => c.key), onCounts });
    return () => {};
  },
}));

import { __forgetAllCategories, useAllCategories } from "./useAllCategories";

let seq = 0;
const row = (kind: number) => ({
  event: {
    id: (++seq).toString(16).padStart(64, "0"),
    kind,
    pubkey: "a".repeat(64),
    tags: [],
    content: "",
    created_at: 1,
    sig: "",
  } as NostrEvent,
  author: null,
  rank: null,
});
const BOOKS = `39998:${"b".repeat(64)}:books`;
const books = { coordinate: BOOKS, name: "Books", image: null, hits: [], more: false, href: "/e/x", headers: [BOOKS] };

beforeEach(() => {
  __forgetAllCategories();
  asks.length = 0;
});

describe("useAllCategories", () => {
  it("counts what it finds together, and shows it most first once counted", async () => {
    const page = [row(1), row(21)];
    const { result } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, page, lists: [books] }),
    );
    expect(result.current.shown).toEqual([]);
    expect([...result.current.known.keys()]).toEqual([BOOKS, "kind:Note", "kind:Video"]);
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0].keys).toEqual([BOOKS, "kind:Note", "kind:Video"]);
    act(() =>
      asks[0].onCounts(
        new Map([
          [BOOKS, 30],
          ["kind:Note", 500],
          ["kind:Video", 2],
        ]),
      ),
    );
    expect(result.current.shown.map((c) => c.name)).toEqual(["Notes", "Books", "Videos"]);
  });

  it("keeps the row on a category's page, and coming back counts nothing again", async () => {
    let page = [row(1)];
    const { result, rerender, unmount } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, page, lists: [] }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    act(() => asks[0].onCounts(new Map([["kind:Note", 5]])));
    page = [];
    rerender();
    expect(result.current.shown.map((c) => c.name)).toEqual(["Notes"]);
    unmount();

    const back = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, page: [], lists: [] }),
    );
    expect(back.result.current.shown.map((c) => c.name)).toEqual(["Notes"]);
    await new Promise((r) => setTimeout(r, 400));
    expect(asks).toHaveLength(1);
  });

  it("finds nothing off All", () => {
    const { result } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: false, page: [row(1)], lists: [books] }),
    );
    expect(result.current.known.size).toBe(0);
  });
});

describe("useAllCategories totals", () => {
  it("are the counts a category's page holds: a list's, and a kind's no other category shares", async () => {
    const recipe = row(30023);
    recipe.event.tags = [
      ["d", "burger"],
      ["t", "zapcooking"],
    ];
    const page = [row(21), row(30023), recipe];
    const { result } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, page, lists: [books] }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    act(() => asks[0].onCounts(new Map(asks[0].keys.map((k) => [k, 7]))));
    expect([...result.current.totals.keys()].sort()).toEqual([BOOKS, "kind:Video"].sort());
  });
});
