/**
 * A review of a book is one record, kind 34259 marked `book`, shared with
 * Unbnd (docs/dictionary/books-actions.md, PR #253; its rules are the places
 * contract's with `book:` for `place:`). The checks A to K are that document's
 * section 11; the record is its section 1 example as Unbnd writes it, and the
 * expected values are worked by hand there.
 */
import { describe, expect, it } from "vitest";
import { bookReviewTemplate, standingBookReviews } from "./bookReviews";
import { placeRating, ranksFrom, removalTemplate, weightedStars } from "./placeReviews";

const LIBRARIAN = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const BOOK = `39999:${LIBRARIAN}:ol-ol19722168w`;
const HUB = "wss://dcosl.brainstorm.world";
const NOW = 1_800_000_000;
const A = "a".repeat(64);

type Ev = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };
let n = 0;
const ev = (e: Partial<Ev>): Ev => ({
  id: (e.id ?? String(++n)).padStart(64, "0"),
  kind: 34259,
  pubkey: A,
  created_at: NOW - 3600,
  content: "",
  tags: [],
  ...e,
});

/** The section 1 record, exactly as Unbnd writes it: stars required, no `client`. */
const unbnd = (e: Partial<Ev> = {}) =>
  ev({
    content: "Read it in three sittings. The Gracchi chapters are the best part.",
    tags: [
      ["d", `book:${BOOK}`],
      ["a", BOOK, HUB],
      ["m", "book"],
      ["rating", "0.800"],
      ["s", "4"],
      ["alt", "Review of The storm before the storm: 4 of 5 stars"],
    ],
    ...e,
  });

