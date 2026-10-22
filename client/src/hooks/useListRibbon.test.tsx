// @vitest-environment jsdom
/**
 * The lists over the All tab's results: the Dictionary's lists the words find
 * items on — whole words, as each list's cards read them — most first, each
 * with its items and its page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import type { ListAnswer } from "@/services/search";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const PLACES = `39998:${AVI}:food-and-drink-places`;
const VIDEOS = `39998:${AVI}:divine-videos`;

const header = (d: string, names: [string, string], field: string, extra: string[][] = []): HeaderEvent => ({
  id: d.slice(0, 8).padEnd(64, "0"),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [["d", d], ["names", ...names], ["required", field], ["display", "title", field], ...extra],
});
const entryOf = (coordinate: string, h: HeaderEvent) => ({
  communityCoordinate: coordinate,
  resolved: resolveConcept({ community: h, communityCoordinate: coordinate }),
  inDictionary: false,
  items: [],
});
const places = entryOf(
  PLACES,
  header("food-and-drink-places", ["Food and Drink Place", "Food and Drink Places"], "name", [
    ["image", "https://example.com/fork.png"],
  ]),
);
const videos = entryOf(VIDEOS, header("divine-videos", ["Divine Video", "Divine Videos"], "title"));

const dictionary = { data: [places, videos] as unknown[] | undefined };
vi.mock("@/hooks/useDictionary", () => ({ useDictionary: () => dictionary }));

const asked = vi.fn();
let answers = new Map<string, ListAnswer>();
vi.mock("@/services/search", () => ({
  searchListItems: (...args: unknown[]) => {
    asked(...args);
    return Promise.resolve(answers);
  },
}));

import { useListRibbon } from "./useListRibbon";

let seq = 0;
const item = (z: string, field: string, value: string) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  sig: "",
  tags: [
    ["d", `item-${seq}`],
    ["z", z],
    [field, value],
  ],
});

beforeEach(() => {
  asked.mockClear();
  dictionary.data = [places, videos];
  answers = new Map();
});

describe("useListRibbon", () => {
  it("asks every list the Dictionary shows, by the headers its items are filed under, through the lens", async () => {
    renderHook(() =>
      useListRibbon("fork & coin", { pov: "mywot", userPubkey: "1".repeat(64), enabled: true, page: [] }),
    );
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    expect(asked).toHaveBeenCalledWith(
      "fork & coin",
      [
        { key: PLACES, headers: [PLACES] },
        { key: VIDEOS, headers: [VIDEOS] },
      ],
      expect.objectContaining({ pov: "mywot", userPubkey: "1".repeat(64) }),
    );
  });

  it("keeps a list's whole-word matches only — the relay's loose ones don't make a list", async () => {
    const forkAndCoin = item(PLACES, "name", "Fork & Coin");
    answers = new Map([
      [PLACES, { events: [item(PLACES, "name", "Forklift Coins"), forkAndCoin], full: false }],
      [VIDEOS, { events: [item(VIDEOS, "title", "Bitcoin for Beginners")], full: false }],
    ]);
    const { result } = renderHook(() => useListRibbon("fork & coin", { pov: "nosfabrica", enabled: true, page: [] }));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      coordinate: PLACES,
      name: "Food and Drink Places",
      image: "https://example.com/fork.png",
      more: false,
    });
    expect(result.current[0].hits.map((h) => h.event.id)).toEqual([forkAndCoin.id]);
    expect(result.current[0].href).toMatch(/^\/e\//);
  });

  it("counts a list's items on All's page too, however loosely they match, once each", async () => {
    const forkAndCoin = item(PLACES, "name", "Fork & Coin");
    const bitcoin = item(VIDEOS, "title", "Bitcoin for Beginners");
    const note = { ...item("", "title", "a note"), kind: 1, tags: [] };
    answers = new Map([
      [PLACES, { events: [forkAndCoin], full: false }],
      [VIDEOS, { events: [bitcoin], full: false }],
    ]);
    const page = [forkAndCoin, bitcoin, note].map((event) => ({ event, author: null, rank: null }));
    const { result } = renderHook(() => useListRibbon("fork & coin", { pov: "nosfabrica", enabled: true, page }));
    await waitFor(() => expect(asked).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.map((l) => [l.coordinate, l.hits.map((h) => h.event.id)])).toEqual([
        [VIDEOS, [bitcoin.id]],
        [PLACES, [forkAndCoin.id]],
      ]),
    );
  });

  it("puts the list with the most matches first, and says when the cap stopped one", async () => {
    answers = new Map([
      [PLACES, { events: [item(PLACES, "name", "Austin Diner")], full: false }],
      [
        VIDEOS,
        { events: [item(VIDEOS, "title", "Austin at night"), item(VIDEOS, "title", "Austin skyline")], full: true },
      ],
    ]);
    const { result } = renderHook(() => useListRibbon("austin", { pov: "nosfabrica", enabled: true, page: [] }));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((l) => [l.coordinate, l.hits.length, l.more])).toEqual([
      [VIDEOS, 2, true],
      [PLACES, 1, false],
    ]);
  });

  it("asks nothing off the All tab, or with no words to find", async () => {
    renderHook(() => useListRibbon("austin", { pov: "nosfabrica", enabled: false, page: [] }));
    renderHook(() => useListRibbon("sort:recent", { pov: "nosfabrica", enabled: true, page: [] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).not.toHaveBeenCalled();
  });
});
