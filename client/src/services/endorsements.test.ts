// @vitest-environment node
/**
 * Endorsements — Nostr's reviews of apps and people, ordered by the web of
 * trust. Nostr has no star rating (probed 2026-09-03: 0 of 845 app comments
 * carry one), so the Google "shared endorsement" beat here is name + tier
 * ring + quote, and WHO is speaking decides the order: people you follow,
 * then verified accounts, then everyone else. These are the pure rules the
 * cards and the app page share.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewsMock = vi.fn();
const zapsMock = vi.fn();
const countsMock = vi.fn();
vi.mock("@/services/search", () => ({
  fetchAppReviews: (...a: unknown[]) => reviewsMock(...a),
  fetchAppZaps: (...a: unknown[]) => zapsMock(...a),
  fetchAppEndorsementCounts: (...a: unknown[]) => countsMock(...a),
}));

const connectionsMock = vi.fn();
vi.mock("@/services/api", () => ({
  apiClient: { getUserConnections: (...a: unknown[]) => connectionsMock(...a) },
}));

import { endorsementLabel, fetchAppEndorsements, fetchPersonEndorsements, quoteFor, rankEndorsers } from "./endorsements";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const ADDR = "32267:" + B + ":com.vitorpamplona.amethyst";

beforeEach(() => {
  vi.clearAllMocks();
  reviewsMock.mockResolvedValue([]);
  zapsMock.mockResolvedValue([]);
  countsMock.mockResolvedValue({ reviews: 0, zaps: 0, collections: 0 });
});

describe("fetchAppEndorsements", () => {
  const review = (id: string, pubkey: string, k: string | null, at = 1) => ({ id, pubkey, text: id, at, version: null, k, kind: 1111 });

  it("composes reviews, zaps and counts, dropping the publisher's own words and nested replies", async () => {
    reviewsMock.mockResolvedValue([
      review("r-fan", A, "32267"),
      review("r-publisher", B, "32267"), // the app's own author replying — not an endorsement
      review("r-reply", C, "1111"), // a reply to a review, not a review of the app
      review("r-legacy", D, null), // legacy kind-1 note
    ]);
    zapsMock.mockResolvedValue([{ id: "z", pubkey: A, memo: "love it", at: 5 }]);
    countsMock.mockResolvedValue({ reviews: 14, zaps: 101, collections: 46 });

    const e = await fetchAppEndorsements(ADDR, { publisher: B });
    expect(e.reviews.map((r) => r.id)).toEqual(["r-fan", "r-legacy"]);
    expect(e.zaps).toHaveLength(1);
    expect(e).toMatchObject({ address: ADDR, reviewCount: 14, zapCount: 101, collectionCount: 46 });
    expect(reviewsMock).toHaveBeenCalledWith(ADDR, { limit: 50 });
    expect(zapsMock).toHaveBeenCalledWith(ADDR, { limit: 50 });
  });

  it("never rejects: a failed primitive reads as zero", async () => {
    zapsMock.mockRejectedValue(new Error("relay down"));
    countsMock.mockRejectedValue(new Error("relay down"));
    reviewsMock.mockResolvedValue([review("r", A, "32267")]);
    const e = await fetchAppEndorsements(ADDR, { publisher: B });
    expect(e.zaps).toEqual([]);
    expect(e.zapCount).toBe(0);
    // Reviews we actually hold outrank a failed count.
    expect(e.reviewCount).toBe(1);
  });

  it("skips the zap page entirely when the caller wants counts only", async () => {
    await fetchAppEndorsements(ADDR, { publisher: B, zapLimit: 0, reviewLimit: 8 });
    expect(zapsMock).not.toHaveBeenCalled();
    expect(reviewsMock).toHaveBeenCalledWith(ADDR, { limit: 8 });
  });

  it("skips the review page too at reviewLimit 0 — the rail only needs numbers", async () => {
    await fetchAppEndorsements(ADDR, { publisher: B, zapLimit: 0, reviewLimit: 0 });
    expect(reviewsMock).not.toHaveBeenCalled();
    expect(countsMock).toHaveBeenCalledWith(ADDR);
  });
});

// A person's endorsements are their followers — the most trusted ones, as
// faces, and how many verified accounts follow them in total. Follows are not
// indexed on the search relay (probed), so this is our own server's
// connections endpoint: house Perspective for a stable public line, the
// viewer's own when they look through My perspective.
describe("fetchPersonEndorsements", () => {
  it("reads the top verified followers, keeping each one's score for its ring", async () => {
    connectionsMock.mockResolvedValue({ data: { items: [A, { pubkey: B, influence: 0.42 }, { pubkey: "" }], total: 1234 } });
    const e = await fetchPersonEndorsements(C, { personal: false });
    expect(e).toEqual({ followedBy: [{ pubkey: A, score01: null }, { pubkey: B, score01: 0.42 }], total: 1234 });
    expect(connectionsMock).toHaveBeenCalledWith(C, "followed_by", {
      limit: 8, order: "desc", verified_only: true, with_total: true, house: true,
    });
  });

  it("looks through the viewer's own perspective when asked", async () => {
    connectionsMock.mockResolvedValue({ data: { items: [] } });
    const e = await fetchPersonEndorsements(C, { personal: true });
    expect(connectionsMock.mock.calls[0][2]).toMatchObject({ house: false });
    expect(e).toEqual({ followedBy: [], total: null });
  });

  it("never rejects — a failed call is an empty line", async () => {
    connectionsMock.mockRejectedValue(new Error("500"));
    expect(await fetchPersonEndorsements(C, { personal: false })).toEqual({ followedBy: [], total: null });
  });
});

describe("rankEndorsers", () => {
  it("puts people you follow first, then verified accounts by score, then the rest", () => {
    const ranked = rankEndorsers(
      [
        { pubkey: A, at: 100 }, // unrated stranger, newest
        { pubkey: B, at: 50 }, // verified, high score
        { pubkey: C, at: 10 }, // followed, modest score
        { pubkey: D, at: 60 }, // verified, lower score
      ],
      {
        follows: new Set([C]),
        scoreOf: (pk) => ({ [B]: 0.9, [C]: 0.1, [D]: 0.3 })[pk] ?? null,
      },
    );
    expect(ranked.map((e) => e.pubkey)).toEqual([C, B, D, A]);
    expect(ranked.map((e) => e.group)).toEqual(["followed", "verified", "verified", "other"]);
  });

  it("counts a person once, keeping their latest endorsement", () => {
    const ranked = rankEndorsers(
      [{ pubkey: A, at: 10 }, { pubkey: A, at: 90 }],
      { follows: new Set(), scoreOf: () => 0.5 },
    );
    expect(ranked).toEqual([{ pubkey: A, at: 90, score: 0.5, group: "verified" }]);
  });

  it("breaks ties within a group by recency", () => {
    const ranked = rankEndorsers(
      [{ pubkey: A, at: 10 }, { pubkey: B, at: 20 }],
      { follows: new Set(), scoreOf: () => null },
    );
    expect(ranked.map((e) => e.pubkey)).toEqual([B, A]);
  });

  it("treats a score below the verified line as unrated", () => {
    const ranked = rankEndorsers([{ pubkey: A, at: 1 }], { follows: new Set(), scoreOf: () => 0.001 });
    expect(ranked[0].group).toBe("other");
  });
});

describe("endorsementLabel", () => {
  it("names up to two people and counts the rest", () => {
    expect(endorsementLabel("Reviewed", ["Vitor", "Pablo", "Ana"], 14)).toBe("Reviewed by Vitor, Pablo & 12 others");
    expect(endorsementLabel("Reviewed", ["Vitor"], 14)).toBe("Reviewed by Vitor & 13 others");
    expect(endorsementLabel("Reviewed", ["Vitor", "Pablo"], 2)).toBe("Reviewed by Vitor & Pablo");
    expect(endorsementLabel("Reviewed", ["Vitor"], 1)).toBe("Reviewed by Vitor");
  });

  it("falls back to a count when no name resolved, compacting big numbers", () => {
    expect(endorsementLabel("Zapped", [], 101)).toBe("Zapped by 101 people");
    expect(endorsementLabel("Followed", [], 1234)).toBe("Followed by 1.2k people");
    expect(endorsementLabel("Reviewed", [], 1)).toBe("Reviewed by 1 person");
  });
});

describe("quoteFor", () => {
  it("keeps a short review whole and cuts a long one at a sentence boundary", () => {
    expect(quoteFor("Perfect APP! Thanks!")).toBe("Perfect APP! Thanks!");
    expect(quoteFor("love Amethyst. is my daily driver, but it seems to be melting my battery lately and I wish it did not")).toBe("love Amethyst.");
  });

  it("collapses whitespace and hard-truncates prose with no boundary", () => {
    expect(quoteFor("  great\n\napp  ")).toBe("great app");
    const long = "x".repeat(200);
    expect(quoteFor(long, 40)).toBe("x".repeat(39) + "…");
  });
});
