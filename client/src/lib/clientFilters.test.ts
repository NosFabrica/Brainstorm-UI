// @vitest-environment node
/**
 * The filters the relay can't do, done here: "Verified accounts only" through
 * the author scores the rings already fetch, and "reach" — how far the
 * search casts its net — through the viewer's own follow graph. Pure: the
 * results page and the composed page share it.
 */
import { describe, expect, it } from "vitest";
import { clientFilterHits } from "./clientFilters";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const hit = (pubkey: string) => ({ event: { id: pubkey.slice(0, 8), kind: 1, pubkey, tags: [], content: "", created_at: 1, sig: "s" }, author: null, rank: null }) as never;
const hits = [hit(A), hit(B), hit(C)];
const scoreOf = (pk: string) => ({ [A]: 0.9, [B]: 0.001, [C]: undefined })[pk];
const reach = { direct: new Set([B]), friends: new Set([B, C]), ready: true };

describe("clientFilterHits", () => {
  it("passes everything through when no client filter is set", () => {
    expect(clientFilterHits(hits, { verifiedOnly: false, reach: null }, { scoreOf, reach })).toHaveLength(3);
  });

  it("Verified only keeps authors at or above the verified line — unrated and unknown go", () => {
    expect(clientFilterHits(hits, { verifiedOnly: true, reach: null }, { scoreOf, reach }).map((h) => h.event.pubkey)).toEqual([A]);
  });

  it("reach:follows keeps people you follow; reach:friends adds friends of friends", () => {
    expect(clientFilterHits(hits, { verifiedOnly: false, reach: "follows" }, { scoreOf, reach }).map((h) => h.event.pubkey)).toEqual([B]);
    expect(clientFilterHits(hits, { verifiedOnly: false, reach: "friends" }, { scoreOf, reach }).map((h) => h.event.pubkey)).toEqual([B, C]);
  });

  it("both together intersect", () => {
    expect(clientFilterHits(hits, { verifiedOnly: true, reach: "friends" }, { scoreOf, reach })).toEqual([]);
  });

  it("holds everything back while the reach graph is still loading — never a false empty page", () => {
    const out = clientFilterHits(hits, { verifiedOnly: false, reach: "follows" }, { scoreOf, reach: { direct: new Set(), friends: new Set(), ready: false } });
    expect(out).toHaveLength(3);
  });
});
