// @vitest-environment jsdom
/**
 * A food and drink place on its own page, the tier-three way (ADR 0007):
 * the shape of a Google Places or Yelp page — name, what it is, open or
 * closed, the ways out, the details, who stands behind it — drawn from the
 * governing definition's fields, and whole whether the place is rich (Il
 * Sole) or sparse (El Sapo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import { useResolvedItemView, isReady } from "@/hooks/useItemView";

const { COMMUNITY, TEMPLATE_ID } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places",
  TEMPLATE_ID: "8846baa4be1d8bc17529a4079525b8ecb019f52a0655bd20ae547903b72bd5ed",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const HOUSE = "3".repeat(64);

const viewer = vi.hoisted(() => ({ isAdmin: false, pubkey: null as string | null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (viewer.pubkey ? { isAdmin: viewer.isAdmin, pubkey: viewer.pubkey } : null),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({
    data: new Map([
      [
        TEMPLATE_ID,
        {
          id: TEMPLATE_ID,
          pubkey: "2".repeat(64),
          name: "BTC Map place",
          template: "https://btcmap.org/merchant/{id}",
        },
      ],
    ]),
  }),
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));
// What the place's website says about itself (hooks/useSiteCard): nothing unless a test says so.
const site = vi.hoisted(() => ({ card: null as null | { image: string | null; siteName: string | null } }));
vi.mock("@/hooks/useSiteCard", () => ({ useSiteCard: () => site.card }));
// The map is Leaflet in a browser; here, what it was handed.
vi.mock("@/components/items/PlaceMap", () => ({
  PlaceMap: (p: { lat: number; lon: number; name: string }) => (
    <div data-testid="place-map" data-lat={p.lat} data-lon={p.lon} data-name={p.name} />
  ),
}));
// The list's other places (components/dictionary/DListItemNeighbours useListItems): what the reader's web of trust holds.
const list = vi.hoisted(() => ({
  items: [] as {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    content: string;
    tags: string[][];
    sig: string;
  }[],
}));
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
  useListItems: () => ({ items: list.items, pending: false }),
}));
const network = vi.hoisted(() => ({ endorsers: [] as { pubkey: string; at: number }[] }));
vi.mock("@/hooks/useItemEngagement", () => ({
  useItemEngagement: () => ({ endorsers: network.endorsers, claimants: [], pending: false }),
  useEndorseItem: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWotItems", () => ({
  useWotItems: (items: { pubkey: string }[]) => ({
    trusted: [],
    outside: items,
    pending: false,
    source: "house",
    observer: "house",
  }),
}));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: new Set<string>(), ready: true, signedIn: false }),
}));
// Reviews of the place (hooks/usePlaceReviews): what the relays hold, and the post the reader signs.
const reviews = vi.hoisted(() => ({
  list: [] as {
    id: string;
    pubkey: string;
    at: number;
    text: string;
    photos: string[];
    price: number | null;
    paid: string | null;
  }[],
  post: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/usePlaceReviews", () => ({
  usePlaceReviews: () => ({ reviews: reviews.list, pending: false }),
  usePostPlaceReview: () => reviews.post,
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.5 }));
vi.mock("@/hooks/useProfileMap", () => ({ useProfileMap: () => new Map() }));

import { PlaceView, placeOf } from "./PlaceView";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "food-and-drink-places"], ["names", "Food and Drink Place", "Food and Drink Places"], ...tags],
});
const FIELDS: string[][] = [
  ["required", "name", "Name of the business"],
  ["required", "category", "Kind of place"],
  ["optional", "address", "Street address, one line"],
  ["optional", "locality", "City or town"],
  ["optional", "cuisine", "Primary cuisine"],
  ["optional", "osm-id"],
  ["optional", "g", "Geohash of the location"],
  ["optional", "description"],
  ["optional", "country", "ISO 3166-1 two-letter code"],
  ["optional", "region"],
  ["optional", "postal-code"],
  ["optional", "lat"],
  ["optional", "lon"],
  ["optional", "website", "Website"],
  ["field-type", "website", "url"],
  ["optional", "image", "A photo"],
  ["field-type", "image", "url"],
  ["optional", "phone", "Phone number, international format"],
  ["optional", "opening-hours", "Opening hours, in OpenStreetMap syntax"],
  ["optional", "accepts-bitcoin"],
  ["optional", "btcmap-id"],
  ["optional", "source"],
  ["optional", "license"],
  ["optional", "price-range"],
  ["optional", "menu"],
  ["field-type", "menu", "url"],
  ["optional", "reservations"],
  ["field-type", "reservations", "url"],
];
const community = header(AVI, FIELDS);
// The house copy as published on staging: hints, the list's image, the BTC Map template.
const houseCopy = header(HOUSE, [
  ...FIELDS,
  ["display", "title", "name"],
  ["display", "summary", "address"],
  ["display", "image", "image"],
  ["display", "link", "website"],
  ["display", "location", "g"],
  ["display", "fact", "cuisine"],
  ["display", "fact", "phone"],
  ["display", "fact", "opening-hours", "Hours"],
  ["display", "fact", "accepts-bitcoin", "Bitcoin?"],
  ["image", "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/1f37d.svg"],
  ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "id", "btcmap-id"],
  ["b", COMMUNITY, "pointer"],
]);

const ilSole = {
  id: "1".repeat(64),
  pubkey: "4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64",
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", "osm-node-13302615652"],
    ["z", COMMUNITY],
    ["name", "Il Sole Italian Food"],
    ["category", "restaurant"],
    ["address", "6519 Midnight Pass Road Sarasota 34242"],
    ["locality", "Sarasota"],
    ["region", "FL"],
    ["postal-code", "34242"],
    ["country", "US"],
    ["cuisine", "italian"],
    ["osm-id", "node:13302615652"],
    ["lat", "27.2508994"],
    ["lon", "-82.5343946"],
    ["website", "https://www.ilsolefood.com/"],
    ["phone", "+1 346 493 2858"],
    ["opening-hours", "Th 17:00-23:00; Fr 17:00-00:00; Su 13:00-19:00"],
    ["accepts-bitcoin", "lightning"],
    ["btcmap-id", "30083"],
    ["source", "btcmap"],
    ["license", "ODbL-1.0"],
    ["g", "dhv71bu7c"],
    ["g", "dhv71b"],
  ],
};
const elSapo = {
  id: "2".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", "osm-node-3954396519"],
    ["z", COMMUNITY],
    ["name", "El Sapo"],
    ["category", "fast_food"],
    ["country", "CR"],
    ["cuisine", "pizza"],
    ["osm-id", "node:3954396519"],
    ["lat", "10.2875153"],
    ["lon", "-85.8505374"],
    ["accepts-bitcoin", "both"],
    ["btcmap-id", "25098"],
    ["source", "btcmap"],
    ["license", "ODbL-1.0"],
    ["g", "d1ffw2v91"],
  ],
};

function Page({ event }: { event: typeof ilSole }) {
  const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy });
  const view = useResolvedItemView(event, resolved);
  if (!isReady(view)) return <p>not ready</p>;
  return <PlaceView event={event} view={view} />;
}

beforeEach(() => {
  viewer.pubkey = null;
  network.endorsers = [];
  reviews.list = [];
  reviews.post.mutate.mockClear();
  site.card = null;
  list.items = [];
  // Thursday 2026-10-15, 23:30 UTC: 18:30 in Sarasota by the longitude estimate (UTC−5), when Il Sole is open.
  vi.useFakeTimers({ now: new Date("2026-10-15T23:30:00Z"), toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("PlaceView", () => {
  it("a full place: name, what it is, open now, the ways out, the details, the attribution", async () => {
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Il Sole Italian Food");
    expect(screen.getByTestId("place-kind")).toHaveTextContent("Restaurant · Italian");
    expect(screen.getByTestId("place-open-status")).toHaveTextContent("Open now · until 11:00 PM");
    // Where Google puts the stars: the trust line, both halves linking down.
    // A visitor who isn't signed in has no "you": the line speaks of vouches, not of their trust.
    expect(screen.getByTestId("place-trust-line")).toHaveTextContent("No vouches yet · No reviews yet");
    expect(screen.getByTestId("place-trust-line")).not.toHaveTextContent(
      "No one you trust has vouched for it yet · No reviews yet",
    );
    // No logo circle beside the name: the kind-of-place glyph marks the kind line, the site's favicon sits by its website.
    expect(screen.queryByTestId("place-logo")).toBeNull();
    expect(screen.getByTestId("place-kind").querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("place-website").querySelector("img")?.getAttribute("src")).toContain(
      "ilsolefood.com/favicon.ico",
    );
    expect(screen.getByTestId("place-bitcoin")).toHaveTextContent("Accepts Bitcoin · Lightning");

    const actions = screen.getByTestId("place-actions");
    expect(within(actions).getByRole("link", { name: "Directions" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=27.2508994%2C-82.5343946",
    );
    expect(within(actions).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+13464932858");
    expect(within(actions).getByRole("link", { name: "Website" })).toHaveAttribute(
      "href",
      "https://www.ilsolefood.com/",
    );
    // The listing it came from is provenance, not an action: a line by the attribution, not a button.
    expect(within(actions).queryByRole("link", { name: "Map" })).toBeNull();
    expect(screen.getByTestId("place-listing").querySelector("a")).toHaveAttribute(
      "href",
      "https://btcmap.org/merchant/30083",
    );
    expect(screen.getByTestId("place-listing")).toHaveTextContent("BTC Map");

    const details = screen.getByTestId("place-details");
    // The address as it would be written on an envelope: the street, the city line, then the country, muted.
    const addr = within(details).getByTestId("place-address");
    expect(within(addr).getByTestId("place-address-street")).toHaveTextContent(/^6519 Midnight Pass Road$/);
    expect(within(addr).getByTestId("place-address-city")).toHaveTextContent(/^Sarasota, FL 34242$/);
    expect(within(addr).getByTestId("place-address-country")).toHaveTextContent(/^United States$/);
    expect(addr.querySelector("a")).toHaveAttribute("href", expect.stringContaining("google.com/maps/dir"));
    expect(within(details).getByTestId("place-hours")).toHaveTextContent(/Thursday\s*5:00 PM–11:00 PM/);
    expect(within(details).getByTestId("place-phone")).toHaveTextContent("+1 346 493 2858");
    expect(within(details).getByTestId("place-website")).toHaveTextContent("ilsolefood.com");
    expect(screen.getByTestId("place-attribution")).toHaveTextContent("OpenStreetMap contributors");
    // The map is shown outright, at the place.
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-lat", "27.2508994");
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-lon", "-82.5343946");
    expect(screen.getByTestId("place-verdict")).toHaveTextContent("Who stands behind it");

    // The week in view, today first and bold, closed days said.
    const week = within(details).getByTestId("place-week");
    const rows = within(week).getAllByRole("row");
    expect(rows[0]).toHaveTextContent(/Thursday\s*5:00 PM–11:00 PM/);
    expect(rows[0]).toHaveAttribute("data-today", "true");
    expect(rows[1]).toHaveTextContent(/Friday\s*5:00 PM–12:00 AM/);
    expect(rows[2]).toHaveTextContent(/Saturday\s*Closed/);
  });

  it("a sparse place still reads whole: no hours badge, no call, the country in place of an address", () => {
    renderWithProviders(<Page event={elSapo} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("El Sapo");
    expect(screen.getByTestId("place-kind")).toHaveTextContent("Fast food · Pizza");
    expect(screen.queryByTestId("place-open-status")).toBeNull();
    expect(screen.getByTestId("place-bitcoin")).toHaveTextContent("Accepts Bitcoin · Lightning and on-chain");
    // No website: the kind of place still has its glyph, and the map is there.
    expect(screen.queryByTestId("place-logo")).toBeNull();
    expect(screen.getByTestId("place-kind").querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("place-map")).toBeInTheDocument();
    expect(screen.queryByTestId("place-photo")).toBeNull();
    const actions = screen.getByTestId("place-actions");
    expect(within(actions).getByRole("link", { name: "Directions" })).toBeInTheDocument();
    expect(within(actions).queryByRole("link", { name: "Call" })).toBeNull();
    expect(within(actions).queryByRole("link", { name: "Website" })).toBeNull();
    const details = screen.getByTestId("place-details");
    expect(within(details).queryByTestId("place-address")).toBeNull();
    expect(within(details).getByTestId("place-country")).toHaveTextContent("Costa Rica");
    expect(within(details).queryByTestId("place-hours")).toBeNull();
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-name", "El Sapo");
  });

  it("applies only when the definition declares a name and the item has one", () => {
    const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy })!;
    expect(placeOf(ilSole, resolved.governing)?.name).toBe("Il Sole Italian Food");
    expect(placeOf({ ...ilSole, tags: ilSole.tags.filter((t) => t[0] !== "name") }, resolved.governing)).toBeNull();
  });

  it("reviews by people, with their photos, price and payment summed up; nothing to post for a visitor", () => {
    reviews.list = [
      {
        id: "r1",
        pubkey: "a".repeat(64),
        at: 9,
        text: "Best pizza on the key.",
        photos: ["https://img.example/pie.jpg"],
        price: 2,
        paid: "lightning",
      },
      { id: "r2", pubkey: "b".repeat(64), at: 8, text: "Slow on Fridays.", photos: [], price: 2, paid: "card" },
    ];
    renderWithProviders(<Page event={ilSole} />);
    const section = screen.getByTestId("place-reviews");
    expect(section).toHaveTextContent("Reviews · 2");
    const rows = within(section).getAllByTestId("place-review");
    expect(rows).toHaveLength(2);
    expect(section).toHaveTextContent("Best pizza on the key.");
    expect(section).toHaveTextContent("Slow on Fridays.");
    expect(section.querySelector('img[src*="img.example"]')).not.toBeNull();
    // The photos reviewers added, as the page's pictures under the map.
    expect(screen.getByTestId("place-photos").querySelectorAll("img")).toHaveLength(1);
    // What the list lacks, from the reviews.
    expect(screen.getByTestId("place-price")).toHaveTextContent("$$ · from 2 reviews");
    expect(screen.getByTestId("place-paid")).toHaveTextContent("Lightning · 1");
    expect(screen.getByTestId("place-paid")).toHaveTextContent("Card · 1");
    expect(screen.queryByTestId("place-review-composer")).toBeNull();
  });

  it("a signed-in reader writes a review: words, a price, how they paid; it posts as one signed comment", async () => {
    viewer.pubkey = "d".repeat(64);
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-reviews")).toHaveTextContent("No reviews yet");
    const composer = screen.getByTestId("place-review-composer");
    const post = within(composer).getByRole("button", { name: "Post review" });
    expect(post).toBeDisabled();
    await userEvent.type(within(composer).getByRole("textbox"), "Best pizza on the key.");
    await userEvent.click(within(composer).getByRole("button", { name: "$$" }));
    await userEvent.click(within(composer).getByRole("button", { name: "Lightning" }));
    expect(post).toBeEnabled();
    await userEvent.click(post);
    expect(reviews.post.mutate).toHaveBeenCalledWith(
      { text: "Best pizza on the key.", price: 2, paid: "lightning", photos: [] },
      expect.anything(),
    );
  });

  it("the website's picture joins the map column when the site gives one", () => {
    site.card = { image: "https://www.ilsolefood.com/og.jpg", siteName: "Il Sole" };
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-photo").getAttribute("src")).toContain("ilsolefood.com/og.jpg");
    expect(screen.getByTestId("place-map")).toBeInTheDocument();
  });

  it("the trust line counts the vouches from people the reader trusts and the reviews", () => {
    viewer.pubkey = "d".repeat(64);
    network.endorsers = [{ pubkey: "a".repeat(64), at: 9 }];
    reviews.list = [{ id: "r1", pubkey: "b".repeat(64), at: 8, text: "Fine.", photos: [], price: null, paid: null }];
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-trust-line")).toHaveTextContent("Vouched for by 1 person you trust · 1 review");
  });

  it("the nearest places from the list, by distance, the place itself left out", () => {
    const at = (id: string, name: string, lat: string, lon: string) => ({
      id: id.repeat(64),
      kind: 39999,
      pubkey: AVI,
      created_at: 1,
      content: "",
      sig: "",
      tags: [
        ["d", `osm-${id}`],
        ["z", COMMUNITY],
        ["name", name],
        ["category", "cafe"],
        ["lat", lat],
        ["lon", lon],
      ],
    });
    list.items = [
      ilSole as never,
      at("3", "Far Away Cafe", "27.9", "-82.5"),
      at("4", "Next Door Bakery", "27.2515", "-82.5340"),
      at("5", "Across Town Bar", "27.33", "-82.53"),
      at("6", "Other Island Deli", "27.26", "-82.52"),
    ];
    renderWithProviders(<Page event={ilSole} />);
    const nearby = screen.getByTestId("place-nearby");
    const names = within(nearby)
      .getAllByTestId("place-nearby-item")
      .map((el) => el.textContent ?? "");
    expect(names).toHaveLength(3);
    expect(names[0]).toContain("Next Door Bakery");
    expect(names[1]).toContain("Other Island Deli");
    expect(names[2]).toContain("Across Town Bar");
    expect(names[0]).toMatch(/\d+ m|\d\.\d (km|mi)/);
    expect(nearby).not.toHaveTextContent("Il Sole");
  });

  it("the action row invites a review, and the invitation lands in the composer", async () => {
    viewer.pubkey = "d".repeat(64);
    renderWithProviders(<Page event={ilSole} />);
    const review = within(screen.getByTestId("place-actions")).getByRole("link", { name: "Review" });
    await userEvent.click(review);
    expect(within(screen.getByTestId("place-review-composer")).getByRole("textbox")).toHaveFocus();
  });
});
