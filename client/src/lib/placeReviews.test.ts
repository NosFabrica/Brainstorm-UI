/**
 * A review of a place is one record, kind 34259, shared with Regulars
 * (docs/dictionary/food-and-drink-places-actions.md). The checks A to I are
 * that document's section 11, which both apps' tests hold; the records are
 * its section 3 example, and the expected values are worked by hand there.
 */
import { describe, expect, it } from "vitest";
import {
  draftOf,
  placeRating,
  placeReviewTemplate,
  ranksFrom,
  removalTemplate,
  standingReviews,
  weightedStars,
} from "./placeReviews";

const CURATOR = "4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64";
const PLACE = `39999:${CURATOR}:osm-node-11330857543`;
const NOW = 1_800_000_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const PHOTO = "https://blossom.example/abc.jpg";

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

/** The section 3 record as Regulars writes it: no price, no payment, no photos. */
const regulars = (e: Partial<Ev> = {}) =>
  ev({
    content: "Get the bolo de caco with garlic butter.",
    tags: [
      ["d", `place:${PLACE}`],
      ["a", PLACE],
      ["m", "place"],
      ["rating", "0.800"],
      ["s", "4"],
      ["alt", "Review of Jacafé: 4 of 5 stars"],
    ],
    ...e,
  });

/** The section 3 record in full, as Brainstorm writes it. */
const full = (e: Partial<Ev> = {}) =>
  regulars({
    content: `Get the bolo de caco with garlic butter.\n${PHOTO}`,
    tags: [...regulars().tags, ["price", "2"], ["paid", "lightning"], ["imeta", `url ${PHOTO}`]],
    ...e,
  });

describe("the checks both apps hold (section 11)", () => {
  it("A: the record as Regulars writes it is one review, 4 stars, the words", () => {
    const out = standingReviews([regulars()], PLACE, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pubkey: A, rating: 4, text: "Get the bolo de caco with garlic butter." });
  });

  it("B: the record in full is one review, 4 stars, the words without the photo's address", () => {
    const [r] = standingReviews([full()], PLACE, NOW);
    expect(r).toMatchObject({
      rating: 4,
      text: "Get the bolo de caco with garlic butter.",
      photos: [PHOTO],
      price: 2,
      paid: "lightning",
    });
  });

  it("H: stars read the one way — s first, else the rating as a fraction or as stars; a 0 or a 7 is no stars", () => {
    const stars = (tags: string[][]) =>
      standingReviews([ev({ content: "Fine.", tags: [["a", PLACE], ...tags] })], PLACE, NOW)[0].rating;
    expect(
      stars([
        ["s", "4"],
        ["rating", "0.800"],
      ]),
    ).toBe(4);
    expect(stars([["rating", "4"]])).toBe(4);
    expect(stars([["rating", "0.9"]])).toBe(4.5);
    expect(stars([["rating", "0"]])).toBeNull();
    expect(stars([["rating", "7"]])).toBeNull();
  });

  it("D: one person's two records a day apart, the older under the bare address, are one review: the newer", () => {
    const older = ev({
      content: "Older.",
      created_at: NOW - 2 * 86_400,
      tags: [
        ["d", PLACE],
        ["s", "2"],
      ],
    });
    const newer = regulars({ content: "Newer.", created_at: NOW - 86_400 });
    const out = standingReviews([newer, older], PLACE, NOW);
    expect(out.map((r) => r.text)).toEqual(["Newer."]);
    expect(standingReviews([older, newer], PLACE, NOW).map((r) => r.text)).toEqual(["Newer."]);
  });

  it("E: a record dated a year ahead is ignored, and the real one stands", () => {
    const real = regulars({ content: "Real." });
    const ahead = regulars({ content: "From the future.", created_at: NOW + 365 * 86_400 });
    expect(standingReviews([real, ahead], PLACE, NOW).map((r) => r.text)).toEqual(["Real."]);
  });

  it("F: a comment on the place by a third person is not a review, and counts stay as they were", () => {
    const comment = ev({
      kind: 1111,
      pubkey: C,
      content: "Nice spot.",
      tags: [
        ["A", PLACE],
        ["a", PLACE],
      ],
    });
    const out = standingReviews([regulars(), full({ pubkey: B }), comment], PLACE, NOW);
    expect(out.map((r) => r.pubkey).sort()).toEqual([A, B]);
  });

  it("G: a record, then its removal (kind 5 with e, a, k), is no review", () => {
    const review = regulars();
    const removal = ev({
      kind: 5,
      created_at: NOW,
      tags: [
        ["e", review.id],
        ["a", `34259:${A}:place:${PLACE}`],
        ["k", "34259"],
      ],
    });
    expect(standingReviews([review, removal], PLACE, NOW)).toEqual([]);
  });
});

