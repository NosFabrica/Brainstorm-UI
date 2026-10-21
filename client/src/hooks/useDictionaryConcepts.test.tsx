// @vitest-environment jsdom
/**
 * The Dictionary's concepts as a page gets them: the house's curators, then
 * their self-pointing headers; waited for on a device's first visit,
 * remembered for the next, and never emptied by an answer that came back with
 * nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { CURATOR_TAG, URL_TEMPLATES_CONCEPT } from "@/config/dictionary";
import { parseCoordinate } from "@/lib/dlistFields";

const { HOUSE, house, relays } = vi.hoisted(() => ({
  HOUSE: "4".repeat(64),
  house: { pubkey: "4".repeat(64) as string | null },
  // What each ask has answered so far, whether it has settled, and the key it was last asked by.
  relays: {
    curators: { events: [] as unknown[], settled: false, key: null as string | null },
    concepts: { events: [] as unknown[], settled: false, key: null as string | null },
  },
}));
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => Promise.resolve(house.pubkey) }));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) => {
    const ask = key?.startsWith("dictionary-curators:") ? relays.curators : relays.concepts;
    if (key) ask.key = key;
    return { events: key ? ask.events : [], loading: false, settled: !!key && ask.settled };
  },
}));

import { __forgetDictionaryConcepts, useDictionaryConcepts } from "./useDictionaryConcepts";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const ALICE = "a".repeat(64);
const GITHUB = `39998:${AVI}:github-accounts`;
const BOOKS = `39998:${ALICE}:books`;
const REMEMBERED = `dictionary-concepts:${CURATOR_TAG}`;

let seq = 0;
const ev = (pubkey: string, kind: number, tags: string[][]) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey,
  kind,
  created_at: 100,
  tags,
});
const curator = (person: string) =>
  ev(HOUSE, 39999, [
    ["d", `profile-tag-${person.slice(0, 8)}`],
    ["p", person],
    ["a", CURATOR_TAG],
  ]);
/** The header at a coordinate, pointing at itself. */
const selfPointing = (coordinate: string, plural: string) => {
  const { pubkey, d } = parseCoordinate(coordinate)!;
  return ev(pubkey, 39998, [
    ["d", d],
    ["names", plural, plural],
    ["b", coordinate, "pointer"],
  ]);
};

beforeEach(() => {
  localStorage.clear();
  __forgetDictionaryConcepts();
  house.pubkey = HOUSE;
  for (const ask of Object.values(relays)) Object.assign(ask, { events: [], settled: false, key: null });
});

describe("useDictionaryConcepts", () => {
  it("asks for the house's curator taggings once the house is found, and for headers only once they settle", async () => {
    relays.curators.events = [curator(AVI), curator(ALICE)];
    const { rerender } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(relays.curators.key).toBe(`dictionary-curators:${HOUSE}`));
    expect(relays.concepts.key).toBeNull();

    relays.curators.settled = true;
    rerender();
    expect(relays.concepts.key).toBe(`dictionary-concepts:${[AVI, ALICE].sort().join(",")}`);
  });

  it("on a device's first visit, waits for both answers; then shows the curators' concepts, infrastructure aside", async () => {
    const templates = parseCoordinate(URL_TEMPLATES_CONCEPT!)!.pubkey;
    relays.curators.events = [curator(AVI), curator(templates)];
    relays.concepts.events = [
      selfPointing(GITHUB, "GitHub Accounts"),
      selfPointing(URL_TEMPLATES_CONCEPT!, "URL Templates"),
    ];
    relays.curators.settled = true;
    const { result, rerender } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(relays.concepts.key).not.toBeNull());
    expect(result.current.known).toBe(false);

    relays.concepts.settled = true;
    rerender();
    expect(result.current).toEqual({ shown: [GITHUB], rendered: [GITHUB, URL_TEMPLATES_CONCEPT], known: true });
    expect(JSON.parse(localStorage.getItem(REMEMBERED)!)).toEqual([GITHUB]);
  });

  it("counts only the headers of people the house tagged, and only those pointing at themselves", async () => {
    relays.curators.events = [curator(ALICE)];
    relays.concepts.events = [
      selfPointing(BOOKS, "Books"),
      ev(ALICE, 39998, [["d", "notes"]]),
      selfPointing(GITHUB, "GitHub Accounts"),
    ];
    relays.curators.settled = relays.concepts.settled = true;
    const { result } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(result.current.shown).toEqual([BOOKS]));
  });

  it("on a later visit, decides at once from what it remembered, until the answer settles", async () => {
    localStorage.setItem(REMEMBERED, JSON.stringify([BOOKS]));
    relays.curators.events = [curator(AVI)];
    relays.curators.settled = true;
    relays.concepts.events = [selfPointing(GITHUB, "GitHub Accounts")];
    const { result, rerender } = renderHook(() => useDictionaryConcepts());
    expect(result.current).toMatchObject({ shown: [BOOKS], known: true });
    await waitFor(() => expect(relays.concepts.key).not.toBeNull());
    // Still streaming: what's arrived may be partial.
    expect(result.current.shown).toEqual([BOOKS]);

    relays.concepts.settled = true;
    rerender();
    expect(result.current.shown).toEqual([GITHUB]);
  });

  it("never lets an empty answer replace what it remembered", async () => {
    localStorage.setItem(REMEMBERED, JSON.stringify([BOOKS]));
    relays.curators.settled = true;
    const { result } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(relays.curators.key).not.toBeNull());
    expect(relays.concepts.key).toBeNull();
    expect(result.current).toMatchObject({ shown: [BOOKS], known: true });
    expect(JSON.parse(localStorage.getItem(REMEMBERED)!)).toEqual([BOOKS]);
  });

  it("settles on nothing when the house can't be found, so a page doesn't wait for good", async () => {
    house.pubkey = null;
    const { result } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.shown).toEqual([]);
    expect(relays.curators.key).toBeNull();
  });
});
