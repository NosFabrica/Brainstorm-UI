import { describe, it, expect } from "vitest";
import { parseListing, isSellable, formatListingPrice } from "./listing";

// NIP-99 as the marketplaces publish it (probed 2026-09-04: Shopstr,
// Barattolo, bitpopart, Conduit): title, price [amount, currency], images,
// summary, location, status, categories in `t`, the shop page in `r`.
const ev = (tags: string[][], content = "", kind = 30402) =>
  ({ id: "l1", pubkey: "a".repeat(64), kind, created_at: 1_700_000_000, tags, content });

describe("parseListing — a marketplace listing for a buyer", () => {
  it("reads title, price, photos, summary, location, categories and the shop link", () => {
    const l = parseListing(
      ev(
        [
          ["d", "maglia-1"],
          ["title", "Maglia in kashmir donna"],
          ["summary", "Maglia in kashmir, taglia M"],
          ["price", "23550", "sats"],
          ["image", "https://img/1.jpg"],
          ["image", "https://img/2.jpg"],
          ["location", "Gubbio (PG)"],
          ["status", "active"],
          ["t", "abbigliamento"],
          ["t", "kashmir"],
          ["r", "https://barattolo.app/l/maglia-1"],
          ["shipping_option", "Italia", "500", "sats"],
        ],
        "Maglia in kashmir donna, come nuova.",
      ),
    );
    expect(l).toMatchObject({
      id: "l1",
      title: "Maglia in kashmir donna",
      summary: "Maglia in kashmir, taglia M",
      price: { amount: 23550, currency: "SATS" },
      images: ["https://img/1.jpg", "https://img/2.jpg"],
      location: "Gubbio (PG)",
      status: "active",
      categories: ["abbigliamento", "kashmir"],
      shopUrl: "https://barattolo.app/l/maglia-1",
      description: "Maglia in kashmir donna, come nuova.",
    });
  });

  it("an app's own name is provenance, not a category", () => {
    const l = parseListing(ev([["title", "Mug"], ["price", "12", "USD"], ["t", "shopstr"], ["t", "mugs"]]));
    expect(l?.categories).toEqual(["mugs"]);
  });

  it("needs a title; without a price it still parses, but is not sellable", () => {
    expect(parseListing(ev([["price", "10", "USD"]]))).toBeNull();
    const noPrice = parseListing(ev([["title", "Obscura VPN"], ["summary", "Can't log VPN provider."]]));
    expect(noPrice?.title).toBe("Obscura VPN");
    expect(noPrice?.price).toBeNull();
    expect(isSellable(noPrice!)).toBe(false);
    expect(parseListing(ev([["title", "x"], ["price", "abc", "USD"]]))?.price).toBeNull();
  });

  it("no status means active — 40% of live stock carries none", () => {
    const l = parseListing(ev([["title", "Mug"], ["price", "12", "USD"]]));
    expect(l?.status).toBe("active");
    expect(isSellable(l!)).toBe(true);
  });

  it("sold and hidden listings are not for sale", () => {
    expect(isSellable(parseListing(ev([["title", "Mug"], ["price", "12", "USD"], ["status", "sold"]]))!)).toBe(false);
    expect(isSellable(parseListing(ev([["title", "Mug"], ["price", "12", "USD"], ["visibility", "hidden"]]))!)).toBe(false);
  });
});

describe("formatListingPrice — shown exactly as priced, never converted", () => {
  it("sats read as sats, fiat as its own currency", () => {
    expect(formatListingPrice({ amount: 23550, currency: "SATS" })).toBe("23,550 sats");
    expect(formatListingPrice({ amount: 1, currency: "SAT" })).toBe("1 sat");
    expect(formatListingPrice({ amount: 12, currency: "USD" })).toBe("$12");
    expect(formatListingPrice({ amount: 15, currency: "EUR" })).toBe("€15");
    expect(formatListingPrice({ amount: 14.5, currency: "CHF" })).toMatch(/14\.50/);
    expect(formatListingPrice({ amount: 0.0021, currency: "BTC" })).toBe("0.0021 BTC");
    expect(formatListingPrice({ amount: 8, currency: "USDC" })).toBe("8 USDC");
  });

  // Benjamin, over a "$0" pill on the Shop tab: a zero reads as a mistake.
  // The seller wrote a number, and the number means free.
  it("a price of zero reads as Free, whatever the currency", () => {
    expect(formatListingPrice({ amount: 0, currency: "USD" })).toBe("Free");
    expect(formatListingPrice({ amount: 0, currency: "SATS" })).toBe("Free");
    expect(formatListingPrice({ amount: 0, currency: "EUR", frequency: "month" })).toBe("Free");
  });

  it("names the cadence when a price recurs", () => {
    expect(formatListingPrice({ amount: 5, currency: "USD", frequency: "month" })).toBe("$5 / month");
  });
});
