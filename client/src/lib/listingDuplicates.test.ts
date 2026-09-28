import { describe, it, expect } from "vitest";
import { collapseDuplicateListings } from "./listingDuplicates";

// Staci's shop (2026-09-24): 67 listing events from two publishers, the
// Conduit Merchant Portal and another app, the other app's being copies of
// products Conduit sells. A buyer wants one card per product.
const seller = "6".repeat(64);
const other = "7".repeat(64);
const ev = (id: string, pubkey: string, title: string, extra: string[][] = [], created_at = 1_700_000_000) => ({
  event: { id, pubkey, kind: 30402, created_at, tags: [["d", id], ["title", title], ["price", "12000", "sats"], ...extra], content: "" },
});
const conduit = ["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant", "wss://relay.conduit.market"];

describe("collapseDuplicateListings — one card per product", () => {
  it("keeps the copy with a product page when a seller published the same title twice", () => {
    const elsewhere = ev("e1", seller, "Sweet Almond Tallow Soap Bar", [["t", "Health & Beauty"]], 1_700_000_100);
    const onConduit = ev("c1", seller, "Sweet Almond Tallow Soap Bar", [conduit]);
    const kept = collapseDuplicateListings([elsewhere, onConduit]);
    expect(kept.map((h) => h.event.id)).toEqual(["c1"]);
  });

  it("a listing's own page counts as a product page too", () => {
    const bare = ev("b1", seller, "AGORA T-shirt");
    const own = ev("o1", seller, "AGORA T-shirt", [["r", "https://swag.btc.pub/agora"]]);
    expect(collapseDuplicateListings([bare, own]).map((h) => h.event.id)).toEqual(["o1"]);
  });

  it("with no page on either copy, the first in relay order stays", () => {
    const a = ev("a1", seller, "Beanie");
    const b = ev("a2", seller, "Beanie");
    expect(collapseDuplicateListings([a, b]).map((h) => h.event.id)).toEqual(["a1"]);
  });

  it("titles match loosely — case and spacing are the app's, not the product's", () => {
    const a = ev("a1", seller, "Sweet  Almond Soap", [conduit]);
    const b = ev("a2", seller, "sweet almond soap");
    expect(collapseDuplicateListings([b, a]).map((h) => h.event.id)).toEqual(["a1"]);
  });

  it("the same title from two sellers is two products; the kept card holds its group's place", () => {
    const s1 = ev("s1", seller, "Beanie");
    const o1 = ev("o1", other, "Beanie");
    const s2 = ev("s2", seller, "Beanie", [conduit]);
    const mug = ev("m1", other, "Mug");
    expect(collapseDuplicateListings([s1, o1, mug, s2]).map((h) => h.event.id)).toEqual(["s2", "o1", "m1"]);
  });

  it("a listing that is not a listing passes through untouched", () => {
    const note = { event: { id: "n1", pubkey: seller, kind: 1, created_at: 1, tags: [], content: "hi" } };
    expect(collapseDuplicateListings([note]).map((h) => h.event.id)).toEqual(["n1"]);
  });
});
