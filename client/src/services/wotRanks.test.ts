// @vitest-environment node
/**
 * Authors' ranks from the observer's own scorer, falling back to the house's,
 * and the verified line as the web-of-trust rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOUSE = "a".repeat(64);
const VIEWER = "b".repeat(64);
const HOUSE_TA = "c".repeat(64);
const VIEWER_TA = "d".repeat(64);
const AVI = "e".repeat(64);
const BOT = "f".repeat(64);

const sources = new Map<string, { taPubkey: string; relay: string }>();
vi.mock("@/services/trustSource", () => ({
  resolveHouseObserver: async () => HOUSE,
  resolveTrustSource: async (pk: string) => sources.get(pk) ?? null,
}));
const fetchMock = vi.fn();
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: (...a: unknown[]) => fetchMock(...a) }));

import { fetchAuthorRanks, inWebOfTrust, VERIFIED_RANK } from "./wotRanks";

const assertion = (subject: string, rank: number, created_at = 1) => ({
  created_at,
  tags: [
    ["d", subject],
    ["rank", String(rank)],
  ],
});

beforeEach(() => {
  sources.clear();
  sources.set(HOUSE, { taPubkey: HOUSE_TA, relay: "wss://house.example" });
  fetchMock.mockReset();
});

describe("fetchAuthorRanks", () => {
  it("reads the house scorer for the Brainstorm Perspective", async () => {
    fetchMock.mockResolvedValue([assertion(AVI, 57)]);
    const r = await fetchAuthorRanks([AVI, BOT], "house");
    expect(r.source).toBe("house");
    expect(r.ranks.get(AVI)).toBe(57);
    expect(r.ranks.has(BOT)).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      { kinds: [30382], authors: [HOUSE_TA], "#d": [AVI, BOT] },
      ["wss://house.example"],
      8000,
    );
  });

  it("reads the viewer's own scorer under My perspective", async () => {
    sources.set(VIEWER, { taPubkey: VIEWER_TA, relay: "wss://mine.example" });
    fetchMock.mockResolvedValue([]);
    const r = await fetchAuthorRanks([AVI], VIEWER);
    expect(r.source).toBe("observer");
    expect(fetchMock.mock.calls[0][0]).toMatchObject({ authors: [VIEWER_TA] });
  });

  it("a viewer with no scorer falls back to the house, and says so", async () => {
    fetchMock.mockResolvedValue([assertion(AVI, 3)]);
    const r = await fetchAuthorRanks([AVI], VIEWER);
    expect(r.source).toBe("house");
    expect(r.ranks.get(AVI)).toBe(3);
  });

  it("the newest assertion about an author wins", async () => {
    fetchMock.mockResolvedValue([assertion(AVI, 90, 1), assertion(AVI, 1, 2)]);
    expect((await fetchAuthorRanks([AVI], "house")).ranks.get(AVI)).toBe(1);
  });

  it("no scorer at all ranks nobody", async () => {
    sources.clear();
    const r = await fetchAuthorRanks([AVI], "house");
    expect(r).toEqual({ ranks: new Map(), source: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a relay that fails ranks nobody rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect((await fetchAuthorRanks([AVI], "house")).ranks.size).toBe(0);
  });
});

describe("inWebOfTrust", () => {
  it("is the verified line, rank 2", () => {
    expect(VERIFIED_RANK).toBe(2);
    const ranks = new Map([
      [AVI, 2],
      [BOT, 1],
    ]);
    expect(inWebOfTrust(ranks, AVI)).toBe(true);
    expect(inWebOfTrust(ranks, BOT)).toBe(false);
    expect(inWebOfTrust(ranks, VIEWER)).toBe(false); // unranked is not in it
  });
});
