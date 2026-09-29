import { describe, it, expect } from "vitest";
import { parseListing, isSellable, formatListingPrice, listingCardLine } from "./listing";

// NIP-99 as the marketplaces publish it (probed 2026-09-04: Shopstr,
// Barattolo, bitpopart, Conduit): title, price [amount, currency], images,
// summary, location, status, categories in `t`, the shop page in `r`.
const ev = (tags: string[][], content = "", kind = 30402) => ({
  id: "l1",
  pubkey: "a".repeat(64),
  kind,
  created_at: 1_700_000_000,
  tags,
  content,
});

describe("parseListing — a marketplace listing for a buyer", () => {
  it("reads title, price, photos, summary, location, categories and the shop link", () => {
    const l = parseListing(
      ev(
        [
          ["d", "maglia-1"],
          ["title", "Maglia in kashmir donna"],
          ["summary", "Maglia in kashmir, taglia M"],
          ["price", "23550", "sats"],
          ["image", "https://img/1.jpg"],
          ["image", "https://img/2.jpg"],
          ["location", "Gubbio (PG)"],
          ["status", "active"],
          ["t", "abbigliamento"],
          ["t", "kashmir"],
          ["r", "https://barattolo.app/l/maglia-1"],
          ["shipping_option", "Italia", "500", "sats"],
        ],
        "Maglia in kashmir donna, come nuova.",
      ),
    );
    expect(l).toMatchObject({
      id: "l1",
      title: "Maglia in kashmir donna",
      summary: "Maglia in kashmir, taglia M",
      price: { amount: 23550, currency: "SATS" },
      images: ["https://img/1.jpg", "https://img/2.jpg"],
      location: "Gubbio (PG)",
      status: "active",
      categories: ["abbigliamento", "kashmir"],
      shopUrl: "https://barattolo.app/l/maglia-1",
      description: "Maglia in kashmir donna, come nuova.",
    });
  });

  it("an app's own name is provenance, not a category", () => {
    const l = parseListing(
      ev([
        ["title", "Mug"],
        ["price", "12", "USD"],
        ["t", "shopstr"],
        ["t", "mugs"],
      ]),
    );
    expect(l?.categories).toEqual(["mugs"]);
  });

  it("needs a title; without a price it still parses, but is not sellable", () => {
    expect(parseListing(ev([["price", "10", "USD"]]))).toBeNull();
    const noPrice = parseListing(
      ev([
        ["title", "Obscura VPN"],
        ["summary", "Can't log VPN provider."],
      ]),
    );
    expect(noPrice?.title).toBe("Obscura VPN");
    expect(noPrice?.price).toBeNull();
    expect(isSellable(noPrice!)).toBe(false);
    expect(
      parseListing(
        ev([
          ["title", "x"],
          ["price", "abc", "USD"],
        ]),
      )?.price,
    ).toBeNull();
  });

  it("no status means active — 40% of live stock carries none", () => {
    const l = parseListing(
      ev([
        ["title", "Mug"],
        ["price", "12", "USD"],
      ]),
    );
    expect(l?.status).toBe("active");
    expect(isSellable(l!)).toBe(true);
  });

  it("sold and hidden listings are not for sale", () => {
    expect(
      isSellable(
        parseListing(
          ev([
            ["title", "Mug"],
            ["price", "12", "USD"],
            ["status", "sold"],
          ]),
        )!,
      ),
    ).toBe(false);
    expect(
      isSellable(
        parseListing(
          ev([
            ["title", "Mug"],
            ["price", "12", "USD"],
            ["visibility", "hidden"],
          ]),
        )!,
      ),
    ).toBe(false);
  });
});

describe("formatListingPrice — shown exactly as priced, never converted", () => {
  it("sats read as sats, fiat as its own currency", () => {
    expect(formatListingPrice({ amount: 23550, currency: "SATS" })).toBe("23,550 sats");
    expect(formatListingPrice({ amount: 1, currency: "SAT" })).toBe("1 sat");
    expect(formatListingPrice({ amount: 12, currency: "USD" })).toBe("$12");
    expect(formatListingPrice({ amount: 15, currency: "EUR" })).toBe("€15");
    expect(formatListingPrice({ amount: 14.5, currency: "CHF" })).toMatch(/14\.50/);
    expect(formatListingPrice({ amount: 0.0021, currency: "BTC" })).toBe("0.0021 BTC");
    expect(formatListingPrice({ amount: 8, currency: "USDC" })).toBe("8 USDC");
  });

  // Benjamin, over a "$0" pill on the Shop tab: a zero reads as a mistake.
  // The seller wrote a number, and the number means free.
  it("a price of zero reads as Free, whatever the currency", () => {
    expect(formatListingPrice({ amount: 0, currency: "USD" })).toBe("Free");
    expect(formatListingPrice({ amount: 0, currency: "SATS" })).toBe("Free");
    expect(formatListingPrice({ amount: 0, currency: "EUR", frequency: "month" })).toBe("Free");
  });

  it("names the cadence when a price recurs", () => {
    expect(formatListingPrice({ amount: 5, currency: "USD", frequency: "month" })).toBe("$5 / month");
  });
});