describe("the books contract, section 11", () => {
  it("A: the section 1 record is one review, 4 stars, with its words", () => {
    const reviews = standingBookReviews([unbnd()], BOOK, NOW);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(4);
    expect(reviews[0].text).toBe("Read it in three sittings. The Gracchi chapters are the best part.");
  });

  it("interop: Brainstorm's record for the same review carries Unbnd's d, a, m, rating and s", () => {
    const ours = bookReviewTemplate(
      { address: BOOK, title: "The storm before the storm" },
      { text: "Read it in three sittings. The Gracchi chapters are the best part.", rating: 4 },
    );
    const theirs = unbnd().tags;
    expect(ours.kind).toBe(34259);
    for (const name of ["d", "a", "m", "rating", "s", "alt"]) {
      expect(ours.tags.find((t) => t[0] === name)).toEqual(theirs.find((t) => t[0] === name));
    }
  });

  it("B: Brainstorm's edit of a review keeps another app's unknown tag, and drops the old client and nonce", () => {
    const theirs = unbnd({ tags: [...unbnd().tags, ["x", "1"], ["client", "Brainstorm"], ["nonce", "12", "16"]] });
    const edit = bookReviewTemplate(
      { address: BOOK, title: "The storm before the storm" },
      { text: "Better the second time.", rating: 5 },
      theirs,
      NOW,
    );
    expect(edit.tags).toContainEqual(["x", "1"]);
    expect(edit.tags.find((t) => t[0] === "client")).toBeUndefined();
    expect(edit.tags.find((t) => t[0] === "nonce")).toBeUndefined();
    expect(edit.tags.find((t) => t[0] === "d")).toEqual(["d", `book:${BOOK}`]);
  });

  it("C: two records by one person a day apart, the older under the bare address, are one review: the newer", () => {
    const older = unbnd({
      created_at: NOW - 2 * 86_400,
      tags: [
        ["d", BOOK],
        ["a", BOOK],
        ["m", "book"],
        ["s", "2"],
      ],
    });
    const newer = unbnd({ created_at: NOW - 86_400 });
    const reviews = standingBookReviews([older, newer], BOOK, NOW);
    expect(reviews.map((r) => r.id)).toEqual([newer.id]);
  });

  it("D: a record dated a year ahead is ignored; the real one stands", () => {
    const real = unbnd();
    const ahead = unbnd({ created_at: NOW + 365 * 86_400, content: "from the future" });
    expect(standingBookReviews([real, ahead], BOOK, NOW).map((r) => r.id)).toEqual([real.id]);
  });

  it("E: a kind 1111 comment with a rating, by a third person, is not a review", () => {
    const comment = ev({
      kind: 1111,
      pubkey: "c".repeat(64),
      tags: [
        ["A", BOOK],
        ["a", BOOK],
        ["rating", "5"],
      ],
    });
    expect(standingBookReviews([comment], BOOK, NOW)).toEqual([]);
  });

  it("F: a record, then its removal (e, a, k), is no review", () => {
    const review = unbnd();
    const removal = ev({
      kind: 5,
      created_at: NOW - 60,
      ...removalTemplate({ id: review.id, pubkey: A, tags: review.tags }),
    });
    expect(removal.tags).toEqual([
      ["e", review.id],
      ["a", `34259:${A}:book:${BOOK}`],
      ["k", "34259"],
    ]);
    expect(standingBookReviews([review, removal], BOOK, NOW)).toEqual([]);
  });

  it("G: stars read from s first, else rating as a fraction or as stars; a 0 or a 7 is no stars", () => {
    const starsFor = (tags: string[][]) =>
      standingBookReviews([ev({ tags: [["d", `book:${BOOK}`], ["a", BOOK], ["m", "book"], ...tags] })], BOOK, NOW)[0]
        .rating;
    expect(
      starsFor([
        ["s", "4"],
        ["rating", "0.800"],
      ]),
    ).toBe(4);
    expect(starsFor([["rating", "4"]])).toBe(4);
    expect(starsFor([["rating", "0.9"]])).toBe(4.5);
    expect(starsFor([["rating", "0"]])).toBeNull();
    expect(starsFor([["rating", "7"]])).toBeNull();
  });

  it("H: ranks 80, 30 and 4 giving 5, 3 and 1 stars are worth 4.5 (4.45); the third is outside the lens", () => {
    const ranks = new Map([
      ["p1", 80],
      ["p2", 30],
      ["p3", 4],
    ]);
    const value = weightedStars(
      [
        { pubkey: "p1", rating: 5 },
        { pubkey: "p2", rating: 3 },
        { pubkey: "p3", rating: 1 },
      ],
      (pk) => ranks.get(pk) ?? null,
    );
    expect(value).toEqual({ value: 4.5, counted: 2 });
  });

  it("I: ranks 0 and 3 giving 5 stars each are worth nothing: no value, never a plain average", () => {
    const ranks = new Map([
      ["p1", 0],
      ["p2", 3],
    ]);
    expect(
      placeRating(
        [
          { pubkey: "p1", rating: 5 },
          { pubkey: "p2", rating: 5 },
        ],
        { curator: ranks },
      ),
    ).toBeNull();
  });

  it("J: a removal through a, then a newer record at the same d: the newer stands", () => {
    const first = unbnd({ created_at: NOW - 7200 });
    const removal = ev({
      kind: 5,
      created_at: NOW - 3600,
      tags: [
        ["a", `34259:${A}:book:${BOOK}`],
        ["k", "34259"],
      ],
    });
    const again = unbnd({ created_at: NOW - 60, content: "Came back to it." });
    expect(standingBookReviews([first, removal, again], BOOK, NOW).map((r) => r.id)).toEqual([again.id]);
  });

  it("K: an edit of a record dated an hour ahead is dated a second after it", () => {
    const ahead = unbnd({ created_at: NOW + 3600 });
    const edit = bookReviewTemplate(
      { address: BOOK, title: "The storm before the storm" },
      { text: "", rating: 3 },
      ahead,
      NOW,
    );
    expect(edit.created_at).toBe(NOW + 3601);
  });

  it("ranks are read from the scorer's newest 30382s, as for places", () => {
    const scorer = "5".repeat(64);
    const rank = (d: string, r: string, at: number) =>
      ev({
        kind: 30382,
        pubkey: scorer,
        created_at: at,
        tags: [
          ["d", d],
          ["rank", r],
        ],
      });
    expect(ranksFrom([rank("p1", "40", 1), rank("p1", "80", 2)], scorer).get("p1")).toBe(80);
  });
});