describe("the record a reader signs (section 3)", () => {
  const place = { address: PLACE, name: "Jacafé" };

  it("is the section 3 example: the place twice, the mark, the stars both ways, a line for other apps, then what's optional", () => {
    const out = placeReviewTemplate(place, {
      text: "Get the bolo de caco with garlic butter.",
      rating: 4,
      price: 2,
      paid: "lightning",
      photos: [PHOTO],
    });
    expect(out).toEqual({
      kind: 34259,
      content: `Get the bolo de caco with garlic butter.\n${PHOTO}`,
      tags: [
        ["d", `place:${PLACE}`],
        ["a", PLACE],
        ["m", "place"],
        ["rating", "0.800"],
        ["s", "4"],
        ["alt", "Review of Jacafé: 4 of 5 stars"],
        ["price", "2"],
        ["paid", "lightning"],
        ["imeta", `url ${PHOTO}`],
      ],
    });
  });

  it("C: changing the stars on a full record keeps its price, payment and photo, unchanged", () => {
    const rich = ["imeta", `url ${PHOTO}`, "m image/jpeg", "dim 1200x800"];
    const before = full({ tags: [...full().tags.filter((t) => t[0] !== "imeta"), rich] });
    const [mine] = standingReviews([before], PLACE, NOW);
    const out = placeReviewTemplate(place, { ...draftOf(mine), rating: 5 }, before);
    expect(out.tags).toContainEqual(["s", "5"]);
    expect(out.tags).toContainEqual(["price", "2"]);
    expect(out.tags).toContainEqual(["paid", "lightning"]);
    expect(out.tags).toContainEqual(rich);
    expect(out.tags.filter((t) => t[0] === "imeta")).toHaveLength(1);
  });

  it("an edit carries over, unchanged and in their order, the tags this page doesn't set", () => {
    const before = regulars({ tags: [...regulars().tags, ["t", "brunch"], ["L", "x.y"], ["l", "z", "x.y"]] });
    const [mine] = standingReviews([before], PLACE, NOW);
    const out = placeReviewTemplate(place, { ...draftOf(mine), price: 1 }, before);
    expect(out.tags.filter((t) => ["t", "L", "l"].includes(t[0]))).toEqual([
      ["t", "brunch"],
      ["L", "x.y"],
      ["l", "z", "x.y"],
    ]);
    expect(out.tags).toContainEqual(["price", "1"]);
  });

  it("dates an edit later than the version it replaces, though that one's clock ran ahead", () => {
    const before = regulars({ created_at: NOW + 600 });
    const [mine] = standingReviews([before], PLACE, NOW);
    expect(placeReviewTemplate(place, draftOf(mine), before, NOW).created_at).toBe(NOW + 601);
    const older = regulars({ created_at: NOW - 600 });
    expect(placeReviewTemplate(place, draftOf(mine), older, NOW).created_at).toBe(NOW);
  });

  it("writes the edit at the same d it replaces, though that d is the bare address", () => {
    const before = ev({
      content: "Old.",
      tags: [
        ["d", PLACE],
        ["s", "3"],
      ],
    });
    const [mine] = standingReviews([before], PLACE, NOW);
    const out = placeReviewTemplate(place, draftOf(mine), before);
    expect(out.tags.filter((t) => t[0] === "d")).toEqual([["d", PLACE]]);
  });
});

