// @vitest-environment jsdom
/**
 * Everything a person has for sale, on its own page — the share page shows
 * a shelf and sends the curious here. Sold and hidden stay off; the seller
 * is named; there is a way back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";

const recentMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>();
const profileMock = vi.fn(async () => ({ name: "borntobefree", display_name: "Born To Be Free", picture: "https://img/me.jpg" }));
vi.mock("@/services/nostr", () => ({
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentMock(pubkey, kinds, limit),
  fetchProfileForShare: () => profileMock(),
}));
const goBackMock = vi.fn();
vi.mock("@/hooks/useGoBack", () => ({ useGoBack: () => goBackMock }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

import { SellerListings } from "./SellingPage";

const SELLER = "ab".repeat(32);
const listing = (id: string, title: string, created_at: number, extra: string[][] = []): NostrEvent =>
  ({ id: id.padEnd(64, "0"), pubkey: SELLER, kind: 30402, created_at, content: "", sig: "", tags: [["d", id], ["title", title], ["price", "35", "USD"], ["image", `https://img/${id}.jpg`], ...extra] }) as NostrEvent;

describe("SellerListings", () => {
  beforeEach(() => {
    recentMock.mockReset();
  });

  it("lists everything the seller has for sale, newest first, under their name — sold left out", async () => {
    recentMock.mockResolvedValue([
      ...Array.from({ length: 9 }, (_, i) => listing(`l${i}`, `Shirt ${i}`, 1000 + i)),
      listing("gone", "Gone", 5000, [["status", "sold"]]),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SellerListings pubkey={SELLER} npub="npub1seller" relayHints={[]} />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("selling-title")).toHaveTextContent("For sale from Born To Be Free");
    expect(screen.getByTestId("selling-count")).toHaveTextContent("9");
    const cards = screen.getAllByTestId(/^listing-card-/);
    expect(cards).toHaveLength(9);
    expect(cards[0]).toHaveTextContent("Shirt 8");
    expect(screen.queryByText("Gone")).toBeNull();
    expect(recentMock).toHaveBeenCalledWith(SELLER, [30402], expect.any(Number));
    expect(screen.getByTestId("selling-back")).toHaveTextContent("Back to Born");
  });

  it("says so when there is nothing for sale", async () => {
    recentMock.mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SellerListings pubkey={SELLER} npub="npub1seller" relayHints={[]} />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("selling-empty")).toHaveTextContent("Nothing for sale right now");
  });
});
