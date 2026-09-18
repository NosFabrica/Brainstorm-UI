// @vitest-environment jsdom
/**
 * The kind-30402 listing page: what a buyer needs to decide, and how to act —
 * buy it on Conduit Market (the listing's own page there), open the seller's
 * shop, or message the seller in their own Nostr app. No cart of ours:
 * checkout is Conduit's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/utils";
import type { SignerKind } from "@/accounts/picker";

const signer = vi.hoisted(() => ({ kind: null as SignerKind | null }));
vi.mock("@/hooks/useSignerKind", () => ({ useSignerKind: () => signer.kind }));
// The seller's side of the page: who they are and how Brainstorm rates them.
const seller = vi.hoisted(() => ({ score: 0.62 as number | null | undefined }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ name: "Crete Honey Co" }) }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => seller.score }));
vi.mock("@/hooks/useHopsOrigin", () => ({ useHopsOrigin: () => ({ origin: null, originPov: "global", isFallback: false, loading: false }) }));
vi.mock("@/components/DegreeChip", () => ({ DegreeChip: () => null }));

import { ListingHero } from "./ListingHero";

const SELLER = "9".repeat(64);
const listing = (tags: string[][], content = "Maglia in kashmir, taglia M. Spedizione tracciata. https://barattolo.app/faq") => ({
  id: "1".repeat(64),
  kind: 30402,
  pubkey: SELLER,
  created_at: 1_788_484_721,
  content,
  sig: "",
  tags: [["d", "maglia-1"], ["title", "Maglia in kashmir donna"], ["price", "23550", "sats"], ...tags],
});

describe("ListingHero", () => {
  beforeEach(() => {
    signer.kind = null;
    seller.score = 0.62;
  });

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
    expect(hero).toHaveTextContent("Gubbio (PG)");
    // Gallery: the first photo large, the rest as thumbnails; tapping one swaps it in.
    expect((screen.getByTestId("listing-hero-photo") as HTMLImageElement).getAttribute("src")).toBe("https://img/1.jpg");
    fireEvent.click(screen.getByTestId("listing-hero-thumb-1"));
    expect((screen.getByTestId("listing-hero-photo") as HTMLImageElement).getAttribute("src")).toBe("https://img/2.jpg");
    // Shipping as the seller published it.
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("Italia");
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("500 sats");
    expect(screen.getByTestId("listing-hero-shipping")).toHaveTextContent("Europa");
    // The description's link is a link (rendered as the site's chip, like every note).
    const links = screen.getAllByTestId("link-chip");
    expect(links.some((a) => a.getAttribute("href") === "https://barattolo.app/faq")).toBe(true);
    expect(hero).toHaveTextContent("abbigliamento");
  });

  // Checkout is Conduit's — the listing's own page there, found by its address.
  it("puts Buy on Conduit first, keeps the seller's shop and a message — never a cart of ours", () => {
    render(<ListingHero event={listing([["image", "https://img/1.jpg"], ["r", "https://barattolo.app/l/maglia-1"]])} />);
    const buy = screen.getByTestId("listing-hero-buy-conduit");
    expect(buy).toHaveTextContent(/Buy on Conduit/);
    expect(buy.getAttribute("href")).toMatch(/^https:\/\/shop\.conduit\.market\/products\/naddr1/);
    expect(buy.getAttribute("target")).toBe("_blank");
    expect(buy.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("listing-hero-actions").firstElementChild).toBe(buy);
    const message = screen.getByTestId("listing-hero-message");
    expect(message.getAttribute("href")).toMatch(/^nostr:(npub1|nprofile1)/);
    expect(message).toHaveTextContent(/Message seller/);
    const shop = screen.getByTestId("listing-hero-shop");
    // One label for every marketplace; the favicon and a tooltip say which.
    expect(shop).toHaveTextContent(/^Visit shop$/);
    expect(shop).toHaveAttribute("title", expect.stringContaining("barattolo.app"));
    expect(shop.getAttribute("href")).toBe("https://barattolo.app/l/maglia-1");
    expect(shop.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText(/Add to cart/i)).toBeNull();
  });

  // Conduit shows these as unavailable; a link would be a dead end.
  it("keeps messaging as the way to act when Conduit can't sell it — no photo, or sold", () => {
    const { unmount } = render(<ListingHero event={listing([])} />);
    expect(screen.queryByTestId("listing-hero-buy-conduit")).toBeNull();
    expect(screen.getByTestId("listing-hero-actions").firstElementChild).toBe(screen.getByTestId("listing-hero-message"));
    unmount();
    render(<ListingHero event={listing([["image", "https://img/1.jpg"], ["status", "sold"]])} />);
    expect(screen.queryByTestId("listing-hero-buy-conduit")).toBeNull();
  });

  it("a listing with no shop link offers only the message, and a sold one says so", () => {
    render(<ListingHero event={listing([["status", "sold"]])} />);
    expect(screen.queryByTestId("listing-hero-shop")).toBeNull();
    expect(screen.getByTestId("listing-hero-status")).toHaveTextContent(/Sold/i);
    expect(screen.getByTestId("listing-hero-message")).toBeInTheDocument();
  });

  it("a markdown description reads as words — no heading hashes, no emphasis marks", () => {
    render(<ListingHero event={listing([["image", "https://img/1.jpg"]], "## Nostr Pop Run\n\nDownload **here** the _SVG_ file.\n- stickers\n- shirts")} />);
    const desc = screen.getByTestId("listing-hero-description");
    expect(desc).toHaveTextContent("Nostr Pop Run");
    expect(desc).not.toHaveTextContent(/##|\*\*|_SVG_/);
    expect(desc).toHaveTextContent("Download here the SVG file.");
    expect(desc).toHaveTextContent("• stickers");
  });

  it("a listing with no price still shows its title, photo and story — with 'Price on request' instead of a badge", () => {
    const ev = { id: "2".repeat(64), kind: 30402, pubkey: SELLER, created_at: 1_788_484_721, sig: "", content: "A VPN that cannot log you.", tags: [["d", "obscura-vpn"], ["title", "Obscura VPN"], ["image", "https://img/vpn.png"], ["t", "privacy"]] };
    render(<ListingHero event={ev} />);
    expect(screen.getByTestId("listing-hero-title")).toHaveTextContent("Obscura VPN");
    expect(screen.getByTestId("listing-hero-photo")).toHaveAttribute("src", "https://img/vpn.png");
    expect(screen.getByTestId("listing-hero-description")).toHaveTextContent("A VPN that cannot log you.");
    expect(screen.queryByTestId("listing-hero-price")).toBeNull();
    expect(screen.getByTestId("listing-hero-price-unknown")).toHaveTextContent("Price on request");
    // No price is not a status — nothing here is sold or gone.
    expect(screen.queryByTestId("listing-hero-status")).toBeNull();
  });

  // Nothing about the buyer can travel to Conduit, so say what will happen
  // there for the way they sign in.
  it.each([
    ["extension", /your nostr extension signs you in there/i],
    ["remote", /connect the same signer app there/i],
    ["amber", /connect the same signer app there/i],
    ["key", /check out as a guest/i],
    [null, /check out as a guest/i],
  ] as const)("tells a %s signer how checkout on Conduit will go", (kind, words) => {
    signer.kind = kind;
    render(<ListingHero event={listing([["image", "https://img/1.jpg"]])} />);
    expect(screen.getByTestId("listing-hero-checkout-note")).toHaveTextContent(words);
  });

  // Brainstorm's part of a purchase: who this seller is to you, before you
  // leave to pay somewhere else.
  it("shows who the seller is and how Brainstorm rates them, linked to their profile", () => {
    render(<ListingHero event={listing([["image", "https://img/1.jpg"]])} />);
    const who = screen.getByTestId("listing-hero-seller");
    expect(who).toHaveTextContent("Crete Honey Co");
    expect(who.querySelector('a[href*="npub1"]')).not.toBeNull();
    expect(screen.queryByTestId("listing-hero-seller-unrated")).toBeNull();
  });

  it("says plainly when Brainstorm hasn't rated the seller", () => {
    seller.score = null;
    render(<ListingHero event={listing([["image", "https://img/1.jpg"]])} />);
    expect(screen.getByTestId("listing-hero-seller-unrated")).toHaveTextContent(/hasn't rated this seller yet/i);
  });
});
