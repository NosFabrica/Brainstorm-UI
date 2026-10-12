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
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
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
  // Thursday 2026-10-15, 23:30 UTC: 18:30 in Sarasota by the longitude estimate (UTC−5), when Il Sole is open.
  vi.useFakeTimers({ now: new Date("2026-10-15T23:30:00Z"), toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("PlaceView", () => {
  it("a full place: name, what it is, open now, the ways out, the details, the attribution", async () => {
    renderWithProviders(<Page event={ilSole} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Il Sole Italian Food");
    expect(screen.getByTestId("place-kind")).toHaveTextContent("Restaurant · Italian");
    expect(screen.getByTestId("place-open-status")).toHaveTextContent("Open now · until 23:00");
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
    expect(within(actions).getByRole("link", { name: "BTC Map" })).toHaveAttribute(
      "href",
      "https://btcmap.org/merchant/30083",
    );

    const details = screen.getByTestId("place-details");
    expect(within(details).getByTestId("place-address")).toHaveTextContent("6519 Midnight Pass Road Sarasota 34242");
    expect(within(details).getByTestId("place-hours")).toHaveTextContent("Thursday 17:00–23:00");
    expect(within(details).getByTestId("place-phone")).toHaveTextContent("+1 346 493 2858");
    expect(within(details).getByTestId("place-website")).toHaveTextContent("ilsolefood.com");
    expect(screen.getByTestId("place-attribution")).toHaveTextContent("OpenStreetMap contributors");
    expect(screen.getByTestId("place-verdict")).toHaveTextContent("Who stands behind it");

    // The week unfolds on tap, today first and bold, closed days said.
    await userEvent.click(within(details).getByTestId("place-hours-toggle"));
    const week = within(details).getByTestId("place-week");
    const rows = within(week).getAllByRole("row");
    expect(rows[0]).toHaveTextContent(/Thursday\s*17:00–23:00/);
    expect(rows[0]).toHaveAttribute("data-today", "true");
    expect(rows[1]).toHaveTextContent(/Friday\s*17:00–00:00/);
    expect(rows[2]).toHaveTextContent(/Saturday\s*Closed/);
  });

  it("a sparse place still reads whole: no hours badge, no call, the country in place of an address", () => {
    renderWithProviders(<Page event={elSapo} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("El Sapo");
    expect(screen.getByTestId("place-kind")).toHaveTextContent("Fast food · Pizza");
    expect(screen.queryByTestId("place-open-status")).toBeNull();
    expect(screen.getByTestId("place-bitcoin")).toHaveTextContent("Accepts Bitcoin · Lightning and on-chain");
    const actions = screen.getByTestId("place-actions");
    expect(within(actions).getByRole("link", { name: "Directions" })).toBeInTheDocument();
    expect(within(actions).queryByRole("link", { name: "Call" })).toBeNull();
    expect(within(actions).queryByRole("link", { name: "Website" })).toBeNull();
    const details = screen.getByTestId("place-details");
    expect(within(details).queryByTestId("place-address")).toBeNull();
    expect(within(details).getByTestId("place-country")).toHaveTextContent("Costa Rica");
    expect(within(details).queryByTestId("place-hours")).toBeNull();
  });

  it("applies only when the definition declares a name and the item has one", () => {
    const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy })!;
    expect(placeOf(ilSole, resolved.governing)?.name).toBe("Il Sole Italian Food");
    expect(placeOf({ ...ilSole, tags: ilSole.tags.filter((t) => t[0] !== "name") }, resolved.governing)).toBeNull();
  });
});
