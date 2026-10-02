/**
 * A list item's results card and search-popup row: the same view as its
 * page — title, kind, link — from the governing definition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";

const { COMMUNITY, TEMPLATE_ID } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const ME = "1".repeat(64);

let concept: { data: ResolvedConcept | null; isPending: boolean } = { data: null, isPending: true };
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => concept }));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({
    data: new Map([
      [TEMPLATE_ID, { id: TEMPLATE_ID, pubkey: ME, name: "GitHub profile", template: "https://github.com/{username}" }],
    ]),
  }),
}));
vi.mock("@/components/share/things/shared", () => ({
  useAuthors: (pks: string[]) => new Map(pks.map((pk) => [pk, { pubkey: pk, npub: "npub", name: "Avi Burra" }])),
}));
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  DICTIONARY_CONCEPTS: [COMMUNITY],
  rendererKeyOf: (c: string) => (c === COMMUNITY ? "github-account" : null),
}));

import { DListItemCard } from "./DListItemCard";
import { DListSuggestionRow } from "./DListSuggestionRow";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [["required", "github-username"]]);
const item = {
  id: "9".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1_790_000_000,
  content: "",
  sig: "",
  tags: [
    ["d", "vcavallo-1i6dn0p"],
    ["z", COMMUNITY],
    ["description", "Vinney Cavallo"],
    ["github-username", "vcavallo"],
  ],
} as NostrEvent;

const mine = header(ME, [
  ["required", "github-username"],
  ["optional", "description"],
  ["display", "title", "description"],
  ["image", "https://x.example/gh.png"],
  ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "username", "github-username"],
  ["b", COMMUNITY, "pointer"],
]);

beforeEach(() => {
  concept = { data: resolveConcept({ community, communityCoordinate: COMMUNITY }), isPending: false };
});

describe("DListItemCard", () => {
  it("the community's definition: titled by the username, linking to GitHub, listed by its author", () => {
    renderWithProviders(<DListItemCard event={item} />);
    expect(screen.getByTestId("dlist-item-card-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-item-card-kind")).toHaveTextContent("GitHub Account");
    expect(screen.getByTestId(`dlist-item-card-link-${item.id}`)).toHaveAttribute(
      "href",
      "https://github.com/vcavallo",
    );
    expect(screen.getByText("Avi Burra")).toBeInTheDocument();
  });

  it("the reader's copy: its title field, its list image, its template link", () => {
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, personal: mine }),
      isPending: false,
    };
    renderWithProviders(<DListItemCard event={item} />);
    expect(screen.getByTestId("dlist-item-card-title")).toHaveTextContent("Vinney Cavallo");
    expect(screen.getByTestId("dlist-item-card-image")).toBeInTheDocument();
    expect(screen.getByTestId(`dlist-item-card-link-${item.id}`)).toHaveAttribute("title", "GitHub profile");
  });

  it("goes to the item's page with a relay hint", () => {
    renderWithProviders(<DListItemCard event={item} />);
    expect(screen.getByTestId(`dlist-item-card-${item.id}`).querySelector("a")?.getAttribute("href")).toMatch(
      /^\/e\/nevent1/,
    );
  });

  it("says so while the definition loads", () => {
    concept = { data: null, isPending: true };
    renderWithProviders(<DListItemCard event={item} />);
    expect(screen.getByTestId("dlist-item-card-pending")).toHaveTextContent("Reading this list item");
  });
});

describe("DListSuggestionRow", () => {
  it("names the item and, first on the grey line, what it is", () => {
    renderWithProviders(<DListSuggestionRow event={item} />);
    expect(screen.getByTestId("dlist-suggestion-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-suggestion-line")).toHaveTextContent("GitHub Account · github.com/vcavallo");
  });

  it("shows nothing until it can name the item", () => {
    concept = { data: null, isPending: true };
    const { container } = renderWithProviders(<DListSuggestionRow event={item} />);
    expect(container).toBeEmptyDOMElement();
  });
});
