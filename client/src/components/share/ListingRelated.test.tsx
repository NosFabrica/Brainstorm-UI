// @vitest-environment jsdom
/**
 * Under a listing, two ways onward: more from the same seller, and similar
 * things from other sellers in the same categories. Neither row appears
 * when it would be empty; the listing itself never recommends itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { nip19, type NostrEvent } from "nostr-tools";

const recentMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>();
const profileMapMock = vi.fn<(pks: string[]) => Promise<Map<string, Record<string, unknown>>>>();
const familyMock = vi.fn<(pubkey: string, parent: string) => Promise<NostrEvent[]>>();
vi.mock("@/services/nostr", () => ({
  fetchListingFamily: (pubkey: string, parent: string) => familyMock(pubkey, parent),
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentMock(pubkey, kinds, limit),
  fetchProfileMap: (pks: string[]) => profileMapMock(pks),
}));
const similarMock = vi.fn<(cats: string[], self: string, opts: { excludePubkey?: string }) => Promise<NostrEvent[]>>();
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchSimilarListings: (cats: string[], self: string, opts: { excludePubkey?: string }) =>
    similarMock(cats, self, opts),
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
    tags: [
      ["d", d],
      ["title", title],
      ["price", "12", "USD"],
      ["image", `https://img/${d}.jpg`],
      ["t", "Health & Beauty"],
      ["t", "shopstr"],
      ...extra,
    ],
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
    familyMock.mockReset();
    familyMock.mockResolvedValue([]);
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
    const titles = within(row)
      .getAllByText(/Tallow cream|Lip balm|Skincare Kit|soap/)
      .map((n) => n.textContent);
    expect(titles).toEqual(["Tallow cream", "Lip balm"]);
    expect(within(row).queryByText("Unknown")).toBeNull();
    expect(screen.queryByTestId("listing-similar")).toBeNull();
  });

  // Staci's shop (2026-09-24): her 30 newest listings were copies marked
  // hidden, so a row that asked for 30 showed nothing under her soap while
  // her profile, asking deeper, showed 36 products.
  it("asks deep enough that a run of hidden copies cannot empty the row", async () => {
    const hidden = Array.from({ length: 30 }, (_, i) =>
      listing(SELLER, `copy-${i}`, `Hidden copy ${i}`, 5000 + i, [["visibility", "hidden"]]),
    );
    recentMock.mockImplementation(async (_pk, _kinds, limit) =>
      limit >= 100 ? [...hidden, listing(SELLER, "cream", "Tallow cream", 3000)] : hidden,
    );
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const row = await screen.findByTestId("listing-more-from-seller");
    expect(row).toHaveTextContent("Tallow cream");
    expect(row).not.toHaveTextContent("Hidden copy");
  });

  // Four is a teaser; the seller's page has everything. The heading says how
  // many and leads there — only when there is more than the row shows.
  it("the row's heading leads to everything the seller has, counted, when there is more than four", async () => {
    recentMock.mockResolvedValue([
      SELF,
      ...["a", "b", "c", "d", "e", "f"].map((d, i) => listing(SELLER, d, `Product ${d}`, 2000 + i)),
    ]);
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const row = await screen.findByTestId("listing-more-from-seller");
    expect(within(row).getAllByTestId(/^listing-card-/)).toHaveLength(4);
    const all = within(row).getByTestId("listing-seller-all");
    expect(all).toHaveTextContent("See all 6");
    expect(all.getAttribute("href")).toBe(`/p/${nip19.npubEncode(SELLER)}/selling`);
  });

  it("four or fewer products need no door — the row is everything", async () => {
    recentMock.mockResolvedValue([
      SELF,
      listing(SELLER, "a", "Product a", 2000),
      listing(SELLER, "b", "Product b", 2001),
    ]);
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const row = await screen.findByTestId("listing-more-from-seller");
    expect(within(row).queryByTestId("listing-seller-all")).toBeNull();
  });

  // Benjamin (2026-09-24): the row sat flush under the description card. It
  // keeps the same distance from its neighbours as the posts strip below it.
  it("stands off the description above and the sections below, like the posts strip", async () => {
    recentMock.mockResolvedValue([SELF, listing(SELLER, "a", "Product a", 2000)]);
    render(<ListingRelated event={SELF} sellerName="Born To Be Free" />);
    const block = await screen.findByTestId("listing-related");
    expect(block.className).toMatch(/\bmt-8\b/);
    expect(block.className).toMatch(/\bmb-8\b/);
    expect(block.className).toMatch(/\bspace-y-8\b/);
  });

  it("offers similar listings from other sellers, named, asked for by this listing's categories", async () => {
    similarMock.mockResolvedValue([
      listing(OTHER, "cup", "Clay cup", 900),
      listing(OTHER, "gone", "Gone", 950, [["status", "sold"]]),
    ]);
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

  it("offers the other sizes of this product as options, and keeps them out of the seller's other things", async () => {
    const variant = (d: string, title: string, at: number): NostrEvent =>
      ({
        id: `${d}-${at}`.padEnd(64, "0"),
        pubkey: SELLER,
        kind: 30402,
        created_at: at,
        content: "",
        sig: "",
        tags: [
          ["d", d],
          ["title", title],
          ["price", "12", "USD"],
          ["image", "https://img/tee.jpg"],
        ],
      }) as NostrEvent;
    const self = variant("tee-xl", "Tee — XL", 1000);
    recentMock.mockResolvedValue([
      self,
      variant("tee-l", "Tee — L", 900),
      variant("tee-m", "Tee — M", 800),
      listing(SELLER, "mug", "Mug", 700),
    ]);
    render(<ListingRelated event={self} sellerName="Born To Be Free" />);
    const options = await screen.findByTestId("listing-options");
    const chips = within(options).getAllByRole("link");
    expect(chips.map((c) => c.textContent)).toEqual(["L", "M"]);
    expect(chips[0].getAttribute("href")).toMatch(/^\/e\//);
    const row = screen.getByTestId("listing-more-from-seller");
    expect(within(row).getAllByTestId(/^listing-card-/)).toHaveLength(1);
    expect(row).toHaveTextContent("Mug");
    expect(row).not.toHaveTextContent("Tee");
  });

  // Issue #158: the 6XL hoodie's "Other options" listed its parent as an option
  // and labelled the sizes with fragments of the title. The seller's app says
  // what the product is and which size each listing is (Open Markets).
  describe("a product whose seller declared its options", () => {
    const NAME = "Circular Economy Hoodie – Permissionless / Rules Without Rulers";
    const P = `30402:${SELLER}:hoodie`;
    const SIZES = ["6XL", "5XL", "4XL", "3XL", "2XL", "XL", "L", "M", "S", "XS"];
    const parent = listing(SELLER, "hoodie", NAME, 2000, [["type", "variable", "physical"]]);
    const size = (s: string, i: number) =>
      listing(SELLER, `hoodie-${s.toLowerCase()}`, `${NAME} - ${s}`, 1990 - i, [
        ["type", "variation", "physical"],
        ["a", P],
        ["spec", "Size", s],
      ]);
    const kids = SIZES.map(size);
    const mug = listing(SELLER, "mug", "Mug", 500);
    const chips = () => within(screen.getByTestId("listing-options")).getAllByTestId("listing-option");

    it("on one size's page: every size in order, this one marked, and the parent is not a size", async () => {
      recentMock.mockResolvedValue([parent, ...kids, mug]);
      render(<ListingRelated event={kids[0]} sellerName="Satoshoes" />);
      const row = await screen.findByTestId("listing-options");
      expect(row).toHaveTextContent("Size");
      expect(chips().map((c) => c.textContent)).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"]);
      const current = chips().filter((c) => c.getAttribute("aria-current") === "true");
      expect(current.map((c) => c.textContent)).toEqual(["6XL"]);
      // Each other size opens its own listing; the one being read is not a link to itself.
      expect(chips().filter((c) => c.tagName === "A")).toHaveLength(9);
      expect(row.textContent).not.toMatch(/Permissionless|Rules Without Rulers/);
      // The product is not also offered as one of the seller's other things.
      const more = screen.getByTestId("listing-more-from-seller");
      expect(more).toHaveTextContent("Mug");
      expect(more).not.toHaveTextContent("Hoodie");
    });

    it("on the product's own page: all ten sizes, none marked", async () => {
      recentMock.mockResolvedValue([parent, ...kids, mug]);
      render(<ListingRelated event={parent} sellerName="Satoshoes" />);
      await screen.findByTestId("listing-options");
      expect(chips()).toHaveLength(10);
      expect(chips().filter((c) => c.tagName === "A")).toHaveLength(10);
      expect(chips().some((c) => c.getAttribute("aria-current") === "true")).toBe(false);
    });

    it("asks for the family itself, so sizes beyond the seller's newest listings are still offered", async () => {
      recentMock.mockResolvedValue([kids[0], mug]);
      familyMock.mockResolvedValue([parent, ...kids]);
      render(<ListingRelated event={kids[0]} sellerName="Satoshoes" />);
      await screen.findByTestId("listing-options");
      expect(familyMock).toHaveBeenCalledWith(SELLER, P);
      expect(chips()).toHaveLength(10);
    });

    it("asks for no family for a listing that is not part of one", async () => {
      recentMock.mockResolvedValue([mug, listing(SELLER, "soap", "Soap", 400)]);
      render(<ListingRelated event={mug} sellerName="Satoshoes" />);
      await screen.findByTestId("listing-more-from-seller");
      expect(familyMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("listing-options")).toBeNull();
    });
  });
});