describe("listingCardLine — one quiet line: where it is, what shipping costs", () => {
  const base = {
    id: "l1",
    pubkey: "a".repeat(64),
    d: "l1",
    title: "Mug",
    summary: "A summary",
    description: "",
    price: { amount: 12, currency: "USD" },
    images: [],
    location: null as string | null,
    status: "active",
    hidden: false,
    categories: [],
    shopUrl: null,
    shipping: [] as { name: string; amount: number; currency: string }[],
    createdAt: 0,
  };

  it("country and shipping, when both are known", () => {
    expect(
      listingCardLine({
        ...base,
        location: "Gubbio (PG)",
        shipping: [{ name: "Italia", amount: 500, currency: "SATS" }],
      }),
    ).toBe("Gubbio (PG) · 500 sats shipping");
  });

  it("free shipping is the good news, said plainly", () => {
    expect(
      listingCardLine({
        ...base,
        location: "United States",
        shipping: [
          { name: "US", amount: 0, currency: "USD" },
          { name: "World", amount: 20, currency: "USD" },
        ],
      }),
    ).toBe("United States · Free shipping");
  });

  it("several paid options say where the price starts", () => {
    expect(
      listingCardLine({
        ...base,
        shipping: [
          { name: "Italia", amount: 500, currency: "SATS" },
          { name: "Europa", amount: 1500, currency: "SATS" },
        ],
      }),
    ).toBe("Shipping from 500 sats");
  });

  it("shipping priced in no money of its own borrows the listing's", () => {
    expect(listingCardLine({ ...base, shipping: [{ name: "US", amount: 5, currency: "" }] })).toBe("$5 shipping");
  });

  it("one part alone, and the summary when neither is known", () => {
    expect(listingCardLine({ ...base, location: "Austin, TX" })).toBe("Austin, TX");
    expect(listingCardLine(base)).toBe("A summary");
    expect(listingCardLine({ ...base, summary: null })).toBeNull();
  });
});

describe("parseListing — NIP-15 products and auctions sell beside NIP-99", () => {
  it("reads a kind-30018 product from its JSON content (staging, 2026-09-29)", () => {
    const l = parseListing(
      ev(
        [["d", "8pGXtKyBCp4em8XEEq6uvL"]],
        JSON.stringify({
          id: "8pGXtKyBCp4em8XEEq6uvL",
          stall_id: "B2Ho2LPPWoqUthAc5XAqpW",
          name: "Riding Peas",
          description: "Livingroom art by BKBoom",
          images: ["https://img/peas.jpg", 7],
          currency: "sat",
          price: 21000,
          quantity: 1,
          shipping: [{ id: "online", cost: 0 }],
        }),
        30018,
      ),
    );
    expect(l).toMatchObject({
      title: "Riding Peas",
      description: "Livingroom art by BKBoom",
      price: { amount: 21000, currency: "SAT" },
      images: ["https://img/peas.jpg"],
      status: "active",
      shipping: [{ name: "online", amount: 0, currency: "SAT" }],
    });
    expect(isSellable(l!)).toBe(true);
    expect(listingCardLine(l!)).toBe("Free shipping");
  });

  it("marks a product with no stock left as sold", () => {
    const l = parseListing(
      ev([], JSON.stringify({ name: "Funny Tukan", currency: "sat", price: 5000, quantity: 0 }), 30018),
    );
    expect(l?.status).toBe("sold");
    expect(isSellable(l!)).toBe(false);
  });

  it("refuses a 30018 whose content is not a named product", () => {
    expect(parseListing(ev([], "not json", 30018))).toBeNull();
    expect(parseListing(ev([], JSON.stringify({ price: 1 }), 30018))).toBeNull();
  });

  it("reads a kind-30020 auction at its opening price, sellable until it ends", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const tags = [
      ["d", "roatan-2"],
      ["title", "Roatan 2"],
      ["summary", "Digital Art"],
      ["image", "https://img/roatan.jpg"],
      ["start_price", "1000"],
      ["currency", "sats"],
      ["end_time", String(future)],
    ];
    const open = parseListing(ev(tags, "Digital Art", 30020));
    expect(open).toMatchObject({ title: "Roatan 2", price: { amount: 1000, currency: "SATS" }, status: "active" });
    expect(isSellable(open!)).toBe(true);
    const ended = parseListing(
      ev(
        tags.map((t) => (t[0] === "end_time" ? ["end_time", "1777240053"] : t)),
        "",
        30020,
      ),
    );
    expect(ended?.status).toBe("ended");
    expect(isSellable(ended!)).toBe(false);
  });
});
