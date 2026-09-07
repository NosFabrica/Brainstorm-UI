// @vitest-environment node
/**
 * The filters the relay can't do, done here: "Verified accounts only" through
 * the author scores the rings already fetch, and "reach" — how far the
 * search casts its net — through the viewer's own follow graph. Pure: the
 * results page and the composed page share it.
 */
import { describe, expect, it } from "vitest";
import { clientFilterHits, countBelowLine, NO_REACH } from "./clientFilters";

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

// Probed 2026-09-05, "Ainsley Costello" under the house lens: 38 of the 40
// newest notes came from two aéPiot spam accounts scoring 0 and 0.0198 — the
// relay's lens lets them through, so search must hold the verified line
// itself. Hidden only once a score is KNOWN and under the line; a score still
// loading, or one the house has no data for, is no verdict and stays.
describe("the search floor — accounts below the verified line stay off the page", () => {
  const SPAM = "3".repeat(64), ZERO = "4".repeat(64), REAL = "5".repeat(64), PENDING = "6".repeat(64), NODATA = "7".repeat(64);
  const scores: Record<string, number | null | undefined> = { [SPAM]: 0.0198, [ZERO]: 0, [REAL]: 0.93, [PENDING]: undefined, [NODATA]: null };
  const scoreOf = (pk: string) => scores[pk];
  const h = (id: string, pubkey: string) => ({ event: { id, kind: 1, pubkey, tags: [], content: "", created_at: 1, sig: "s" }, author: null, rank: null }) as never;
  const hits = [h("a", SPAM), h("b", ZERO), h("c", REAL), h("d", PENDING), h("e", NODATA)];
  it("with the floor on, known-low authors go; loading and no-data authors stay", () => {
    const kept = clientFilterHits(hits, { verifiedOnly: false, reach: null, belowLine: true }, { scoreOf, reach: NO_REACH });
    expect(kept.map((h) => h.event.id)).toEqual(["c", "d", "e"]);
  });
  it("with the floor off, everyone stays", () => {
    expect(clientFilterHits(hits, { verifiedOnly: false, reach: null }, { scoreOf, reach: NO_REACH })).toHaveLength(5);
  });
  it("counts what the floor hid, for the page to say so", () => {
    expect(countBelowLine(hits, scoreOf)).toBe(2);
    expect(countBelowLine([h("c", REAL), h("d", PENDING)], scoreOf)).toBe(0);
  });
});
