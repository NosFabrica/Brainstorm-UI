// @vitest-environment jsdom
/**
 * All's categories for its tab row: found among All's rows and the Dictionary's lists, and the
 * kinds Top's tabs ask, counted once each — Notes, People and the biggest list first, then the
 * rest by their results — and kept for the visit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const asks: { categories: { key: string; tab?: string }[]; onCounts: (counts: Map<string, number | null>) => void }[] =
  [];
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  countCategories: (
    _query: string,
    categories: { key: string; tab?: string }[],
    _lens: unknown,
    onCounts: (counts: Map<string, number | null>) => void,
  ) => {
    asks.push({ categories, onCounts });
    return () => {};
  },
}));

import { __forgetAllCategories, useAllCategories } from "./useAllCategories";

let seq = 0;
const row = (kind: number, tags: string[][] = []) => ({
  event: {
    id: (++seq).toString(16).padStart(64, "0"),
    kind,
    pubkey: "a".repeat(64),
    tags,
    content: "",
    created_at: 1,
    sig: "",
  } as NostrEvent,
  author: null,
  rank: null,
});
const BOOKS = `39998:${"b".repeat(64)}:books`;
const PLACES = `39998:${"b".repeat(64)}:places`;
const list = (coordinate: string, name: string) => ({
  coordinate,
  name,
  image: null,
  hits: [],
  more: false,
  href: "/e/x",
  headers: [coordinate],
});
const books = list(BOOKS, "Books");
const keysAsked = () => asks.flatMap((a) => a.categories.map((c) => c.key));
const answer = (counts: [string, number | null][]) => act(() => asks.forEach((a) => a.onCounts(new Map(counts))));

beforeEach(() => {
  __forgetAllCategories();
  asks.length = 0;
});

describe("useAllCategories", () => {
  it("counts what it finds and the kinds Top's tabs ask, together; shows nothing until counted", async () => {
    const { result } = renderHook(() =>
      useAllCategories("burger", {
        pov: "nosfabrica",
        enabled: true,
        ready: true,
        page: [row(1), row(21)],
        lists: [books],
      }),
    );
    expect(result.current.shown).toEqual([]);
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(keysAsked()).toEqual(
      expect.arrayContaining([BOOKS, "kind:Note", "kind:Video", "kind:Person", "kind:Event", "kind:Repo"]),
    );
    // Events and Recipes are asked as their tabs ask them.
    expect(asks[0].categories.find((c) => c.key === "kind:Event")?.tab).toBe("events");
    expect(asks[0].categories.find((c) => c.key === "kind:Recipe")?.tab).toBe("recipes");
  });

  it("goes Notes, People, the biggest list, then the rest by their results — Events and lists among them", async () => {
    const places = list(PLACES, "Places");
    const { result } = renderHook(() =>
      useAllCategories("burger", {
        pov: "nosfabrica",
        enabled: true,
        ready: true,
        page: [row(1), row(21)],
        lists: [books, places],
      }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    answer([
      ["kind:Note", 500],
      ["kind:Video", 2],
      [BOOKS, 30],
      [PLACES, 60],
      ["kind:Person", 4],
      ["kind:Event", 1],
    ]);
    expect(result.current.shown.map((c) => c.name)).toEqual(["Notes", "People", "Places", "Books", "Videos", "Events"]);
  });

  it("a standing kind stands only when its count finds some; one the page showed stands whatever its count", async () => {
    const { result } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, ready: true, page: [row(1)], lists: [] }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    answer([
      ["kind:Note", 0],
      ["kind:Repo", 3],
      ["kind:Person", 0],
      ["kind:Event", null],
    ]);
    expect(result.current.shown.map((c) => c.name)).toEqual(["Repos", "Notes"]);
  });

  it("keeps the row on a category's page, and coming back counts nothing again", async () => {
    let page = [row(1)];
    const { result, rerender, unmount } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, ready: true, page, lists: [] }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    answer([["kind:Note", 5]]);
    page = [];
    rerender();
    expect(result.current.shown.map((c) => c.name)).toEqual(["Notes"]);
    unmount();

    const back = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, ready: true, page: [], lists: [] }),
    );
    expect(back.result.current.shown.map((c) => c.name)).toEqual(["Notes"]);
    await new Promise((r) => setTimeout(r, 400));
    expect(asks).toHaveLength(1);
  });

  it("finds nothing off All", () => {
    const { result } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: false, ready: true, page: [row(1)], lists: [books] }),
    );
    expect(result.current.known.size).toBe(0);
  });
});

describe("useAllCategories totals", () => {
  it("are the counts a category's page holds: a list's, a kind's no other shares — not a tab's union", async () => {
    const recipe = row(30023, [
      ["d", "burger"],
      ["t", "zapcooking"],
    ]);
    const { result } = renderHook(() =>
      useAllCategories("burger", {
        pov: "nosfabrica",
        enabled: true,
        ready: true,
        page: [row(21), row(30023), recipe],
        lists: [books],
      }),
    );
    await waitFor(() => expect(asks).toHaveLength(1));
    answer(keysAsked().map((k) => [k, 7]));
    const totals = result.current.totals;
    expect(totals.has(BOOKS) && totals.has("kind:Video") && totals.has("kind:Person")).toBe(true);
    expect(["kind:Article", "kind:Recipe", "kind:Event"].some((k) => totals.has(k))).toBe(false);
  });
});

describe("useAllCategories loading", () => {
  it("counts nothing until what the row is found from has answered, and says it is loading until counted", async () => {
    let ready = false;
    const { result, rerender } = renderHook(() =>
      useAllCategories("burger", { pov: "nosfabrica", enabled: true, ready, page: [row(1)], lists: [] }),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(asks).toHaveLength(0);
    expect(result.current.loading).toBe(true);
    ready = true;
    rerender();
    await waitFor(() => expect(asks).toHaveLength(1));
    answer([["kind:Note", 5]]);
    expect(result.current).toMatchObject({ loading: false, shown: [{ name: "Notes" }] });
  });
});
