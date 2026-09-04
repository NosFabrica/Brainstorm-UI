// @vitest-environment jsdom
/**
 * The kind-30402 listing page: what a buyer needs to decide, and the two ways
 * to act — message the seller in their own Nostr app, or open the seller's
 * shop page. No checkout of ours: payment happens where the seller sells.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("acts through the seller's own app and shop — never a checkout of ours", () => {
    render(<ListingHero event={listing([["image", "https://img/1.jpg"], ["r", "https://barattolo.app/l/maglia-1"]])} />);
    const message = screen.getByTestId("listing-hero-message");
    expect(message.getAttribute("href")).toMatch(/^nostr:(npub1|nprofile1)/);
    expect(message).toHaveTextContent(/Message seller/);
    const shop = screen.getByTestId("listing-hero-shop");
    expect(shop.getAttribute("href")).toBe("https://barattolo.app/l/maglia-1");
    expect(shop.getAttribute("target")).toBe("_blank");
    expect(shop).toHaveTextContent(/barattolo\.app/);
    expect(screen.queryByText(/Buy now|Add to cart|Checkout/i)).toBeNull();
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
});
