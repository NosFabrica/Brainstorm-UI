/**
 * Marketplaces have no notion of a product with options, so sellers publish
 * one listing per size or colour. Readers see one product. The rule is
 * deliberately conservative: same seller, same price, same first photo, and a
 * title that matches up to a dash, en dash or slash.
 */
import { describe, expect, it } from "vitest";
import { parseListing, type Listing } from "./listing";
import { collapseVariants } from "./listingVariants";

const SELLER = "ab".repeat(32);
const make = (title: string, at: number, opts: { seller?: string; price?: [string, string]; image?: string | null } = {}): Listing =>
  parseListing({
    id: `${title}-${at}`.replace(/\W/g, "").padEnd(64, "0").slice(0, 64),
    pubkey: opts.seller ?? SELLER,
    kind: 30402,
    created_at: at,
    content: "",
    tags: [
      ["d", `${title}-${at}`],
      ["title", title],
      ["price", ...(opts.price ?? ["35", "USD"])],
      ...(opts.image === null ? [] : [["image", opts.image ?? "https://img/shirt.jpg"]]),
    ],
  })!;

describe("collapseVariants", () => {
  it("folds one shirt in five sizes into one product, newest first, sizes in order — the coffee stays its own card", () => {
    const shirts = ["XXL", "XL", "LARGE", "MEDIUM", "SMALL"].map((size, i) => make(`SOUND COFFEE T-SHIRT — ${size} / PEPPER`, 500 - i));
    const coffee = make("SOUND COFFEE", 600, { price: ["20", "USD"], image: "https://img/bag.jpg" });
    const groups = collapseVariants([coffee, ...shirts]);
    expect(groups.map((g) => g.title)).toEqual(["SOUND COFFEE", "SOUND COFFEE T-SHIRT"]);
    const shirt = groups[1];
    expect(shirt.primary).toBe(shirts[0]);
    expect(shirt.members).toHaveLength(5);
    expect(shirt.options).toEqual(["XXL / PEPPER", "XL / PEPPER", "LARGE / PEPPER", "MEDIUM / PEPPER", "SMALL / PEPPER"]);
    expect(groups[0].options).toEqual([]);
  });

  it("does not merge what only looks alike: another price, another photo, another seller, or no separator", () => {
    const console_ = make("Nintendo Switch — Console", 10, { price: ["200", "EUR"] });
    const case_ = make("Nintendo Switch — Carry Case", 9, { price: ["15", "EUR"] });
    const blue = make("Poster — Blue", 8, { image: "https://img/blue.jpg" });
    const red = make("Poster — Red", 7, { image: "https://img/red.jpg" });
    const mine = make("Mug — Large", 6);
    const theirs = make("Mug — Small", 5, { seller: "cd".repeat(32) });
    const plain1 = make("Sticker pack", 4);
    const plain2 = make("Sticker pack", 3);
    const groups = collapseVariants([console_, case_, blue, red, mine, theirs, plain1, plain2]);
    expect(groups).toHaveLength(8);
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });

  it("reads a dash, an en dash or a slash with spaces as the option separator — never a hyphen inside a word", () => {
    const a = make("Tee - Blue", 4);
    const b = make("Tee – Red", 3);
    const c = make("Tee / Green", 2);
    const d = make("Tee-shirt", 1);
    const groups = collapseVariants([a, b, c, d]);
    expect(groups.map((g) => g.title)).toEqual(["Tee", "Tee-shirt"]);
    expect(groups[0].options).toEqual(["Blue", "Red", "Green"]);
  });

  it("does not merge listings without a photo, even when everything else matches", () => {
    const a = make("Candle — Vanilla", 2, { image: null });
    const b = make("Candle — Cedar", 1, { image: null });
    expect(collapseVariants([a, b])).toHaveLength(2);
  });
});