describe("removals", () => {
  it("one naming the review by id alone — as Regulars sends it — removes it", () => {
    const review = regulars();
    const removal = ev({
      kind: 5,
      created_at: NOW,
      tags: [
        ["e", review.id],
        ["k", "34259"],
      ],
    });
    expect(standingReviews([review, removal], PLACE, NOW)).toEqual([]);
  });

  it("one naming the address removes what was written up to it, not a review written after", () => {
    const at = `34259:${A}:place:${PLACE}`;
    const removal = ev({
      kind: 5,
      created_at: NOW - 100,
      tags: [
        ["a", at],
        ["k", "34259"],
      ],
    });
    expect(standingReviews([regulars({ created_at: NOW - 200 }), removal], PLACE, NOW)).toEqual([]);
    expect(standingReviews([regulars({ created_at: NOW - 50 }), removal], PLACE, NOW)).toHaveLength(1);
  });

  it("only the reviewer can remove their review", () => {
    const review = regulars();
    const removal = ev({
      kind: 5,
      pubkey: B,
      created_at: NOW,
      tags: [
        ["e", review.id],
        ["k", "34259"],
      ],
    });
    expect(standingReviews([review, removal], PLACE, NOW)).toHaveLength(1);
  });
});

describe("the removal a reader signs (section 6)", () => {
  it("names the review by id and by address, with the kind, and the page reads it as removed", () => {
    const review = full();
    const [mine] = standingReviews([review], PLACE, NOW);
    const out = removalTemplate(mine);
    expect(out).toEqual({
      kind: 5,
      content: "",
      tags: [
        ["e", review.id],
        ["a", `34259:${A}:place:${PLACE}`],
        ["k", "34259"],
      ],
    });
    expect(standingReviews([review, ev({ ...out, created_at: NOW })], PLACE, NOW)).toEqual([]);
  });
});

describe("a star value for the place (section 8)", () => {
  it("I: reviewers ranked 80, 30 and 4 giving 5, 3 and 1 stars make 4.5; the third is outside the lens", () => {
    const reviews = [
      { pubkey: A, rating: 5 },
      { pubkey: B, rating: 3 },
      { pubkey: C, rating: 1 },
    ];
    const rank = new Map([
      [A, 80],
      [B, 30],
      [C, 4],
    ]);
    expect(weightedStars(reviews, (pk) => rank.get(pk) ?? null)).toEqual({ value: 4.5, counted: 2 });
  });

  it("counts no review without stars or without a rank, and gives no value when nothing counts", () => {
    const reviews = [
      { pubkey: A, rating: null },
      { pubkey: B, rating: 4 },
    ];
    expect(weightedStars(reviews, (pk) => (pk === A ? 90 : null))).toBeNull();
  });
});

describe("a lens's ranks (kind 30382, by the scorer a kind 10040 names)", () => {
  const SCORER = "e".repeat(64);
  const rank = (subject: string, value: string, created_at = NOW, pubkey = SCORER) =>
    ev({
      kind: 30382,
      pubkey,
      created_at,
      tags: [
        ["d", subject],
        ["rank", value],
      ],
    });

  it("reads each person's rank from the scorer's newest event about them", () => {
    const ranks = ranksFrom([rank(A, "40", NOW - 10), rank(A, "98"), rank(B, "12.5")], SCORER);
    expect(ranks).toEqual(
      new Map([
        [A, 98],
        [B, 12.5],
      ]),
    );
  });

  it("leaves out another scorer's ranks, and a newest event with no rank from 0 to 100", () => {
    const ranks = ranksFrom([rank(A, "98", NOW, C), rank(B, "40", NOW - 10), rank(B, "120"), rank(C, "x")], SCORER);
    expect(ranks.size).toBe(0);
  });
});

describe("the star value a page shows, and whose lens it is", () => {
  const reviews = [
    { pubkey: A, rating: 4 },
    { pubkey: B, rating: 2 },
  ];

  it("the reader's own lens first", () => {
    const you = new Map([[B, 50]]);
    const curator = new Map([[A, 98]]);
    expect(placeRating(reviews, { you, curator })).toEqual({ value: 2, counted: 1, lens: "you" });
  });

  it("the curator's lens when nobody the reader trusts gave stars, or for a visitor", () => {
    const curator = new Map([[A, 98]]);
    expect(placeRating(reviews, { you: new Map(), curator })).toEqual({ value: 4, counted: 1, lens: "curator" });
    expect(placeRating(reviews, { curator })).toEqual({ value: 4, counted: 1, lens: "curator" });
  });

  it("no value when nobody in either lens gave stars", () => {
    expect(placeRating(reviews, { you: new Map(), curator: null })).toBeNull();
  });
});
