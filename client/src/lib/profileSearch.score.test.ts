import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The search hit → `SearchResult` score mapping.
 *
 * Why this exists: the search page had been showing **no trust score at all**.
 * The mapper read `wot_rank` / `wot_followers` — the old Meili field names — but
 * the live Vespa backend sends `_quality_score` / `_followers`. Every lookup
 * missed, `wotRank` came back null for every hit, and both the rank pill and the
 * followers pill silently rendered nothing. That is almost certainly what
 * prompted the "make search show the score like the profile does" feedback.
 *
 * Scale matters as much as presence. `_quality_score` is 0–100; `wotRank` is
 * documented 0..1 and consumers rely on that (the coin takes 0..1, the mobile
 * overlay used to multiply by 100). Verified against the live API: ODELL is
 * `influence` 0.9337 on `/user/{pk}/overview` and `_quality_score` 93.0 on
 * `/search/byText` — the same number, two scales.
 */

vi.mock("@/services/api", () => ({
  apiClient: { searchByText: vi.fn() },
}));

const PK = "04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9";

/** A hit shaped like the live Vespa response. */
const vespaHit = (over: Record<string, unknown> = {}) => ({
  pubkey: PK,
  name: "ODELL",
  display_name: "ODELL",
  _quality_score: 93.0,
  _followers: 25876.0,
  _relevance: 30629.06,
  _wot_mult: 5.52,
  _match_tier: "name",
  ...over,
});

async function mapOne(hit: Record<string, unknown>) {
  const { apiClient } = await import("@/services/api");
  (apiClient.searchByText as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { results: [hit], numResults: 1 },
  });
  const { searchByText } = await import("./profileSearch");
  const { results } = await searchByText("odell", "nosfabrica");
  return results[0];
}

beforeEach(() => vi.resetModules());

describe("score mapping from a live search hit", () => {
  it("finds the score in the field the backend actually sends", async () => {
    const r = await mapOne(vespaHit());
    expect(r.wotRank).not.toBeNull();
  });

  it("normalises it to 0..1, the scale wotRank promises", async () => {
    const r = await mapOne(vespaHit());
    // 93.0 out of 100 — NOT 93, which would clamp the coin to a flat 100.
    expect(r.wotRank).toBeCloseTo(0.93, 5);
  });

  it("finds the follower count too", async () => {
    const r = await mapOne(vespaHit());
    expect(r.wotFollowers).toBe(25876);
  });

  it("prefers the viewer's own perspective over the house one", async () => {
    // `rank_<taPubkey>` only appears on authenticated (ownPubkey=true) searches.
    // When it does, it is the number the ranking actually used, so it wins — and
    // it needs the same 0..1 conversion as the house score.
    const r = await mapOne(vespaHit({ rank_be7bf5de: 42.0 }));
    expect(r.wotRankMywot).toBeCloseTo(0.42, 5);
    expect(r.wotRank).toBeCloseTo(0.42, 5);
  });

  it("reports no score rather than zero when the hit carries none", async () => {
    const hit = vespaHit();
    delete (hit as Record<string, unknown>)._quality_score;
    const r = await mapOne(hit);
    // null renders as an unrated outline; 0 would render as a confident "0".
    expect(r.wotRank).toBeNull();
  });
});
