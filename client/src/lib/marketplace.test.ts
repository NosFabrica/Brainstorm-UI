/**
 * The Open Markets kinds around a listing — collections, shipping options,
 * product reviews — and how a product's shipping is priced from them. Shapes
 * from the spec and from the production relay (probed 2026-10-16).
 */
import { describe, expect, it } from "vitest";
import { parseListing } from "./listing";
import {
  parseCollection,
  parseProductReview,
  parseShippingOption,
  productReviewTotal,
  shippingCostLabel,
  shippingRows,
} from "./marketplace";

const M = "c".repeat(64);
const ev = (kind: number, tags: string[][], content = "") => ({ kind, pubkey: M, tags, content });

describe("parseShippingOption — kind 30406", () => {
  it("reads the spec's standard option: price, where, how, how fast, and its limits", () => {
    const o = parseShippingOption(
      ev(
        30406,
        [
          ["d", "standard-regional"],
          ["title", "Standard Shipping"],
          ["price", "5.99", "USD"],
          ["country", "US"],
          ["region", "US-FL"],
          ["service", "standard"],
          ["carrier", "USPS"],
          ["duration", "24", "72", "H"],
          ["weight-max", "30", "kg"],
          ["dim-max", "120x60x60", "cm"],
          ["price-weight", "0.75", "USD", "kg"],
        ],
        "Standard Regional Shipping",
      ),
    );
    expect(o).toMatchObject({
      title: "Standard Shipping",
      price: { amount: 5.99, currency: "USD" },
      countries: ["US"],
      regions: ["US-FL"],
      service: "standard",
      carrier: "USPS",
      duration: { min: 24, max: 72, unit: "H" },
      description: "Standard Regional Shipping",
    });
    expect(o?.limits).toEqual([
      ["Max weight", "30 kg"],
      ["Max size", "120x60x60 cm"],
      ["Per weight", "$0.75 / kg"],
    ]);
  });

  it("several country codes in one tag are all where it ships", () => {
    const o = parseShippingOption(
      ev(30406, [
        ["title", "EU"],
        ["price", "9", "EUR"],
        ["country", "de", "FR", "IT"],
        ["service", "express"],
      ]),
    );
    expect(o?.countries).toEqual(["DE", "FR", "IT"]);
  });

  it("the shape published so far — title, price, service, no country — is an option", () => {
    const o = parseShippingOption(
      ev(30406, [
        ["d", "shipping_1790552607033_w1fsv"],
        ["title", "Digital Delivery"],
        ["price", "0", "USD"],
        ["service", "digital"],
      ]),
    );
    expect(o).toMatchObject({ title: "Digital Delivery", service: "digital", countries: [] });
  });

  it("Shopstr's escrow records on 30406 are not shipping options", () => {
    expect(parseShippingOption(ev(30406, [["d", "escrow-1"]], "ciphertext?iv=abc"))).toBeNull();
    expect(
      parseShippingOption(
        ev(30406, [
          ["d", "escrow-2"],
          ["title", "Escrow"],
        ]),
      ),
    ).toBeNull();
  });
});

describe("parseCollection — kind 30405", () => {
  it("reads the title, summary, picture, products and shipping options", () => {
    const c = parseCollection(
      ev(
        30405,
        [
          ["d", "wallets"],
          ["title", "Hardware Wallets"],
          ["summary", "Various Hardware Wallets"],
          ["image", "https://img/wallets.jpg"],
          ["a", `30402:${M}:krux`],
          ["a", `30402:${M}:krux`],
          ["a", `30405:${M}:other`],
          ["shipping_option", `30406:${M}:standard`],
        ],
        "At good price entry points.",
      ),
    );
    expect(c).toMatchObject({
      title: "Hardware Wallets",
      summary: "Various Hardware Wallets",
      description: "At good price entry points.",
      image: "https://img/wallets.jpg",
      products: [`30402:${M}:krux`],
    });
    expect(c?.shippingRefs.map((r) => r.address)).toEqual([`30406:${M}:standard`]);
  });

  it("Shopstr's encrypted carts on 30405 are not collections", () => {
    expect(parseCollection(ev(30405, [["d", "cart"]], "AgB3x9…encrypted"))).toBeNull();
  });
});

