/**
 * A review of a place: a NIP-22 comment on the place item, signed by the
 * reviewer, with the words, any photos, and two things the list lacks — a
 * price from $ to $$$$ and how the reviewer paid. Read from events, written
 * as the template a reader signs, summed up for the page. Expected values
 * are worked by hand.
 */
import { describe, expect, it } from "vitest";
import { commentReviewOf as reviewOf, commentReviewTemplate as reviewTemplate, ratingSummary } from "./commentReviews";
import { paymentSummary, priceSummary } from "./placeReviews";

const PLACE = "39999:4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64:osm-node-13302615652";
const item = {
  id: "1".repeat(64),
  kind: 39999,
  pubkey: "4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64",
  tags: [["d", "osm-node-13302615652"]],
};
const A = "a".repeat(64);
const B = "b".repeat(64);
const comment = (pubkey: string, content: string, extra: string[][] = []) => ({
  id: pubkey.slice(0, 4).padEnd(64, "0"),
  kind: 1111,
  pubkey,
  created_at: 100,
  content,
  tags: [["A", PLACE], ["K", "39999"], ["a", PLACE], ["k", "39999"], ...extra],
});

describe("reviewOf", () => {
  it("reads the words, the photos apart from them, the price and how they paid", () => {
    const r = reviewOf(
      comment(A, "Best pizza on the key.\nhttps://img.example/pie.jpg", [
        ["price", "2"],
        ["paid", "lightning"],
        ["imeta", "url https://img.example/pie.jpg", "m image/jpeg"],
      ]),
      PLACE,
    );
    expect(r).toEqual({
      id: "aaaa".padEnd(64, "0"),
      pubkey: A,
      at: 100,
      text: "Best pizza on the key.",
      photos: ["https://img.example/pie.jpg"],
      price: 2,
      paid: "lightning",
      rating: null,
    });
  });
  it("a comment on something else, or not a comment, or with nothing to say, is not a review", () => {
    expect(reviewOf({ ...comment(A, "nice"), tags: [["A", "39999:x:other"]] }, PLACE)).toBeNull();
    expect(reviewOf({ ...comment(A, "nice"), kind: 1 }, PLACE)).toBeNull();
    expect(reviewOf(comment(A, "   "), PLACE)).toBeNull();
    // A price outside $–$$$$ or an unknown payment is ignored, not the review.
    expect(
      reviewOf(
        comment(A, "ok", [
          ["price", "9"],
          ["paid", "gold"],
        ]),
        PLACE,
      ),
    ).toMatchObject({ price: null, paid: null });
  });
});

describe("a rating, for the things reviewed with stars (a book)", () => {
  it("reads one to five stars from a `rating` tag, and nothing from a number that isn't", () => {
    expect(reviewOf(comment(A, "Gripping.", [["rating", "5"]]), PLACE)).toMatchObject({ rating: 5 });
    expect(reviewOf(comment(A, "Meh.", [["rating", "7"]]), PLACE)).toMatchObject({ rating: null });
    expect(reviewOf(comment(A, "Meh.", []), PLACE)).toMatchObject({ rating: null });
  });
  it("is written as a `rating` tag when the reviewer gave one", () => {
    const t = reviewTemplate(item, { text: "Gripping.", price: null, paid: null, photos: [], rating: 4 }, "wss://r");
    expect(t.tags).toContainEqual(["rating", "4"]);
  });
  it("averages the stars given, to one decimal, with how many gave them", () => {
    expect(ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: null }, { rating: 4 }])).toEqual({
      average: 4.3,
      count: 3,
    });
    expect(ratingSummary([{ rating: null }])).toBeNull();
  });
});

describe("reviewTemplate", () => {
  it("is a NIP-22 root comment on the place, with the price, the payment and the photos as tags, the photos also in the words", () => {
    const t = reviewTemplate(
      item,
      { text: "Best pizza on the key.", price: 2, paid: "lightning", photos: ["https://img.example/pie.jpg"] },
      "wss://dcosl.brainstorm.world",
    );
    expect(t).toEqual({
      kind: 1111,
      content: "Best pizza on the key.\nhttps://img.example/pie.jpg",
      tags: [
        ["A", PLACE, "wss://dcosl.brainstorm.world"],
        ["K", "39999"],
        ["P", item.pubkey],
        ["a", PLACE, "wss://dcosl.brainstorm.world"],
        ["k", "39999"],
        ["p", item.pubkey],
        ["price", "2"],
        ["paid", "lightning"],
        ["imeta", "url https://img.example/pie.jpg"],
      ],
    });
  });
  it("leaves out what the reviewer didn't say", () => {
    const t = reviewTemplate(item, { text: "Fine.", price: null, paid: null, photos: [] }, "wss://r");
    expect(t.content).toBe("Fine.");
    expect(t.tags.map((x) => x[0])).toEqual(["A", "K", "P", "a", "k", "p"]);
  });
});

describe("summaries", () => {
  const reviews = [
    { pubkey: A, price: 2, paid: "lightning" },
    { pubkey: B, price: 3, paid: "card" },
    { pubkey: "c".repeat(64), price: 2, paid: "lightning" },
    { pubkey: "d".repeat(64), price: null, paid: null },
  ];
  it("the price most reviewers gave, as dollar signs, with how many said", () => {
    expect(priceSummary(reviews)).toEqual({ dollars: "$$", count: 3 });
    expect(priceSummary([{ pubkey: A, price: null, paid: null }])).toBeNull();
  });
  it("how people paid, the commonest first, in words", () => {
    expect(paymentSummary(reviews)).toEqual([
      { paid: "lightning", label: "Lightning", count: 2 },
      { paid: "card", label: "Card", count: 1 },
    ]);
  });
});
