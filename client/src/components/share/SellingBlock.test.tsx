// @vitest-environment jsdom
/**
 * A seller's public page shows what they have for sale — the shelf the
 * search panel's "All" link promises. Sold and hidden listings stay off it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nip19, type NostrEvent } from "nostr-tools";

const recentMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>();
vi.mock("@/services/nostr", () => ({
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentMock(pubkey, kinds, limit),
}));

import { SellingBlock } from "./SellingBlock";

const SELLER = "ab".repeat(32);
const listing = (id: string, title: string, created_at: number, extra: string[][] = []): NostrEvent =>
  ({
    id: id.padEnd(64, "0"),
    pubkey: SELLER,
    kind: 30402,
    created_at,
    content: "",
    sig: "",
    tags: [["d", id], ["title", title], ["price", "12", "USD"], ["image", `https://img/${id}.jpg`], ...extra],
  }) as NostrEvent;

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SellingBlock", () => {
  beforeEach(() => {
    recentMock.mockReset();
  });

  it("lists what the seller has for sale, newest first, without the sold — and says how many", async () => {
    recentMock.mockResolvedValue([
      listing("l2", "Lip balm", 2000),
      listing("l3", "Gone already", 2500, [["status", "sold"]]),
      listing("l1", "Skincare kit", 3000),
    ]);
    const onCount = vi.fn();
    mount(<SellingBlock pubkey={SELLER} onCount={onCount} />);
    const block = await screen.findByTestId("share-block-selling");
    expect(recentMock).toHaveBeenCalledWith(SELLER, [30402], expect.any(Number));
    const titles = within(block).getAllByText(/Skincare kit|Lip balm|Gone already/).map((n) => n.textContent);
    expect(titles).toEqual(["Skincare kit", "Lip balm"]);
    expect(within(block).getByTestId(`listing-price-${"l1".padEnd(64, "0")}`)).toHaveTextContent("$12");
    // The seller's own shelf names no author — it is theirs.
    expect(within(block).queryByText("Unknown")).toBeNull();
    const hrefs = within(block).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/e/"))).toBe(true);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(2));
    expect(within(block).queryByTestId("block-view-all")).toBeNull(); // two fit; nothing to see beyond
  });

  it("keeps a public page short: the six newest, and a way to all of them", async () => {
    recentMock.mockResolvedValue(Array.from({ length: 8 }, (_, i) => listing(`l${i}`, `Item ${i}`, 1000 + i)));
    mount(<SellingBlock pubkey={SELLER} />);
    const block = await screen.findByTestId("share-block-selling");
    expect(within(block).getAllByTestId(/^listing-card-/)).toHaveLength(6);
    expect(within(block).getByText("Item 7")).toBeInTheDocument();
    expect(within(block).queryByText("Item 1")).toBeNull();
    const all = within(block).getByTestId("block-view-all");
    expect(all).toHaveTextContent("See all 8");
    expect(all).toHaveAttribute("href", `/p/${nip19.npubEncode(SELLER)}/selling`);
  });

  it("shows nothing for someone with nothing for sale, and reports zero", async () => {
    recentMock.mockResolvedValue([listing("l3", "Gone already", 2500, [["status", "sold"]])]);
    const onCount = vi.fn();
    mount(<SellingBlock pubkey={SELLER} onCount={onCount} />);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(0));
    expect(screen.queryByTestId("share-block-selling")).toBeNull();
  });

  it("folds one product in several sizes into one card that says how many options — the count is products, not listings", async () => {
    const shirt = (size: string, at: number) =>
      ({ ...listing(`shirt-${size}`, `SOUND COFFEE T-SHIRT — ${size} / PEPPER`, at), tags: [["d", `shirt-${size}`], ["title", `SOUND COFFEE T-SHIRT — ${size} / PEPPER`], ["price", "35", "USD"], ["image", "https://img/shirt.jpg"]] }) as NostrEvent;
    recentMock.mockResolvedValue([shirt("XXL", 3000), shirt("XL", 2900), shirt("SMALL", 2800), listing("bag", "SOUND COFFEE", 2000)]);
    const onCount = vi.fn();
    mount(<SellingBlock pubkey={SELLER} onCount={onCount} />);
    const block = await screen.findByTestId("share-block-selling");
    const cards = within(block).getAllByTestId(/^listing-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("SOUND COFFEE T-SHIRT");
    expect(cards[0]).not.toHaveTextContent("XXL");
    expect(within(cards[0]).getByTestId(/^listing-options-/)).toHaveTextContent("3 options");
    expect(within(cards[0]).getByRole("link").getAttribute("href")).toMatch(/^\/e\//);
    expect(within(cards[1]).queryByTestId(/^listing-options-/)).toBeNull();
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(2));
  });
});