describe("parseProductReview — kind 31555", () => {
  const review = (tags: string[][], content = "Great seed plate") =>
    parseProductReview(ev(31555, [["d", `a:30402:${M}:seed-plate`], ...tags], content));

  it("names the product, the thumb and each category", () => {
    const r = review([
      ["rating", "1", "thumb"],
      ["rating", "0.8", "value"],
      ["rating", "1.0", "quality"],
      ["rating", "0.6", "delivery"],
      ["rating", "0.9", "communication"],
    ]);
    expect(r?.product).toBe(`30402:${M}:seed-plate`);
    expect(r?.thumb).toBe(1);
    expect(r?.categories.map((c) => c.name)).toEqual(["value", "quality", "delivery", "communication"]);
    expect(r?.text).toBe("Great seed plate");
    // 1 × 0.5 + 0.5 × mean(0.8, 1, 0.6, 0.9) = 0.5 + 0.4125
    expect(r?.total).toBeCloseTo(0.9125, 6);
  });

  it("without categories the thumb is the total", () => {
    expect(review([["rating", "0", "thumb"]])?.total).toBe(0);
    expect(productReviewTotal(1, [])).toBe(1);
  });

  it("the formula: thumb at half weight, the categories' mean at the other half", () => {
    expect(productReviewTotal(0, [1, 1])).toBe(0.5);
    expect(productReviewTotal(1, [0])).toBe(0.5);
    expect(productReviewTotal(0.5, [0.2, 0.4])).toBeCloseTo(0.4, 6);
  });

  it("needs the thumb, on the 0..1 scale, and a product in `d`", () => {
    expect(review([["rating", "0.8", "value"]])).toBeNull();
    expect(review([["rating", "4", "thumb"]])).toBeNull();
    expect(
      parseProductReview(
        ev(31555, [
          ["d", "not-a-product"],
          ["rating", "1", "thumb"],
        ]),
      ),
    ).toBeNull();
  });

  it("a category scored off the scale is dropped, not counted", () => {
    const r = review([
      ["rating", "1", "thumb"],
      ["rating", "7", "value"],
      ["rating", "0", "delivery"],
    ]);
    expect(r?.categories).toEqual([{ name: "delivery", score: 0 }]);
    expect(r?.total).toBe(0.5);
  });
});

