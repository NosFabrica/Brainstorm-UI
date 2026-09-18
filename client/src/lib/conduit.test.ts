/**
 * Conduit (shop.conduit.market) is where a Brainstorm buyer checks out: the
 * listing's own page there, found by its Nostr address — the same listing the
 * seller published, whatever app they published it with.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { parseListing } from "./listing";
import { CONDUIT_RELAY, conduitCanSell, conduitProductUrl } from "./conduit";

const SELLER = "9".repeat(64);

describe("conduitProductUrl", () => {
  it("links the listing's page on Conduit by its address, with relays to find it on", () => {
    const url = conduitProductUrl({ pubkey: SELLER, d: "cretan-honey" }, ["wss://relay.plebeian.market"]);

    expect(url.startsWith("https://shop.conduit.market/products/naddr1")).toBe(true);
    const decoded = nip19.decode(url.split("/products/")[1]);
    expect(decoded.type).toBe("naddr");
    const data = decoded.data as nip19.AddressPointer;
    expect(data).toMatchObject({ kind: 30402, pubkey: SELLER, identifier: "cretan-honey" });
    expect(data.relays).toEqual(["wss://relay.plebeian.market", CONDUIT_RELAY]);
  });
});

describe("conduitCanSell", () => {
  const mk = (extra: string[][] = [], without: string[] = []) =>
    parseListing({
      id: "1".repeat(64),
      kind: 30402,
      pubkey: SELLER,
      created_at: 1_788_000_000,
      content: "Raw thyme honey from Crete.",
      tags: [["d", "cretan-honey"], ["title", "Cretan Wildflower Honey"], ["price", "24", "USD"], ["image", "https://img/honey.jpg"], ...extra].filter(
        (t) => !without.includes(t[0]),
      ),
    })!;

  it("sends a buyer to Conduit for a public, priced listing with a photo", () => {
    expect(conduitCanSell(mk())).toBe(true);
    expect(conduitCanSell(mk([["type", "simple", "physical"]]))).toBe(true);
  });

  // Conduit shows these as unavailable (listing-safety.ts): a link would land
  // the buyer on a dead end, so the listing keeps its other ways to act.
  it.each([
    ["no photo", [], ["image"]],
    ["a sold status", [["status", "sold"]], []],
    ["hidden visibility", [["visibility", "hidden"]], []],
    ["no address", [], ["d"]],
    ["a type Conduit can't sell alone", [["type", "variation"]], []],
  ] as const)("won't for a listing with %s", (_label, extra, without) => {
    expect(conduitCanSell(mk(extra as unknown as string[][], without as unknown as string[]))).toBe(false);
  });
});
