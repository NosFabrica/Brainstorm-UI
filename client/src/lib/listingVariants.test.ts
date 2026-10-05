/**
 * Marketplaces have no notion of a product with options, so sellers publish
 * one listing per size or colour. Readers see one product. The rule is
 * deliberately conservative: same seller, same price, same first photo, and a
 * title that matches up to a dash, en dash or slash.
 */
import { describe, expect, it } from "vitest";
import { parseListing, type Listing } from "./listing";
import { collapseVariants, productsFromEvents } from "./listingVariants";

const SELLER = "ab".repeat(32);
const make = (
  title: string,
  at: number,
  opts: { seller?: string; price?: [string, string]; image?: string | null } = {},
): Listing =>
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
    const shirts = ["XXL", "XL", "LARGE", "MEDIUM", "SMALL"].map((size, i) =>
      make(`SOUND COFFEE T-SHIRT — ${size} / PEPPER`, 500 - i),
    );
    const coffee = make("SOUND COFFEE", 600, { price: ["20", "USD"], image: "https://img/bag.jpg" });
    const groups = collapseVariants([coffee, ...shirts]);
    expect(groups.map((g) => g.title)).toEqual(["SOUND COFFEE", "SOUND COFFEE T-SHIRT"]);
    const shirt = groups[1];
    expect(shirt.primary).toBe(shirts[0]);
    expect(shirt.members).toHaveLength(5);
    expect(shirt.options).toEqual([
      "XXL / PEPPER",
      "XL / PEPPER",
      "LARGE / PEPPER",
      "MEDIUM / PEPPER",
      "SMALL / PEPPER",
    ]);
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

