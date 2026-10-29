// @vitest-environment jsdom
/**
 * A food and drink place on its own page, the tier-three way (ADR 0007):
 * the shape of a Google Places or Yelp page — name, what it is, open or
 * closed, the ways out, the details, who stands behind it — drawn from the
 * governing definition's fields, and whole whether the place is rich (Il
 * Sole) or sparse (El Sapo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
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
  PlaceMap: (p: { lat: number; lon: number; name: string; expanded?: boolean }) => (
    <div
      data-testid="place-map"
      data-lat={p.lat}
      data-lon={p.lon}
      data-name={p.name}
      data-expanded={String(!!p.expanded)}
    />
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
const network = vi.hoisted(() => ({
  endorsers: [] as { pubkey: string; at: number }[],
  endorse: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/useItemEngagement", () => ({
  useItemEngagement: () => ({ endorsers: network.endorsers, claimants: [], pending: false }),
  useEndorseItem: () => network.endorse,
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
    rating?: number | null;
    tags?: string[][];
  }[],
  post: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
  rating: null as null | { value: number; counted: number; lens: "you" | "curator" },
}));
vi.mock("@/hooks/usePlaceReviews", () => ({
  usePlaceReviews: () => ({ reviews: reviews.list, pending: false }),
  usePostPlaceReview: () => reviews.post,
  useRemovePlaceReview: () => reviews.remove,
  usePlaceRating: () => reviews.rating,
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.5 }));
vi.mock("@/hooks/useProfileMap", () => ({ useProfileMap: () => new Map() }));

import { PlaceView, placeOf, placePresentation } from "./PlaceView";

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

function Page({ event, house = houseCopy }: { event: typeof ilSole; house?: HeaderEvent }) {
  const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house });
  const view = useResolvedItemView(event, resolved);
  if (!isReady(view)) return <p>not ready</p>;
  return <PlaceView event={event} view={view} />;
}

beforeEach(() => {
  viewer.pubkey = null;
  network.endorsers = [];
  network.endorse.mutate.mockClear();
  reviews.list = [];
  reviews.post.mutate.mockClear();
  reviews.remove.mutate.mockClear();
  reviews.rating = null;
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
    // Where Google puts the stars: the trust line. With nothing to say of anyone, it says so of reviews.
    expect(screen.getByTestId("place-trust-line")).toHaveTextContent(/^No reviews yet$/);
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
    // Who recommends it is said beside the name, not in a section of its own.
    expect(screen.queryByTestId("place-verdict")).toBeNull();

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

  it("calls with tier two's tel: when the header types the phone, and reads an untyped one its own way", () => {
    // A three-digit line: tier two calls it once the header says it's a phone; the view's own
    // reading of an untyped value wants seven digits or more, so it doesn't.
    const shortLine = { ...ilSole, tags: ilSole.tags.map((t) => (t[0] === "phone" ? ["phone", "311"] : t)) };
    const typed = header(HOUSE, [...houseCopy.tags.slice(2), ["field-type", "phone", "tel"]]);
    const { unmount } = renderWithProviders(<Page event={shortLine} house={typed} />);
    expect(within(screen.getByTestId("place-actions")).getByRole("link", { name: "Call" })).toHaveAttribute(
      "href",
      "tel:311",
    );
    unmount();
    renderWithProviders(<Page event={shortLine} />);
    expect(within(screen.getByTestId("place-actions")).queryByRole("link", { name: "Call" })).toBeNull();
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
    expect(section).toHaveTextContent("People you trust first");
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

  it("a signed-in reader writes a review from five empty stars: the tap opens the composer with them", async () => {
    viewer.pubkey = "d".repeat(64);
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-reviews")).toHaveTextContent("No reviews yet");
    expect(screen.queryByTestId("place-review-composer")).toBeNull();
    const prompt = screen.getByTestId("place-review-prompt");
    expect(prompt).toHaveTextContent("Rate and review");
    await userEvent.click(within(prompt).getByRole("button", { name: "4 stars" }));
    const composer = screen.getByTestId("place-review-composer");
    expect(within(composer).getByRole("button", { name: "4 stars" })).toHaveAttribute("aria-pressed", "true");
    const post = within(composer).getByRole("button", { name: "Post review" });
    await userEvent.type(within(composer).getByRole("textbox"), "Best pizza on the key.");
    await userEvent.click(within(composer).getByRole("button", { name: "$$" }));
    await userEvent.click(within(composer).getByRole("button", { name: "Lightning" }));
    // A review of a place gives stars: words alone don't post.
    await userEvent.click(within(composer).getByRole("button", { name: "4 stars" }));
    expect(post).toBeDisabled();
    await userEvent.click(within(composer).getByRole("button", { name: "4 stars" }));
    expect(post).toBeEnabled();
    await userEvent.click(post);
    expect(reviews.post.mutate).toHaveBeenCalledWith(
      {
        draft: { text: "Best pizza on the key.", rating: 4, price: 2, paid: "lightning", photos: [] },
        previous: undefined,
      },
      expect.anything(),
    );
  });

  it("each review shows its stars", () => {
    reviews.list = [
      { id: "r1", pubkey: "a".repeat(64), at: 9, text: "Good.", photos: [], price: null, paid: null, rating: 4 },
      { id: "r2", pubkey: "b".repeat(64), at: 8, text: "No stars here.", photos: [], price: null, paid: null },
    ];
    renderWithProviders(<Page event={ilSole} />);
    const [first, second] = screen.getAllByTestId("place-review");
    expect(within(first).getByRole("img", { name: "4 out of 5 stars" })).toBeInTheDocument();
    expect(within(second).queryByRole("img", { name: /out of 5 stars/ })).toBeNull();
  });

  /** The reader's own review, as the relays hold it. */
  const mine = () => ({
    id: "m1",
    pubkey: "d".repeat(64),
    at: 7,
    text: "Okay.",
    photos: [],
    price: 1,
    paid: null,
    rating: 3,
    tags: [
      ["d", "place:x"],
      ["t", "brunch"],
    ],
  });

  it("a reader who has reviewed it changes that review: the composer opens with it, and never adds a second", async () => {
    viewer.pubkey = "d".repeat(64);
    reviews.list = [mine()];
    renderWithProviders(<Page event={ilSole} />);
    const prompt = screen.getByTestId("place-review-prompt");
    expect(prompt).toHaveTextContent("Your review");
    expect(within(prompt).getByRole("img", { name: "3 out of 5 stars" })).toBeInTheDocument();
    await userEvent.click(within(prompt).getByRole("button", { name: "Edit" }));
    const composer = screen.getByTestId("place-review-composer");
    expect(within(composer).getByRole("textbox")).toHaveValue("Okay.");
    expect(within(composer).getByRole("button", { name: "3 stars" })).toHaveAttribute("aria-pressed", "true");
    expect(within(composer).getByRole("button", { name: "$" })).toHaveAttribute("aria-pressed", "true");
    expect(within(composer).queryByRole("button", { name: "Post review" })).toBeNull();
    await userEvent.click(within(composer).getByRole("button", { name: "5 stars" }));
    await userEvent.click(within(composer).getByRole("button", { name: "Update review" }));
    expect(reviews.post.mutate).toHaveBeenCalledWith(
      { draft: { text: "Okay.", rating: 5, price: 1, paid: null, photos: [] }, previous: mine() },
      expect.anything(),
    );
  });

  it("a reader removes their review, after saying so on the review itself; nobody else's has the choice", async () => {
    viewer.pubkey = "d".repeat(64);
    reviews.list = [
      mine(),
      { id: "r2", pubkey: "b".repeat(64), at: 8, text: "Fine.", photos: [], price: null, paid: null, rating: 4 },
    ];
    renderWithProviders(<Page event={ilSole} />);
    const rows = screen.getAllByTestId("place-review");
    const own = rows.find((row) => row.textContent?.includes("Okay."))!;
    const other = rows.find((row) => row.textContent?.includes("Fine."))!;
    expect(within(other).queryByRole("button", { name: "Remove" })).toBeNull();
    await userEvent.click(within(own).getByRole("button", { name: "Remove" }));
    expect(reviews.remove.mutate).not.toHaveBeenCalled();
    expect(own).toHaveTextContent("Remove your review? Apps that read it will stop showing it.");
    await userEvent.click(within(own).getByRole("button", { name: "Remove review" }));
    expect(reviews.remove.mutate).toHaveBeenCalledWith(mine());
  });

  /** The picture arrives with its true size: a square logo, or a wide link-preview banner. */
  const loads = (img: HTMLElement, width: number, height: number) => {
    Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
    fireEvent.load(img);
  };

  it("the map is the hero even when the site gives a picture; a square one — a logo — is a small tile in the panel beside the name", () => {
    site.card = { image: "https://www.ilsolefood.com/logo.png", siteName: "Il Sole" };
    renderWithProviders(<Page event={ilSole} />);
    // One map, the hero; never a second one under a photo band.
    expect(screen.getAllByTestId("place-map")).toHaveLength(1);
    const hero = screen.getByTestId("place-hero");
    expect(within(hero).getByTestId("place-map")).toBeInTheDocument();
    const panel = within(hero).getByTestId("place-identity");
    const photo = within(panel).getByTestId("place-photo");
    expect(photo.getAttribute("src")).toContain("ilsolefood.com/logo.png");
    // Unseen until it has loaded and proved square-ish; then a tile the height of the name, never a banner.
    expect(photo).toHaveAttribute("data-shown", "false");
    loads(photo, 400, 380);
    expect(photo).toHaveAttribute("data-shown", "true");
    expect(photo.className).toMatch(/h-14/);
    expect(photo.className).not.toMatch(/w-full/);
    // At the right end of the name's row, as a logo sits on a letterhead — the name leads.
    const name = within(panel).getByTestId("place-name");
    expect(name.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photo.parentElement).toBe(name.parentElement);
    expect(photo.className).toMatch(/ml-auto/);
  });

  it("Expand opens the map up in place — taller, the panel folded to a name pill — and Shrink brings the page back", async () => {
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByTestId("place-identity-pill")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Expand the map" }));
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-expanded", "true");
    const pill = screen.getByTestId("place-identity-pill");
    expect(pill).toHaveTextContent("Il Sole Italian Food");
    expect(screen.getByTestId("place-identity")).toHaveAttribute("data-folded", "true");
    await userEvent.click(within(pill).getByRole("button", { name: "Shrink the map" }));
    expect(screen.getByTestId("place-map")).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByTestId("place-identity-pill")).toBeNull();
    expect(screen.getByTestId("place-identity")).not.toHaveAttribute("data-folded");
  });

  it("Accepts Bitcoin is a detail among the details — a Location row under the website — not a badge in the panel", () => {
    renderWithProviders(<Page event={ilSole} />);
    const details = screen.getByTestId("place-details");
    const bitcoin = within(details).getByTestId("place-bitcoin");
    expect(bitcoin).toHaveTextContent("Accepts Bitcoin · Lightning");
    const website = within(details).getByTestId("place-website");
    expect(website.compareDocumentPosition(bitcoin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByTestId("place-identity")).queryByTestId("place-bitcoin")).toBeNull();
  });

  it("a wide picture — a link-preview banner — is not shown at all: cropped square it would be a slice of lettering", () => {
    site.card = { image: "https://www.ilsolefood.com/og.jpg", siteName: "Il Sole" };
    renderWithProviders(<Page event={ilSole} />);
    const photo = screen.getByTestId("place-photo");
    loads(photo, 1200, 630);
    expect(photo).toHaveAttribute("data-shown", "false");
    expect(photo).not.toBeVisible();
  });

  it("the trust line: who the reader trusts recommends it, with their faces, then the reviews and the price", () => {
    viewer.pubkey = "d".repeat(64);
    network.endorsers = [{ pubkey: "a".repeat(64), at: 9 }];
    reviews.list = [{ id: "r1", pubkey: "b".repeat(64), at: 8, text: "Fine.", photos: [], price: 2, paid: null }];
    renderWithProviders(<Page event={ilSole} />);
    const line = screen.getByTestId("place-trust-line");
    expect(line).toHaveTextContent("Recommended by 1 person you trust · 1 review · $$");
    expect(within(line).getByRole("link", { name: "1 review" })).toHaveAttribute("href", "#place-reviews");
    expect(screen.getByTestId("place-recommenders").querySelectorAll("[data-face]")).toHaveLength(1);
  });

  it("a star value through the curator's lens leads the trust line and the reviews, and says whose lens it is", () => {
    reviews.list = [
      { id: "r1", pubkey: "a".repeat(64), at: 9, text: "Good beer.", photos: [], price: null, paid: null, rating: 4 },
    ];
    reviews.rating = { value: 4, counted: 1, lens: "curator" };
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-trust-line")).toHaveTextContent(/^★ 4\.0 · 1 review$/);
    const summary = screen.getByTestId("place-rating");
    expect(summary).toHaveTextContent("4.0");
    expect(within(summary).getByRole("img", { name: "4 out of 5 stars" })).toBeInTheDocument();
    expect(summary).toHaveTextContent("From 1 person trusted by the list's curator");
  });

  it("through the reader's own lens, the summary says so", () => {
    viewer.pubkey = "d".repeat(64);
    reviews.rating = { value: 4.5, counted: 2, lens: "you" };
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-rating")).toHaveTextContent("4.5");
    expect(screen.getByTestId("place-rating")).toHaveTextContent("From 2 people you trust");
  });

  it("the trust line with no one to name says only what the reviews say", () => {
    reviews.list = [
      { id: "r1", pubkey: "a".repeat(64), at: 9, text: "Good.", photos: [], price: null, paid: null },
      { id: "r2", pubkey: "b".repeat(64), at: 8, text: "Fine.", photos: [], price: null, paid: null },
    ];
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByTestId("place-trust-line")).toHaveTextContent(/^2 reviews$/);
    expect(screen.queryByTestId("place-recommenders")).toBeNull();
    // Nobody inside a lens gave stars: no number, rather than a misleading one.
    expect(screen.queryByTestId("place-rating")).toBeNull();
  });

  it("a signed-in reader recommends it from the action row, in one tap", async () => {
    viewer.pubkey = "d".repeat(64);
    renderWithProviders(<Page event={ilSole} />);
    const actions = screen.getByTestId("place-actions");
    await userEvent.click(within(actions).getByRole("button", { name: "Recommend" }));
    expect(network.endorse.mutate).toHaveBeenCalled();
  });

  it("a reader who recommended it sees so, and a visitor has nothing to press", () => {
    viewer.pubkey = "d".repeat(64);
    network.endorsers = [{ pubkey: "d".repeat(64), at: 9 }];
    const { unmount } = renderWithProviders(<Page event={ilSole} />);
    expect(within(screen.getByTestId("place-actions")).getByRole("button", { name: "Recommended" })).toBeDisabled();
    unmount();
    viewer.pubkey = null;
    renderWithProviders(<Page event={ilSole} />);
    expect(within(screen.getByTestId("place-actions")).queryByRole("button", { name: /Recommend/ })).toBeNull();
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

  it("the action row invites a review, and the invitation opens the composer", async () => {
    viewer.pubkey = "d".repeat(64);
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.queryByTestId("place-review-composer")).toBeNull();
    const review = within(screen.getByTestId("place-actions")).getByRole("link", { name: "Review" });
    await userEvent.click(review);
    expect(within(screen.getByTestId("place-review-composer")).getByRole("textbox")).toHaveFocus();
  });
});

// How a place reads among many (ADR 0007): a results row, a card, a tile — its name, then what
// it is and where, the way a map app lists one. Not the street address: that's the page's.
describe("placePresentation", () => {
  const definition = () => resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy })!.governing;

  it("reads a place by its name, then its kind, its cuisine and its town", () => {
    const shown = placePresentation(ilSole, definition(), { title: null, summary: "123 Main St" } as never);
    expect(shown.title).toBe("Il Sole Italian Food");
    expect(shown.summary).toBe("Restaurant · Italian · Sarasota");
  });

  it("leaves an item that isn't a place as the hints read it", () => {
    const shown = { title: "As is", summary: "hints" } as never;
    expect(placePresentation({ tags: [] }, definition(), shown)).toBe(shown);
  });
});
