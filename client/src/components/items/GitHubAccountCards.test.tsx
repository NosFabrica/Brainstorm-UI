// @vitest-environment jsdom
/**
 * A GitHub account where it is one among many — the results card, the
 * search popup row — reads the tier-three way too (ADR 0007): the handle
 * first, the account's own avatar, the description as the line. No API is
 * asked; the avatar is a picture URL the proxy serves like any other.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";

const { COMMUNITY, TEMPLATE_ID } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const HOUSE = "3".repeat(64);

let concept: { data: ResolvedConcept | null; isPending: boolean } = { data: null, isPending: true };
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => concept }));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({
    data: new Map([
      [
        TEMPLATE_ID,
        { id: TEMPLATE_ID, pubkey: "2".repeat(64), name: "GitHub profile", template: "https://github.com/{username}" },
      ],
    ]),
  }),
}));
vi.mock("@/components/share/things/shared", () => ({ useAuthors: () => new Map() }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));

import { DListItemCard } from "@/components/dictionary/DListItemCard";
import { DListSuggestionRow } from "@/components/dictionary/DListSuggestionRow";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [["required", "github-username"]]);
// The house copy as published today: the description is the title, the handle the summary.
const houseCopy = header(HOUSE, [
  ["required", "github-username"],
  ["optional", "description"],
  ["display", "title", "description"],
  ["display", "summary", "github-username"],
  ["image", "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"],
  ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "username", "github-username"],
  ["b", COMMUNITY, "pointer"],
]);
const item = {
  id: "9".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", "vcavallo-1i6dn0p"],
    ["z", COMMUNITY],
    ["description", "Vinney Cavallo"],
    ["github-username", "vcavallo"],
  ],
  sig: "",
};

describe("a GitHub account among results", () => {
  it("the card leads with the handle and the account's avatar, whatever the copy calls its title", () => {
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy }),
      isPending: false,
    };
    renderWithProviders(<DListItemCard event={item} author={null} />);
    expect(screen.getByTestId("dlist-item-card-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-item-card-summary")).toHaveTextContent("Vinney Cavallo");
    expect(screen.getByTestId("dlist-item-card-image").getAttribute("src")).toContain("github.com/vcavallo.png");
  });

  it("the popup row says the handle, then what it is and where it links", () => {
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy }),
      isPending: false,
    };
    renderWithProviders(<DListSuggestionRow event={item} />);
    expect(screen.getByTestId("dlist-suggestion-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-suggestion-line")).toHaveTextContent("GitHub Account · Vinney Cavallo");
  });

  it("under the bare community definition the handle still leads, with the avatar, and no description", () => {
    concept = { data: resolveConcept({ community, communityCoordinate: COMMUNITY }), isPending: false };
    renderWithProviders(<DListItemCard event={item} author={null} />);
    expect(screen.getByTestId("dlist-item-card-title")).toHaveTextContent("vcavallo");
    expect(screen.queryByTestId("dlist-item-card-summary")).toBeNull();
    expect(screen.getByTestId("dlist-item-card-image").getAttribute("src")).toContain("github.com/vcavallo.png");
  });
});
