/**
 * Who curates the Dictionary and what's in it, from the events that say so:
 * the house's curator taggings and the curators' self-pointing headers.
 */
import { describe, expect, it } from "vitest";
import { conceptsOf, curatorsOf } from "./dictionaryConcepts";

const TAG_AUTHOR = "1".repeat(64);
const HOUSE = "4".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const MALLORY = "e".repeat(64);
const TAG = `39999:${TAG_AUTHOR}:dictionary-concept-curator`;

let seq = 0;
const ev = (pubkey: string, tags: string[][], created_at = 100, kind = 39999) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey,
  kind,
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
/** A list header; `self` points it at itself, as its author's candidate community concept. */
const header = (
  by: string,
  d: string,
  plural: string,
  { self = true, extra = [] as string[][], created_at = 100 } = {},
) =>
  ev(
    by,
    [
      ["d", d],
      ["names", plural.replace(/s$/, ""), plural],
      ...(self ? [["b", `39998:${by}:${d}`, "pointer"]] : []),
      ...extra,
    ],
    created_at,
    39998,
  );
const at = (by: string, d: string) => `39998:${by}:${d}`;

const curators = (events: ReturnType<typeof ev>[], house: string | null = HOUSE) =>
  curatorsOf(events, { house, curatorTag: TAG });

describe("curatorsOf", () => {
  it("is everyone the house tagged", () => {
    expect(curators([tagging(HOUSE, ALICE), tagging(HOUSE, BOB)])).toEqual([ALICE, BOB]);
  });

  it("is no one when the house can't be found, or has tagged no one", () => {
    expect(curators([tagging(HOUSE, ALICE)], null)).toEqual([]);
    expect(curators([])).toEqual([]);
  });

  it("leaves out the tag's author, and the house, unless the house tagged them", () => {
    expect(curators([tagging(HOUSE, ALICE)])).toEqual([ALICE]);
    expect(curators([tagging(HOUSE, HOUSE)])).toEqual([HOUSE]);
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
    expect(curators([tagging(MALLORY, MALLORY), otherTag])).toEqual([]);
  });

  it("drops someone the house disputes — the newest tagging decides", () => {
    expect(curators([tagging(HOUSE, ALICE, "1", 100), tagging(HOUSE, ALICE, "-1", 200)])).toEqual([]);
    expect(curators([tagging(HOUSE, ALICE, "-1", 100), tagging(HOUSE, ALICE, "1", 200)])).toEqual([ALICE]);
  });
});

describe("conceptsOf", () => {
  it("is the curators' headers that point at themselves, by name", () => {
    const events = [header(ALICE, "github-accounts", "GitHub Accounts"), header(BOB, "books", "Books")];
    expect(conceptsOf(events, [ALICE, BOB])).toEqual([at(BOB, "books"), at(ALICE, "github-accounts")]);
  });

  it("leaves out a header with no self-pointer: a list of one's own, a copy, a withdrawn copy", () => {
    const events = [
      header(ALICE, "notes", "Notes", { self: false }),
      header(ALICE, "books", "Books", { self: false, extra: [["b", at(BOB, "books"), "pointer"]] }),
      header(ALICE, "videos", "Videos", { self: false, extra: [["b", "b-tag-deferred"]] }),
    ];
    expect(conceptsOf(events, [ALICE])).toEqual([]);
  });

  it("ignores anyone who isn't a curator, and anything that isn't a list header", () => {
    const item = { ...header(ALICE, "books", "Books"), kind: 39999 };
    expect(conceptsOf([header(MALLORY, "books", "Books"), item], [ALICE])).toEqual([]);
  });

  it("takes a header out when its newest version drops the self-pointer", () => {
    const gone = [
      header(ALICE, "books", "Books", { created_at: 100 }),
      header(ALICE, "books", "Books", { self: false, created_at: 200 }),
    ];
    expect(conceptsOf(gone, [ALICE])).toEqual([]);
    const back = [
      header(ALICE, "books", "Books", { self: false, created_at: 100 }),
      header(ALICE, "books", "Books", { created_at: 200 }),
    ];
    expect(conceptsOf(back, [ALICE])).toEqual([at(ALICE, "books")]);
  });
});