// The Open Markets specification says which listings are one product: a
// `variable` parent, and `variation`s that point at it. Where a seller's app
// publishes that, it is the truth and the title guess stands down (issue #158:
// eleven hoodie cards, and the parent offered as one of its own sizes).
describe("collapseVariants — a family the seller declared", () => {
  const HOODIE = "Circular Economy Hoodie – Permissionless / Rules Without Rulers";
  const typed = (
    d: string,
    title: string,
    at: number,
    o: {
      type?: "simple" | "variable" | "variation";
      parent?: string;
      specs?: [string, string][];
      price?: [string, string];
      image?: string;
      seller?: string;
      hidden?: boolean;
    } = {},
  ): Listing =>
    parseListing({
      id: d.replace(/\W/g, "").padEnd(64, "0").slice(0, 64),
      pubkey: o.seller ?? SELLER,
      kind: 30402,
      created_at: at,
      content: "",
      tags: [
        ["d", d],
        ["title", title],
        ["price", ...(o.price ?? ["46.2", "USD"])],
        ["image", o.image ?? "https://img/hoodie.jpg"],
        ...(o.type ? [["type", o.type, "physical"]] : []),
        ...(o.parent ? [["a", o.parent]] : []),
        ...(o.specs ?? []).map(([k, v]) => ["spec", k, v]),
        ...(o.hidden ? [["visibility", "hidden"]] : []),
      ],
    })!;
  const addr = (d: string, seller = SELLER) => `30402:${seller}:${d}`;
  const SIZES = ["6XL", "5XL", "4XL", "3XL", "2XL", "XL", "L", "M", "S", "XS"];
  const parent = typed("hoodie", HOODIE, 100, { type: "variable" });
  // Newest first, as the relay sends them: 6XL down to XS.
  const kids = SIZES.map((size, i) =>
    typed(`hoodie-${size.toLowerCase()}`, `${HOODIE} - ${size}`, 99 - i, {
      type: "variation",
      parent: addr("hoodie"),
      specs: [["Size", size]],
    }),
  );

  it("is one product with ten sizes in size order, and the parent is not one of them", () => {
    const [g, ...rest] = collapseVariants([parent, ...kids]);
    expect(rest).toHaveLength(0);
    expect(g.title).toBe(HOODIE);
    expect(g.primary.id).toBe(parent.id);
    expect(g.parent?.id).toBe(parent.id);
    expect(g.complete).toBe(true);
    expect(g.optionName).toBe("Size");
    expect(g.options).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"]);
    expect(g.members).toHaveLength(10);
    expect(g.members.some((m) => m.id === parent.id)).toBe(false);
    expect(g.priceFrom).toEqual({ price: { amount: 46.2, currency: "USD" }, varies: false });
  });

  it("groups by the parent link even when titles, prices and photos all differ", () => {
    const red = typed("mug-red", "Crimson cup", 5, {
      type: "variation",
      parent: addr("mug"),
      specs: [["Colour", "Red"]],
      price: ["12", "USD"],
      image: "https://img/red.jpg",
    });
    const blue = typed("mug-blue", "Ocean vessel", 4, {
      type: "variation",
      parent: addr("mug"),
      specs: [["Colour", "Blue"]],
      price: ["9", "USD"],
      image: "https://img/blue.jpg",
    });
    const mug = typed("mug", "Mug", 6, { type: "variable", price: ["12", "USD"] });
    const [g, ...rest] = collapseVariants([mug, red, blue]);
    expect(rest).toHaveLength(0);
    expect(g.options).toEqual(["Red", "Blue"]);
    expect(g.priceFrom).toEqual({ price: { amount: 9, currency: "USD" }, varies: true });
  });

  it("keeps two families apart however alike their titles and photos are", () => {
    const a = typed("tee-a", "Logo Tee", 9, { type: "variable" });
    const b = typed("tee-b", "Logo Tee", 8, { type: "variable" });
    const groups = collapseVariants([
      a,
      b,
      typed("tee-a-m", "Logo Tee - M", 7, { type: "variation", parent: addr("tee-a"), specs: [["Size", "M"]] }),
      typed("tee-b-m", "Logo Tee - M", 6, { type: "variation", parent: addr("tee-b"), specs: [["Size", "M"]] }),
    ]);
    expect(groups.map((g) => [g.primary.id === a.id || g.primary.id === b.id, g.options])).toEqual([
      [true, ["M"]],
      [true, ["M"]],
    ]);
  });

  it("folds sizes whose parent is not in hand into one product, and does not call it complete", () => {
    const [g, ...rest] = collapseVariants(kids.slice(0, 3));
    expect(rest).toHaveLength(0);
    expect(g.parent).toBeNull();
    expect(g.complete).toBe(false);
    // The newest size leads; the title is the product's, without its own size.
    expect(g.primary.id).toBe(kids[0].id);
    expect(g.title).toBe(HOODIE);
    expect(g.options).toEqual(["4XL", "5XL", "6XL"]);
  });

  it("joins several specs into one label, and names no single option", () => {
    const tee = typed("tee", "Tee", 9, { type: "variable" });
    const [g] = collapseVariants([
      tee,
      typed("tee-red-l", "Tee red L", 8, {
        type: "variation",
        parent: addr("tee"),
        specs: [
          ["Colour", "Red"],
          ["Size", "L"],
        ],
      }),
      typed("tee-blue-m", "Tee blue M", 7, {
        type: "variation",
        parent: addr("tee"),
        specs: [
          ["Colour", "Blue"],
          ["Size", "M"],
        ],
      }),
    ]);
    expect(g.options).toEqual(["Red / L", "Blue / M"]);
    expect(g.optionName).toBeNull();
  });

  it("does not let another seller attach a listing to someone's product", () => {
    const stranger = typed("fake", `${HOODIE} - XXS`, 50, {
      type: "variation",
      parent: addr("hoodie"),
      specs: [["Size", "XXS"]],
      seller: "cd".repeat(32),
    });
    const groups = collapseVariants([parent, ...kids, stranger]);
    expect(groups).toHaveLength(2);
    expect(groups[0].options).toHaveLength(10);
    expect(groups[1].primary.id).toBe(stranger.id);
    expect(groups[1].options).toEqual([]);
  });

  it("never applies the title guess to a listing that says what it is", () => {
    const groups = collapseVariants([
      typed("s1", "T-SHIRT — XL", 3, { type: "simple", price: ["35", "USD"], image: "https://img/shirt.jpg" }),
      typed("s2", "T-SHIRT — L", 2, { type: "simple", price: ["35", "USD"], image: "https://img/shirt.jpg" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("is a plain product when a parent's sizes are not in hand", () => {
    const [g, ...rest] = collapseVariants([parent]);
    expect(rest).toHaveLength(0);
    expect(g.primary.id).toBe(parent.id);
    expect(g.options).toEqual([]);
    expect(g.complete).toBe(true);
  });
});

describe("productsFromEvents — what is hidden stays hidden", () => {
  const SELLER2 = "ef".repeat(32);
  const event = (d: string, title: string, at: number, extra: string[][]) => ({
    id: d.replace(/\W/g, "").padEnd(64, "0").slice(0, 64),
    pubkey: SELLER2,
    kind: 30402,
    created_at: at,
    content: "",
    tags: [["d", d], ["title", title], ["price", "20", "USD"], ["image", "https://img/x.jpg"], ...extra],
  });
  const P = `30402:${SELLER2}:cap`;

  it("leaves a hidden size out of the options", () => {
    const [p, ...rest] = productsFromEvents([
      event("cap", "Cap", 9, [["type", "variable", "physical"]]),
      event("cap-s", "Cap - S", 8, [
        ["type", "variation", "physical"],
        ["a", P],
        ["spec", "Size", "S"],
      ]),
      event("cap-m", "Cap - M", 7, [
        ["type", "variation", "physical"],
        ["a", P],
        ["spec", "Size", "M"],
        ["visibility", "hidden"],
      ]),
    ]);
    expect(rest).toHaveLength(0);
    expect(p.group.options).toEqual(["S"]);
  });

  it("shows nothing of a product whose parent the seller hid", () => {
    const products = productsFromEvents([
      event("cap", "Cap", 9, [
        ["type", "variable", "physical"],
        ["visibility", "hidden"],
      ]),
      event("cap-s", "Cap - S", 8, [
        ["type", "variation", "physical"],
        ["a", P],
        ["spec", "Size", "S"],
      ]),
      event("mug", "Mug", 6, []),
    ]);
    expect(products.map((p) => p.group.title)).toEqual(["Mug"]);
  });
});
