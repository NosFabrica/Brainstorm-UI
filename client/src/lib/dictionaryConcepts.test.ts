/**
 * Who curates the Dictionary and what's in it, from the events that say so:
 * the house's curator taggings and the curators' entries on the list.
 */
import { describe, expect, it } from "vitest";
import { conceptsOf, curatorsOf } from "./dictionaryConcepts";

const LIST_AUTHOR = "1".repeat(64);
const HOUSE = "4".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const MALLORY = "e".repeat(64);
const LIST = `39998:${LIST_AUTHOR}:demo-dictionary-concepts`;
const TAG = `39999:${LIST_AUTHOR}:dictionary-concept-curator`;
const GITHUB = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts";
const BOOKS = "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books";
const VIDEOS = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:divine-videos";

let seq = 0;
const ev = (pubkey: string, tags: string[][], created_at = 100) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey,
  kind: 39999,
  created_at,
  tags,
});
// A person tagging as Brainstorm writes it (lib/tagging-sdk/profile-tagging).
const tagging = (by: string, person: string, polarity?: string, created_at?: number) =>
  ev(
    by,
    [
      ["d", `profile-tag-dictionary-concept-curator-${person.slice(0, 8)}-${by.slice(0, 8)}`],
      ["p", person],
      ["a", TAG],
      ...(polarity ? [["polarity", polarity]] : []),
    ],
    created_at,
  );
const entry = (by: string, concept: string, name: string, extra: string[][] = [], created_at?: number) =>
  ev(by, [["d", concept], ["z", LIST], ["a", concept, "wss://hub"], ["name", name], ...extra], created_at);

const curators = (events: ReturnType<typeof ev>[], house: string | null = HOUSE) =>
  curatorsOf(events, { house, curatorTag: TAG, listAuthor: LIST_AUTHOR });

describe("curatorsOf", () => {
  it("is the list's author, and everyone the house tagged", () => {
    expect(curators([tagging(HOUSE, ALICE), tagging(HOUSE, BOB)])).toEqual([LIST_AUTHOR, ALICE, BOB]);
  });

  it("is the list's author alone when the house can't be found, or has tagged no one", () => {
    expect(curators([tagging(HOUSE, ALICE)], null)).toEqual([LIST_AUTHOR]);
    expect(curators([])).toEqual([LIST_AUTHOR]);
  });

  it("counts only the house's taggings, and only with the curator tag", () => {
    const otherTag = {
      ...tagging(HOUSE, BOB),
      tags: [
        ["d", "x"],
        ["p", BOB],
        ["a", `39999:${HOUSE}:podcaster`],
      ],
    };
    expect(curators([tagging(MALLORY, MALLORY), otherTag])).toEqual([LIST_AUTHOR]);
  });

  it("drops someone the house disputes — the newest tagging decides", () => {
    expect(curators([tagging(HOUSE, ALICE, "1", 100), tagging(HOUSE, ALICE, "-1", 200)])).toEqual([LIST_AUTHOR]);
    expect(curators([tagging(HOUSE, ALICE, "-1", 100), tagging(HOUSE, ALICE, "1", 200)])).toEqual([LIST_AUTHOR, ALICE]);
  });
});

describe("conceptsOf", () => {
  it("is what curators' entries name, by name", () => {
    const events = [entry(LIST_AUTHOR, GITHUB, "GitHub Accounts"), entry(ALICE, BOOKS, "Books")];
    expect(conceptsOf(events, [LIST_AUTHOR, ALICE], LIST)).toEqual([BOOKS, GITHUB]);
  });

  it("ignores anyone who isn't a curator, and entries on other lists", () => {
    const elsewhere = {
      ...entry(LIST_AUTHOR, VIDEOS, "Divine Videos"),
      tags: [
        ["d", VIDEOS],
        ["a", VIDEOS],
      ],
    };
    expect(conceptsOf([entry(MALLORY, BOOKS, "Books"), elsewhere], [LIST_AUTHOR], LIST)).toEqual([]);
  });

  it("counts a concept once, however many curators list it", () => {
    const events = [entry(LIST_AUTHOR, GITHUB, "GitHub Accounts"), entry(ALICE, GITHUB, "GitHub")];
    expect(conceptsOf(events, [LIST_AUTHOR, ALICE], LIST)).toEqual([GITHUB]);
  });

  it("takes out an entry marked removed — the newest version decides — unless another curator still lists it", () => {
    const gone = [
      entry(LIST_AUTHOR, BOOKS, "Books", [], 100),
      entry(LIST_AUTHOR, BOOKS, "Books", [["removed", "yes"]], 200),
    ];
    expect(conceptsOf(gone, [LIST_AUTHOR], LIST)).toEqual([]);
    expect(conceptsOf([...gone, entry(ALICE, BOOKS, "Books")], [LIST_AUTHOR, ALICE], LIST)).toEqual([BOOKS]);
  });

  it("skips an entry whose `a` isn't a list header", () => {
    const note = entry(LIST_AUTHOR, `30023:${ALICE}:an-article`, "An article");
    expect(conceptsOf([note], [LIST_AUTHOR], LIST)).toEqual([]);
  });
});
