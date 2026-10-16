/**
 * One registry for what an event is called. Four copies disagreed (1618 was
 * "Issue" in one and "PR" in another), and every card said the kind its own
 * way. The team (2026-09-24): a spec from Nostr Hub has no NIP number, so the
 * kind's word is what tells a reader what they are looking at.
 */
import { describe, expect, it } from "vitest";
import { kindLabel, kindTypeLabel, specKindTags } from "./kindLabel";
import { KIND_NAMES, kindFamily } from "./kindFamily";

const ev = (kind: number, tags: string[][] = []) => ({
  id: "1".repeat(64),
  kind,
  pubkey: "a".repeat(64),
  tags,
  content: "",
  created_at: 1,
});

describe("kindTypeLabel", () => {
  it("names the git kinds as NIP-34 does: patch, pull request, issue", () => {
    expect(kindTypeLabel(1617)).toBe("Patch");
    expect(kindTypeLabel(1618)).toBe("Pull request");
    expect(kindTypeLabel(1621)).toBe("Issue");
    expect(kindTypeLabel(30617)).toBe("Repo");
  });

  it("names the rest by what they are, a stream as a stream, an unknown kind by its number", () => {
    expect(kindTypeLabel(30817)).toBe("Spec");
    expect(kindTypeLabel(30818)).toBe("Wiki");
    expect(kindTypeLabel(30311)).toBe("Stream");
    expect(kindTypeLabel(0)).toBe("Person");
    expect(kindTypeLabel(12345)).toBe("Kind 12345");
  });
});

describe("one name per kind", () => {
  it("names long-form by what it is: a draft, a publication, a section — not three more Articles", () => {
    expect([30023, 30024, 30040, 30041].map(kindTypeLabel)).toEqual(["Article", "Draft", "Publication", "Section"]);
  });

  it("the relay UI's table and this one agree on every kind both name", () => {
    const disagree = Object.entries(KIND_NAMES)
      .map(([kind, name]) => [Number(kind), name, kindTypeLabel(Number(kind))] as const)
      .filter(([, name, label]) => name !== label);
    expect(disagree).toEqual([]);
    expect([30817, 15129, 35129, 30617].map((k) => KIND_NAMES[k])).toEqual(["Spec", "Mini app", "Mini app", "Repo"]);
  });

  it("names the kinds Amethyst draws that were 'Kind N' here, each in a family", () => {
    const named: [number, string][] = [
      [82, "Medical record"],
      [819, "Merge accepted"],
      [1316, "Road confirmation"],
      [1624, "Cover note"],
      [3063, "Software asset"],
      [3330, "Sno shard"],
      [6300, "DVM result"],
      [7000, "Job status"],
      [7516, "Geocache log"],
      [8000, "Member added"],
      [8001, "Member removed"],
      [10081, "Geohash list"],
      [10086, "Indexer relays"],
      [10087, "Proxy relays"],
      [10088, "Broadcast relays"],
      [10089, "Trusted relays"],
      [10090, "Feed list"],
      [10312, "Room presence"],
      [13534, "Relay members"],
      [22242, "Relay auth"],
      [24242, "Blossom auth"],
      [27235, "HTTP auth"],
      [28934, "Join request"],
      [28936, "Leave request"],
      [30064, "Chess challenge"],
      [30067, "Chess result"],
      [30301, "Board"],
      [30302, "Card"],
      [30819, "Wiki redirect"],
      [31234, "Draft"],
      [33330, "Sno bag"],
      [34238, "Video collab"],
      [37516, "Geocache"],
      [38172, "Cashu mint"],
      [38173, "Fedimint"],
      [38385, "Mostro"],
      [44100, "Group invite"],
    ];
    expect(named.map(([kind]) => kindTypeLabel(kind))).toEqual(named.map(([, name]) => name));
    expect(named.filter(([kind]) => kindFamily(kind) === null)).toEqual([]);
  });

  it("a web bookmark is a web bookmark, not a list", () => {
    expect(kindTypeLabel(39701)).toBe("Web bookmark");
  });
});

describe("kindLabel", () => {
  it("reads the event, so an article wearing zap.cooking's tag is a Recipe and a plain one an Article", () => {
    expect(
      kindLabel(
        ev(30023, [
          ["d", "girik"],
          ["t", "zapcooking"],
        ]),
      ),
    ).toBe("Recipe");
    expect(kindLabel(ev(30023, [["d", "why"]]))).toBe("Article");
  });

  it("names a kind-38000 by its format: mint review, prediction market, ballot, else its number", () => {
    expect(kindLabel(ev(38000, [["u", "https://mint.lnpay.cz"]]))).toBe("Mint review");
    expect(
      kindLabel(
        ev(38000, [
          ["d", "59a3b0cda6c25472714327435b0e8190"],
          ["market", "59a3b0cda6c25472714327435b0e8190"],
        ]),
      ),
    ).toBe("Prediction market");
    expect(kindLabel(ev(38000, [["election", "spring-2026-council"]]))).toBe("Ballot");
    expect(kindLabel(ev(38000, [["d", "b21068c8"]]))).toBe("Kind 38000");
  });
});

describe("specKindTags", () => {
  it("lists the numeric k tags a spec carries, in order, each with the name its author gave", () => {
    expect(
      specKindTags(
        ev(30817, [
          ["k", "7000"],
          ["k", "5905", "DVM Job Request"],
          ["k", "nip"],
          ["k", "5905"],
        ]),
      ),
    ).toEqual([{ kind: "5905", label: "DVM Job Request" }, { kind: "7000" }]);
  });
});

describe("Open Markets kinds around a listing", () => {
  it("names a collection, a shipping option and a product review — not 'Kind N' — in the market family", () => {
    expect([30405, 30406, 31555].map(kindTypeLabel)).toEqual(["Collection", "Shipping option", "Product review"]);
    expect([30405, 30406, 31555].map((k) => KIND_NAMES[k])).toEqual([
      "Collection",
      "Shipping option",
      "Product review",
    ]);
    expect([30405, 30406, 31555].map(kindFamily)).toEqual(["market", "market", "market"]);
  });
});
