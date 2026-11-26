import { describe, expect, it } from "vitest";
import { ladderFor } from "@/lib/trustLadder";
import {
  connectionTier,
  groupFromSearch,
  pageWindow,
  trustFilterChoicesFor,
  trustFilterFromSearch,
} from "./networkFilters";

describe("links into the page", () => {
  it("open on the group and trust filter they name, if the page has it", () => {
    expect(groupFromSearch("?group=muted_by")).toBe("muted_by");
    expect(groupFromSearch("?group=flagged")).toBe("flagged");
    expect(groupFromSearch("?group=nope")).toBe("followed_by");
    expect(groupFromSearch("")).toBe("followed_by");
    expect(trustFilterFromSearch("?trust=verified")).toBe("verified");
    expect(trustFilterFromSearch("?trust=all")).toBe("all");
    expect(trustFilterFromSearch("?trust=bogus")).toBe("all");
  });
});

describe("trustFilterChoicesFor", () => {
  it("offers All, Verified, Unknown and Flagged under Simple, in the ladder's words", () => {
    const choices = trustFilterChoicesFor("simple");
    expect(choices.map((c) => c.key)).toEqual(["all", "verified", "unverified", "flagged"]);
    const unknown = ladderFor("simple").find((r) => r.key === "unknown");
    expect(choices[2]).toMatchObject({ label: unknown?.label, color: unknown?.color });
    expect(choices[0]).toMatchObject({ label: "All", color: null });
  });

  it("offers every rung under Detailed", () => {
    expect(trustFilterChoicesFor("detailed").map((c) => c.key)).toEqual([
      "all",
      "high",
      "medium",
      "neutral",
      "low",
      "unverified",
      "flagged",
    ]);
  });
});

describe("connectionTier", () => {
  it("names the backend bucket for a rung, none for All, Verified or the Flagged view", () => {
    expect(connectionTier("medium", false)).toBe("medium_high");
    expect(connectionTier("flagged", false)).toBe("low_and_reported_by_2_or_more_trusted_pubkeys");
    expect(connectionTier("all", false)).toBeUndefined();
    expect(connectionTier("verified", false)).toBeUndefined();
    expect(connectionTier("high", true)).toBeUndefined();
  });
});

describe("pageWindow", () => {
  const rows = Array.from({ length: 250 }, (_, i) => `pk${i}`);

  it("pages past what is loaded when the server counts more, prefetching the next page", () => {
    const w = pageWindow(rows.slice(0, 150), 400, 1, 100);
    expect(w).toMatchObject({ totalPages: 4, safePage: 1, startIdx: 0, nextItemStart: 100, totalItems: 400 });
    expect(w.items).toHaveLength(100);
    expect(w.nextPage?.startIdx).toBe(100);
    expect(w.nextPage?.items).toHaveLength(50);
  });

  it("clamps a page past the end and has no next page there", () => {
    const w = pageWindow(rows, 0, 9, 100);
    expect(w).toMatchObject({ totalPages: 3, safePage: 3, startIdx: 200, nextItemStart: 250, totalItems: 250 });
    expect(w.items).toHaveLength(50);
    expect(w.nextPage).toBeUndefined();
  });

  it("is one empty page with nothing loaded or counted", () => {
    expect(pageWindow([], 0, 1, 100)).toMatchObject({ totalPages: 0, safePage: 1, startIdx: 0, items: [] });
  });
});
