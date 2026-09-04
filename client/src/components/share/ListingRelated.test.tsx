// @vitest-environment jsdom
/**
 * Under a listing, two ways onward: more from the same seller, and similar
 * things from other sellers in the same categories. Neither row appears
 * when it would be empty; the listing itself never recommends itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const recentMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>();
const profileMapMock = vi.fn<(pks: string[]) => Promise<Map<string, Record<string, unknown>>>>();
vi.mock("@/services/nostr", () => ({
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentMock(pubkey, kinds, limit),
  fetchProfileMap: (pks: string[]) => profileMapMock(pks),
}));
const similarMock = vi.fn<(cats: string[], self: string, opts: { excludePubkey?: string }) => Promise<NostrEvent[]>>();
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchSimilarListings: (cats: string[], self: string, opts: { excludePubkey?: string }) => similarMock(cats, self, opts),
}));

import { ListingRelated } from "./ListingRelated";

const SELLER = "ab".repeat(32);
const OTHER = "cd".repeat(32);
const listing = (pk: string, d: string, title: string, created_at: number, extra: string[][] = []): NostrEvent =>
  ({
    id: `${d}-${created_at}`.padEnd(64, "0"),
    pubkey: pk,
    kind: 30402,
    created_at,
    content: "",
    sig: "",
    tags: [["d", d], ["title", title], ["price", "12", "USD"], ["image", `https://img/${d}.jpg`], ["t", "Health & Beauty"], ["t", "shopstr"], ...extra],
  }) as NostrEvent;
const SELF = listing(SELLER, "kit", "Fresh Start Skincare Kit", 1000);

describe("ListingRelated", () => {
  beforeEach(() => {
    recentMock.mockReset();
    similarMock.mockReset();
    profileMapMock.mockReset();
    profileMapMock.mockResolvedValue(new Map());
    similarMock.mockResolvedValue([]);
    recentMock.mockResolvedValue([]);
  });

  it("offers more from the same seller, newest first — never this listing (even a newer edit of it) nor a sold one", async () => {
    recentMock.mockResolvedValue([
      listing(SELLER, "kit", "Fresh Start Skincare Kit", 1500), // a newer edit of the listing being read
      listing(SELLER, "balm", "Lip balm", 2000),
      listing(SELLER, "soap", "Sold-out soap", 2500, [["status", "sold"]]),
      listing(SELLER, "cream", "Tallow cream", 3000),
    ]);
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const row = await screen.findByTestId("listing-more-from-seller");
    expect(row).toHaveTextContent("More for sale from Born To Be Free");
    const titles = within(row).getAllByText(/Tallow cream|Lip balm|Skincare Kit|soap/).map((n) => n.textContent);
    expect(titles).toEqual(["Tallow cream", "Lip balm"]);
    expect(within(row).queryByText("Unknown")).toBeNull();
    expect(screen.queryByTestId("listing-similar")).toBeNull();
  });

  it("offers similar listings from other sellers, named, asked for by this listing's categories", async () => {
    similarMock.mockResolvedValue([listing(OTHER, "cup", "Clay cup", 900), listing(OTHER, "gone", "Gone", 950, [["status", "sold"]])]);
    profileMapMock.mockResolvedValue(new Map([[OTHER, { name: "cupco", display_name: "Cup Co" }]]));
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const row = await screen.findByTestId("listing-similar");
    expect(row).toHaveTextContent("Similar listings");
    expect(within(row).getByText("Clay cup")).toBeInTheDocument();
    expect(within(row).queryByText("Gone")).toBeNull();
    expect(await within(row).findByText("Cup Co")).toBeInTheDocument();
    const [cats, self, opts] = similarMock.mock.calls[0];
    expect(cats).toEqual(expect.arrayContaining(["Health & Beauty", "health & beauty"]));
    expect(cats).not.toContain("shopstr"); // the app's own tag would match its whole catalogue
    expect(self).toBe(`30402:${SELLER}:kit`);
    expect(opts.excludePubkey).toBe(SELLER);
    expect(screen.queryByTestId("listing-more-from-seller")).toBeNull();
  });
});