describe("shipping a product — the option's price plus the product's extra cost", () => {
  const option = (d: string, tags: string[][]) => ({
    kind: 30406,
    pubkey: M,
    content: "",
    tags: [["d", d], ...tags],
  });
  const standard = option("standard", [
    ["title", "Standard"],
    ["price", "5.99", "USD"],
    ["country", "US", "CA"],
    ["service", "standard"],
    ["duration", "2", "5", "D"],
  ]);
  const pickup = option("pickup", [
    ["title", "Store pickup"],
    ["price", "0", "USD"],
    ["service", "pickup"],
  ]);
  const collection = {
    kind: 30405,
    pubkey: M,
    content: "",
    tags: [
      ["d", "wallets"],
      ["title", "Hardware Wallets"],
      ["shipping_option", `30406:${M}:pickup`],
      ["shipping_option", `30406:${M}:standard`],
    ],
  };
  const store = new Map<string, { kind: number; pubkey: string; content: string; tags: string[][] }>([
    [`30406:${M}:standard`, standard],
    [`30406:${M}:pickup`, pickup],
    [`30405:${M}:wallets`, collection],
  ]);
  const listing = (tags: string[][]) =>
    parseListing({
      id: "l",
      pubkey: M,
      kind: 30402,
      created_at: 1,
      content: "",
      tags: [["title", "Krux"], ["price", "120", "USD"], ...tags],
    })!;

  it("a direct option: its own title and facts, priced at its price plus the extra", () => {
    const rows = shippingRows(listing([["shipping_option", `30406:${M}:standard`, "2"]]), (a) => store.get(a));
    expect(rows).toEqual([
      expect.objectContaining({
        title: "Standard",
        cost: "$7.99",
        service: "Standard",
        countries: "US, CA",
        duration: "2–5 days",
        via: null,
        resolved: true,
      }),
    ]);
  });

  it("a collection's options, each with the product's extra applied, merged with its own", () => {
    const rows = shippingRows(
      listing([
        ["shipping_option", `30406:${M}:standard`],
        ["shipping_option", `30405:${M}:wallets`, "1"],
      ]),
      (a) => store.get(a),
    );
    // Standard is the product's own (its own reference wins); pickup comes from the collection, +$1.
    expect(rows.map((r) => [r.title, r.cost, r.via])).toEqual([
      ["Standard", "$5.99", null],
      ["Store pickup", "$1", "Hardware Wallets"],
    ]);
  });

  it("an option not found still says there is one, with its extra — never its raw address", () => {
    const rows = shippingRows(
      listing([
        ["shipping_option", `30406:${M}:voltvault-worldwide-free-shipping`, "3"],
        ["shipping_option", `30406:${M}:9ac5a9a316a647559a7597c2d6fdfb21`],
      ]),
      () => undefined,
    );
    expect(rows.map((r) => [r.title, r.cost, r.resolved])).toEqual([
      ["Voltvault worldwide free shipping", "+$3", false],
      ["Shipping option", null, false],
    ]);
  });

  it("Shopstr's priced options are kept, borrowing the listing's money when they name none", () => {
    const rows = shippingRows(listing([["shipping", "Added Cost", "4", ""]]), () => undefined);
    expect(rows.map((r) => [r.title, r.cost])).toEqual([["Added Cost", "$4"]]);
  });

  it("an extra in another currency than the option's is shown beside it, not added", () => {
    expect(shippingCostLabel({ amount: 5, currency: "EUR" }, 2, "USD")).toBe("€5 + $2");
    expect(shippingCostLabel({ amount: 0, currency: "USD" }, null, "USD")).toBe("Free");
    expect(shippingCostLabel(null, null, "USD")).toBeNull();
  });

  it("sats are one money however spelled: SAT, SATS, sat and sats add up", () => {
    expect(shippingCostLabel({ amount: 1000, currency: "SAT" }, 500, "SATS")).toBe("1,500 sats");
    expect(shippingCostLabel({ amount: 1000, currency: "SATS" }, 500, "sat")).toBe("1,500 sats");
    expect(shippingCostLabel({ amount: 1000, currency: "sats" }, 500, "SAT")).toBe("1,500 sats");
    expect(shippingCostLabel({ amount: 5, currency: "usd" }, 2, "USD")).toBe("$7");
  });

  it("a sum carries no float noise: 0.1 + 0.2 BTC is 0.3 BTC, and BTC keeps at most eight decimals", () => {
    expect(shippingCostLabel({ amount: 0.1, currency: "BTC" }, 0.2, "BTC")).toBe("0.3 BTC");
    expect(shippingCostLabel({ amount: 0.00012345, currency: "BTC" }, 0.000000001, "BTC")).toBe("0.00012345 BTC");
    expect(shippingCostLabel({ amount: 5.99, currency: "USD" }, 0.01, "USD")).toBe("$6");
  });

  it("an option the product names itself wins over the same option through a collection, whatever the tag order", () => {
    const rows = shippingRows(
      listing([
        ["shipping_option", `30405:${M}:wallets`, "1"],
        ["shipping_option", `30406:${M}:standard`, "3"],
      ]),
      (a) => store.get(a),
    );
    // Standard is the product's own, at its own extra (+$3), not the collection's (+$1).
    expect(rows.map((r) => [r.title, r.cost, r.via])).toEqual([
      ["Standard", "$8.99", null],
      ["Store pickup", "$1", "Hardware Wallets"],
    ]);
  });

  it("options not found and with no name read as one row, not several alike", () => {
    const rows = shippingRows(
      listing([
        ["shipping_option", `30406:${M}:9ac5a9a316a647559a7597c2d6fdfb21`],
        ["shipping_option", `30406:${M}:c3ddd1eb878940879736c22fbf5f1903`],
      ]),
      () => undefined,
    );
    expect(rows.map((r) => r.title)).toEqual(["2 shipping options"]);
  });

  it("a collection not found still says the product ships through it, with its extra", () => {
    const rows = shippingRows(listing([["shipping_option", `30405:${M}:summer-sale`, "2"]]), () => undefined);
    expect(rows.map((r) => [r.title, r.cost, r.via, r.resolved])).toEqual([
      ["Collection's shipping options", "+$2", "Summer sale", false],
    ]);
  });
});
