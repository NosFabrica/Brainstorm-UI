// @vitest-environment jsdom
/**
 * The Dictionary's concepts as a page gets them: read from the list, waited
 * for on a device's first visit, remembered for the next, and never emptied
 * by an answer that came back with nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { CONCEPT_LIST, CONCEPT_LIST_AUTHOR, CURATOR_TAG, URL_TEMPLATES_CONCEPT } from "@/config/dictionary";

const { HOUSE, answer } = vi.hoisted(() => ({
  HOUSE: "4".repeat(64),
  // What the relays have answered so far, and whether the ask has settled.
  answer: { events: [] as unknown[], settled: false, key: null as string | null },
}));
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => Promise.resolve(HOUSE) }));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) => {
    answer.key = key;
    return { events: key ? answer.events : [], loading: false, settled: !!key && answer.settled };
  },
}));

import { __forgetDictionaryConcepts, useDictionaryConcepts } from "./useDictionaryConcepts";

const ALICE = "a".repeat(64);
const GITHUB = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts";
const BOOKS = "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books";
const REMEMBERED = `dictionary-concepts:${CONCEPT_LIST}`;

let seq = 0;
const ev = (pubkey: string, tags: string[][]) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey,
  kind: 39999,
  created_at: 100,
  tags,
});
const entry = (by: string, concept: string, name: string) =>
  ev(by, [
    ["d", concept],
    ["z", CONCEPT_LIST],
    ["a", concept],
    ["name", name],
  ]);

beforeEach(() => {
  localStorage.clear();
  __forgetDictionaryConcepts();
  Object.assign(answer, { events: [], settled: false, key: null });
});

describe("useDictionaryConcepts", () => {
  it("asks once the house is found, for the list's entries and the house's curator taggings", async () => {
    renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(answer.key).toBe(`dictionary-concepts:${HOUSE}`));
  });

  it("on a device's first visit, waits for the answer; then shows the curated concepts, infrastructure aside", async () => {
    answer.events = [
      entry(CONCEPT_LIST_AUTHOR, GITHUB, "GitHub Accounts"),
      entry(CONCEPT_LIST_AUTHOR, URL_TEMPLATES_CONCEPT!, "URL Templates"),
    ];
    const { result, rerender } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(answer.key).not.toBeNull());
    expect(result.current.known).toBe(false);

    answer.settled = true;
    rerender();
    expect(result.current).toEqual({ shown: [GITHUB], rendered: [GITHUB, URL_TEMPLATES_CONCEPT], known: true });
    expect(JSON.parse(localStorage.getItem(REMEMBERED)!)).toEqual([GITHUB]);
  });

  it("counts the entries of someone the house tagged a curator", async () => {
    answer.events = [
      ev(HOUSE, [
        ["d", "profile-tag-x"],
        ["p", ALICE],
        ["a", CURATOR_TAG],
      ]),
      entry(ALICE, BOOKS, "Books"),
      entry("e".repeat(64), GITHUB, "GitHub Accounts"),
    ];
    answer.settled = true;
    const { result } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(result.current.shown).toEqual([BOOKS]));
  });

  it("on a later visit, decides at once from what it remembered, until the answer settles", async () => {
    localStorage.setItem(REMEMBERED, JSON.stringify([BOOKS]));
    answer.events = [entry(CONCEPT_LIST_AUTHOR, GITHUB, "GitHub Accounts")];
    const { result, rerender } = renderHook(() => useDictionaryConcepts());
    expect(result.current).toMatchObject({ shown: [BOOKS], known: true });
    await waitFor(() => expect(answer.key).not.toBeNull());
    // Still streaming: what's arrived may be partial.
    expect(result.current.shown).toEqual([BOOKS]);

    answer.settled = true;
    rerender();
    expect(result.current.shown).toEqual([GITHUB]);
  });

  it("never lets an empty answer replace what it remembered", async () => {
    localStorage.setItem(REMEMBERED, JSON.stringify([BOOKS]));
    answer.settled = true;
    const { result } = renderHook(() => useDictionaryConcepts());
    await waitFor(() => expect(answer.key).not.toBeNull());
    expect(result.current).toMatchObject({ shown: [BOOKS], known: true });
    expect(JSON.parse(localStorage.getItem(REMEMBERED)!)).toEqual([BOOKS]);
  });
});
