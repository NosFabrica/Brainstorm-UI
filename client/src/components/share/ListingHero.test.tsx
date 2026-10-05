// @vitest-environment jsdom
/**
 * The kind-30402 listing page: what a buyer needs to decide, and the two ways
 * to act — message the seller in their own Nostr app, or open the seller's
 * shop page. No checkout of ours: payment happens where the seller sells.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";

// The seller's other listings, for a listing published outside Conduit whose seller sells on Conduit.
const recentMock = vi.fn(async (_pubkey: string, _kinds: number[], _limit: number) => [] as unknown[]);
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchRecentByKinds: (pk: string, kinds: number[], limit: number) => recentMock(pk, kinds, limit),
  fetchListingFamily: async () => [],
}));

// The "Followed by …" line is the profile's own component, tested where it
// lives; here it only matters that the seller's is asked for, and where it sits.
vi.mock("@/components/search/EndorsementLine", () => ({
  FollowedByLine: ({ pubkey, personal }: { pubkey: string; personal: boolean }) => (
    <span data-testid="followed-by" data-pubkey={pubkey} data-personal={String(personal)}>
      Followed by 12 verified accounts
    </span>
  ),
}));
const perspective = vi.hoisted(() => ({ pov: "nosfabrica" }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => [perspective.pov, () => {}] }));

import { ListingHero } from "./ListingHero";

beforeEach(() => {
  recentMock.mockReset();
  recentMock.mockResolvedValue([]);
});

const SELLER = "9".repeat(64);
const listing = (
  tags: string[][],
  content = "Maglia in kashmir, taglia M. Spedizione tracciata. https://barattolo.app/faq",
) => ({
  id: "1".repeat(64),
  kind: 30402,
  pubkey: SELLER,
  created_at: 1_788_484_721,
  content,
  sig: "",
  tags: [["d", "maglia-1"], ["title", "Maglia in kashmir donna"], ["price", "23550", "sats"], ...tags],
});

const ratesMock = vi.fn<() => Record<string, number> | null>(() => ({ USD: 100_000, EUR: 90_000 }));
vi.mock("@/hooks/useBtcRates", () => ({ useBtcRates: () => ratesMock() }));

describe("ListingHero", () => {
  it("shows the photos, the price as priced, where it is, shipping, and the description with its links live", () => {
    render(
      <ListingHero
        event={listing([
          ["image", "https://img/1.jpg"],
          ["image", "https://img/2.jpg"],
          ["location", "Gubbio (PG)"],
          ["shipping_option", "Italia", "500", "sats"],
          ["shipping_option", "Europa", "1500", "sats"],
          ["t", "abbigliamento"],
        ])}
      />,
    );
    const hero = screen.getByTestId("listing-hero");
    expect(screen.getByTestId("listing-hero-title")).toHaveTextContent("Maglia in kashmir donna");
    expect(screen.getByTestId("listing-hero-price")).toHaveTextContent("23,550 sats");
    // The seller's price leads; what it is in the buyer's money sits under it.
    expect(screen.getByTestId("listing-hero-price-converted")).toHaveTextContent("≈ $23.55");
    expect(hero).toHaveTextContent("Gubbio (PG)");
    // Gallery: the first photo large, the rest as thumbnails; tapping one swaps it in.
    expect((screen.getByTestId("listing-hero-photo") as HTMLImageElement).getAttribute("src")).toBe(
      "https://img/1.jpg",
    );
    fireEvent.click(screen.getByTestId("listing-hero-thumb-1"));
    expect((screen.getByTestId("listing-hero-photo") as HTMLImageElement).getAttribute("src")).toBe(
      "https://img/2.jpg",
    );
    // Shipping as the seller published it.
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("Italia");
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("500 sats");
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("Europa");
    // The description's link is a link (underlined in the prose, as on every event page).
    const links = screen.getAllByTestId("reading-link");
    expect(links.some((a) => a.getAttribute("href") === "https://barattolo.app/faq")).toBe(true);
    expect(hero).toHaveTextContent("abbigliamento");
  });

  it("acts through the seller's own app and shop — never a checkout of ours", () => {
    render(
      <ListingHero
        event={listing([
          ["image", "https://img/1.jpg"],
          ["r", "https://barattolo.app/l/maglia-1"],
        ])}
      />,
    );
    const message = screen.getByTestId("listing-hero-message");
    expect(message.getAttribute("href")).toMatch(/^nostr:(npub1|nprofile1)/);
    expect(message).toHaveTextContent(/Message seller/);
    const shop = screen.getByTestId("listing-hero-shop");
    // A seller's own link is named by its host; a marketplace we know says "Buy on".
    expect(shop).toHaveTextContent(/^Visit barattolo.app$/);
    expect(shop).toHaveAttribute("title", expect.stringContaining("barattolo.app"));
    expect(shop.getAttribute("href")).toBe("https://barattolo.app/l/maglia-1");
    expect(shop.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText(/Buy now|Add to cart|Checkout/i)).toBeNull();
  });

  /**
   * Conduit's listings carry no shop link — the Merchant Portal stamps only a
   * client tag — so until now they had no way out at all. When we know the app
   * by name, the button says so and opens the product there, referral included;
   * still never a checkout of ours.
   */
  it("a Conduit listing opens in Conduit, by name, with our referral", () => {
    render(
      <ListingHero
        event={listing([
          ["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant", "wss://relay.conduit.market"],
        ])}
      />,
    );

    const shop = screen.getByTestId("listing-hero-shop");
    expect(shop).toHaveTextContent(/^Buy on Conduit$/);
    expect(shop.getAttribute("href")).toMatch(
      /^https:\/\/shop\.conduit\.market\/products\/naddr1[a-z0-9]+\?ref=brainstorm$/,
    );
    expect(shop.getAttribute("target")).toBe("_blank");
    expect(shop).toHaveAttribute("title", expect.stringContaining("shop.conduit.market"));
    expect(screen.queryByText(/Buy now|Add to cart|Checkout/i)).toBeNull();
  });

  it("a listing published outside Conduit by a seller who sells on Conduit opens there — at the twin's product page", async () => {
    // Benjamin (2026-09-24): Staci's shop on Conduit has every product; only her Conduit-published events had the link.
    const twin = listing([["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant"]]);
    recentMock.mockResolvedValue([
      {
        ...twin,
        id: "2".repeat(64),
        tags: [
          ["d", "maglia-conduit"],
          ["title", "Maglia in kashmir donna"],
          ["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant"],
        ],
      },
    ]);
    render(<ListingHero event={listing([["t", "Fashion"]])} />);
    const shop = await screen.findByTestId("listing-hero-shop");
    expect(shop).toHaveTextContent(/^Buy on Conduit$/);
    expect(shop.getAttribute("href")).toMatch(
      /^https:\/\/shop\.conduit\.market\/products\/naddr1[a-z0-9]+\?ref=brainstorm$/,
    );
    expect(recentMock).toHaveBeenCalledWith(SELLER, [30402], expect.any(Number));
  });

  it("a listing with no shop link and no marketplace we know still opens the seller's own website, when their profile names one", () => {
    // The Bitcoin Shop UK's "The Cathedral" (2026-09-24): published through Gamma Markets, no link on the listing, thebitcoinshop.uk on the profile.
    render(
      <ListingHero
        event={listing([["client", "gamma-markets-bulk-updater"]])}
        sellerWebsite="https://thebitcoinshop.uk/"
      />,
    );
    const shop = screen.getByTestId("listing-hero-shop");
    expect(shop).toHaveTextContent("Visit thebitcoinshop.uk");
    expect(shop.getAttribute("href")).toBe("https://thebitcoinshop.uk/");
    expect(shop.getAttribute("target")).toBe("_blank");
  });

  it("a listing with no shop link offers only the message, and a sold one says so", () => {
    render(<ListingHero event={listing([["status", "sold"]])} />);
    expect(screen.queryByTestId("listing-hero-shop")).toBeNull();
    expect(screen.getByTestId("listing-hero-status")).toHaveTextContent(/Sold/i);
    expect(screen.getByTestId("listing-hero-message")).toBeInTheDocument();
  });

  it("a markdown description is formatted — no heading hashes, no emphasis marks, real lists", () => {
    render(
      <ListingHero
        event={listing(
          [["image", "https://img/1.jpg"]],
          "## Nostr Pop Run\n\nDownload **here** the _SVG_ file.\n- stickers\n- shirts",
        )}
      />,
    );
    const desc = screen.getByTestId("listing-hero-description");
    expect(desc).toHaveTextContent("Nostr Pop Run");
    expect(desc).not.toHaveTextContent(/##|\*\*|_SVG_/);
    expect(desc).toHaveTextContent("Download here the SVG file.");
    expect(within(desc).getByRole("heading")).toHaveTextContent("Nostr Pop Run");
    expect(
      within(desc)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["stickers", "shirts"]);
  });

  it("a listing with no price still shows its title, photo and story — with 'Price on request' instead of a badge", () => {
    const ev = {
      id: "2".repeat(64),
      kind: 30402,
      pubkey: SELLER,
      created_at: 1_788_484_721,
      sig: "",
      content: "A VPN that cannot log you.",
      tags: [
        ["d", "obscura-vpn"],
        ["title", "Obscura VPN"],
        ["image", "https://img/vpn.png"],
        ["t", "privacy"],
      ],
    };
    render(<ListingHero event={ev} />);
    expect(screen.getByTestId("listing-hero-title")).toHaveTextContent("Obscura VPN");
    expect(screen.getByTestId("listing-hero-photo")).toHaveAttribute("src", "https://img/vpn.png");
    expect(screen.getByTestId("listing-hero-description")).toHaveTextContent("A VPN that cannot log you.");
    expect(screen.queryByTestId("listing-hero-price")).toBeNull();
    expect(screen.getByTestId("listing-hero-price-unknown")).toHaveTextContent("Price on request");
    // No price is not a status — nothing here is sold or gone.
    expect(screen.queryByTestId("listing-hero-status")).toBeNull();
  });

  // A shopper reads the name, picks a size, then buys — so the sizes sit
  // between the title and the buttons, not under the whole description
  // (Benjamin, 2026-10-05).
  it("offers the product's options between the title and the buy buttons", async () => {
    const P = `30402:${SELLER}:hoodie`;
    const sized = (s: string, at: number) => ({
      id: `${s}`.padEnd(64, "a"),
      kind: 30402,
      pubkey: SELLER,
      created_at: at,
      content: "",
      sig: "",
      tags: [
        ["d", `hoodie-${s}`],
        ["title", `Hoodie - ${s}`],
        ["price", "46.2", "USD"],
        ["type", "variation", "physical"],
        ["a", P],
        ["spec", "Size", s],
      ],
    });
    const self = sized("M", 10);
    recentMock.mockResolvedValue([self, sized("L", 9), sized("S", 8)]);
    render(<ListingHero event={self} />);
    const options = await screen.findByTestId("listing-options");
    expect(
      within(options)
        .getAllByTestId("listing-option")
        .map((c) => c.textContent),
    ).toEqual(["S", "M", "L"]);
    const before = (a: HTMLElement, b: HTMLElement) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(screen.getByTestId("listing-hero-title"), options)).toBe(true);
    expect(before(options, screen.getByTestId("listing-hero-actions"))).toBe(true);
  });

  // Seventeen search tags between the name and the buy button pushed the
  // button down the page. They are how a listing is found, not what a buyer
  // reads first: a few, under the description, and the rest one tap away.
  describe("the seller's categories", () => {
    const TAGS = [
      "bitcoin",
      "bitcoin hoodie",
      "nixon",
      "1971",
      "sound money",
      "Satoshoes",
      "hoodie",
      "hoodies",
      "Hoodie",
      "tops",
      "clothes",
    ];
    const withTags = () => listing(TAGS.map((t) => ["t", t]));
    const shown = () => screen.getAllByTestId("listing-hero-category").map((c) => c.textContent);

    it("sit under the description, five at first, with the rest behind a count", () => {
      render(<ListingHero event={withTags()} sellerName="Satoshoes" />);
      expect(shown()).toEqual(["bitcoin", "bitcoin hoodie", "nixon", "1971", "sound money"]);
      const more = screen.getByTestId("listing-hero-categories-more");
      // Eleven tags, less the seller's own name and two repeats of "hoodie": eight, five shown.
      expect(more).toHaveTextContent("+3 more");
      const before = (a: HTMLElement, b: HTMLElement) =>
        !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        before(screen.getByTestId("listing-hero-description"), screen.getByTestId("listing-hero-categories")),
      ).toBe(true);
      expect(before(screen.getByTestId("listing-hero-actions"), screen.getByTestId("listing-hero-categories"))).toBe(
        true,
      );

      fireEvent.click(more);
      expect(shown()).toEqual([
        "bitcoin",
        "bitcoin hoodie",
        "nixon",
        "1971",
        "sound money",
        "hoodie",
        "tops",
        "clothes",
      ]);
      expect(screen.queryByTestId("listing-hero-categories-more")).toBeNull();
    });

    it("show all of them, with no count, when there are five or fewer", () => {
      render(
        <ListingHero
          event={listing([
            ["t", "soap"],
            ["t", "tallow"],
          ])}
        />,
      );
      expect(shown()).toEqual(["soap", "tallow"]);
      expect(screen.queryByTestId("listing-hero-categories-more")).toBeNull();
    });
  });

  // What a shopper reads, in the order they read it: the name, the price, who
  // is selling and why to trust them, then the way to buy (2026-10-05).
  describe("the buying block", () => {
    const before = (a: HTMLElement, b: HTMLElement) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it("puts the price in words under the title, with the buyer's own money beside it", () => {
      render(<ListingHero event={listing([["image", "https://img/1.jpg"]])} />);
      const line = screen.getByTestId("listing-hero-price-line");
      expect(line).toHaveTextContent("23,550 sats");
      expect(line).toHaveTextContent("≈ $23.55");
      expect(before(screen.getByTestId("listing-hero-title"), line)).toBe(true);
      expect(before(line, screen.getByTestId("listing-hero-actions"))).toBe(true);
      // Said once: the photo no longer carries a second copy.
      expect(screen.getAllByTestId("listing-hero-price")).toHaveLength(1);
      expect(line.contains(screen.getByTestId("listing-hero-price"))).toBe(true);
    });

    it("says who is selling and who follows them, between the price and the buttons", () => {
      render(<ListingHero event={listing([])} sellerName="Barattolo" />);
      const seller = screen.getByTestId("listing-hero-seller");
      expect(seller).toHaveTextContent("Sold by Barattolo");
      expect(screen.getByTestId("followed-by")).toHaveAttribute("data-pubkey", SELLER);
      expect(screen.getByTestId("followed-by")).toHaveAttribute("data-personal", "false");
      expect(before(screen.getByTestId("listing-hero-price-line"), seller)).toBe(true);
      expect(before(seller, screen.getByTestId("listing-hero-actions"))).toBe(true);
    });

    it("reads the seller's following through the reader's own perspective when they chose it", () => {
      perspective.pov = "mywot";
      render(<ListingHero event={listing([])} sellerName="Barattolo" />);
      expect(screen.getByTestId("followed-by")).toHaveAttribute("data-personal", "true");
      perspective.pov = "nosfabrica";
    });

    it("names no seller it was not told, but still shows who follows them", () => {
      render(<ListingHero event={listing([])} />);
      expect(screen.getByTestId("listing-hero-seller")).not.toHaveTextContent("Sold by");
      expect(screen.getByTestId("followed-by")).toBeInTheDocument();
    });
  });

  // A description can run to a dozen paragraphs; shipping, categories and the
  // seller's other things were a long scroll below it.
  describe("a long description", () => {
    const LONG = Array.from(
      { length: 12 },
      (_, i) => `Paragraph ${i + 1} about the hoodie, its fabric and its fit.`,
    ).join("\n\n");

    it("shows its start, and the rest on request", () => {
      render(<ListingHero event={listing([], LONG)} />);
      const box = screen.getByTestId("listing-hero-description-box");
      expect(box).toHaveAttribute("data-collapsed", "true");
      fireEvent.click(screen.getByTestId("listing-hero-description-more"));
      expect(box).toHaveAttribute("data-collapsed", "false");
      expect(screen.queryByTestId("listing-hero-description-more")).toBeNull();
      expect(box).toHaveTextContent("Paragraph 12");
    });

    it("is shown whole when it is short", () => {
      render(<ListingHero event={listing([], "A short note about a jumper.")} />);
      expect(screen.getByTestId("listing-hero-description-box")).toHaveAttribute("data-collapsed", "false");
      expect(screen.queryByTestId("listing-hero-description-more")).toBeNull();
    });
  });

  // On a phone the buy button scrolls away under a long description. A slim
  // bar brings it back — the same link out, never a checkout of ours — only
  // while the real buttons are off screen.
  describe("the phone buy bar", () => {
    let report: (visible: boolean) => void = () => {};
    beforeEach(() => {
      report = () => {};
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(private cb: IntersectionObserverCallback) {}
          observe(el: Element) {
            report = (visible) =>
              this.cb(
                [{ isIntersecting: visible, target: el } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver,
              );
          }
          unobserve() {}
          disconnect() {}
          takeRecords() {
            return [];
          }
        },
      );
    });
    const conduit = () =>
      listing([["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant", "wss://relay.conduit.market"]]);

    it("appears once the buy buttons scroll out of view, with the price and the same way to buy", () => {
      render(<ListingHero event={conduit()} />);
      expect(screen.queryByTestId("listing-hero-buybar")).toBeNull();

      act(() => report(false));
      const bar = screen.getByTestId("listing-hero-buybar");
      expect(bar).toHaveTextContent("23,550 sats");
      const link = within(bar).getByTestId("listing-hero-buybar-link");
      expect(link).toHaveTextContent("Buy on Conduit");
      expect(link.getAttribute("href")).toBe(screen.getByTestId("listing-hero-shop").getAttribute("href"));
      expect(link.getAttribute("target")).toBe("_blank");
      expect(screen.queryByText(/Buy now|Add to cart|Checkout/i)).toBeNull();

      act(() => report(true));
      expect(screen.queryByTestId("listing-hero-buybar")).toBeNull();
    });

    it("is not offered when there is nowhere to buy, or nothing for sale", () => {
      const { unmount } = render(<ListingHero event={listing([])} />);
      act(() => report(false));
      expect(screen.queryByTestId("listing-hero-buybar")).toBeNull();
      unmount();

      render(
        <ListingHero
          event={listing([
            ["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant"],
            ["status", "sold"],
          ])}
        />,
      );
      act(() => report(false));
      expect(screen.queryByTestId("listing-hero-buybar")).toBeNull();
    });
  });
});
