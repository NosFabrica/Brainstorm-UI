// @vitest-environment node
/**
 * One cache entry per (person, perspective as the request is really made).
 * Signed out, the viewer's overview and the house's are the same URL, so an
 * anonymous `/p/:id` — which reads both — must ask once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const getUserOverview = vi.fn(async (..._a: unknown[]) => ({ data: { influence: 0.5 } }));
const getUserConnections = vi.fn(async (..._a: unknown[]) => ({
  data: { items: ["a".repeat(64), { pubkey: "b".repeat(64), influence: 0.7 }], total: 12 },
}));
const getMyTrustSignals = vi.fn();
const lookupTrustSignals = vi.fn();
const hasSettledTrustSignals = vi.fn();
vi.mock("@/services/trustSignals", () => ({
  lookupTrustSignals: (...a: unknown[]) => lookupTrustSignals(...a),
  hasSettledTrustSignals: (...a: unknown[]) => hasSettledTrustSignals(...a),
}));
vi.mock("@/services/api", () => ({
  apiClient: {
    getMyTrustSignals: (...a: unknown[]) => getMyTrustSignals(...a),
    getUserOverview: (...a: unknown[]) => getUserOverview(...a),
    getUserConnections: (...a: unknown[]) => getUserConnections(...a),
  },
}));
let account: { pubkey: string } | undefined;
vi.mock("@/accounts/signing", () => ({ activeAccount: () => account }));

import { influenceOptions, overviewOptions, selectInfluence, topFollowersOptions } from "./userReads";

const PK = "c".repeat(64);

beforeEach(() => {
  account = undefined;
  getUserOverview.mockClear();
  getUserConnections.mockClear();
});

describe("overviewOptions", () => {
  it("signed out, the viewer's read and the house's are one entry and one request", async () => {
    const qc = new QueryClient();
    expect(overviewOptions(PK, "viewer").queryKey).toEqual(overviewOptions(PK, "house").queryKey);
    await Promise.all([qc.fetchQuery(overviewOptions(PK, "viewer")), qc.fetchQuery(overviewOptions(PK, "house"))]);
    expect(getUserOverview).toHaveBeenCalledTimes(1);
    expect(getUserOverview).toHaveBeenCalledWith(PK, { house: true });
  });

  it("signed in, they are two: the server reads the viewer off the session", async () => {
    account = { pubkey: "d".repeat(64) };
    const qc = new QueryClient();
    await qc.fetchQuery(overviewOptions(PK, "viewer"));
    await qc.fetchQuery(overviewOptions(PK, "house"));
    expect(getUserOverview.mock.calls).toEqual([
      [PK, { house: false }],
      [PK, { house: true }],
    ]);
  });

  it("keys by the lower-case hex, so a caller's casing can't split the entry", () => {
    expect(overviewOptions(PK.toUpperCase(), "house").queryKey).toEqual(overviewOptions(PK, "house").queryKey);
  });

  it("selects the influence, or null when the server has none", () => {
    expect(selectInfluence({ data: { influence: 0.25 } })).toBe(0.25);
    expect(selectInfluence({ data: { influence: null } })).toBeNull();
    expect(selectInfluence(undefined)).toBeNull();
  });
});

describe("topFollowersOptions", () => {
  it("asks for the eight best verified followers with the total, and keeps each one's influence", async () => {
    const qc = new QueryClient();
    const top = await qc.fetchQuery(topFollowersOptions(PK, "house"));
    expect(getUserConnections).toHaveBeenCalledWith(PK, "followed_by", {
      limit: 8,
      order: "desc",
      verified_only: true,
      with_total: true,
      house: true,
    });
    expect(top).toEqual({
      items: [
        { pubkey: "a".repeat(64), influence: null },
        { pubkey: "b".repeat(64), influence: 0.7 },
      ],
      total: 12,
    });
  });
});

describe("influenceOptions", () => {
  beforeEach(() => {
    getMyTrustSignals.mockReset();
    lookupTrustSignals.mockReset();
    hasSettledTrustSignals.mockReset();
  });

  it("reads the house score from the Trust signals memo, never the overview", async () => {
    lookupTrustSignals.mockResolvedValue({ influence: 0.6, flagged: false });
    hasSettledTrustSignals.mockReturnValue(true);
    expect(await new QueryClient().fetchQuery(influenceOptions(PK, "house"))).toBe(0.6);
    expect(lookupTrustSignals).toHaveBeenCalledWith(PK, { now: true });
    expect(getUserOverview).not.toHaveBeenCalled();
  });

  it("fails, rather than caching unrated, when the house lookup didn't land", async () => {
    lookupTrustSignals.mockResolvedValue({ influence: null, flagged: false });
    hasSettledTrustSignals.mockReturnValue(false);
    await expect(new QueryClient().fetchQuery(influenceOptions(PK, "house"))).rejects.toThrow();
  });

  it("signed in, reads the viewer's score through the session; a failed batch is an error", async () => {
    account = { pubkey: "d".repeat(64) };
    getMyTrustSignals.mockResolvedValueOnce(new Map([[PK, { influence: 0.3, flagged: false }]]));
    expect(await new QueryClient().fetchQuery(influenceOptions(PK, "viewer"))).toBe(0.3);
    getMyTrustSignals.mockResolvedValueOnce(null);
    await expect(new QueryClient().fetchQuery(influenceOptions(PK, "viewer"))).rejects.toThrow();
  });

  it("signed out, the viewer's read is the house's: one entry", () => {
    expect(influenceOptions(PK, "viewer").queryKey).toEqual(influenceOptions(PK, "house").queryKey);
  });
});
