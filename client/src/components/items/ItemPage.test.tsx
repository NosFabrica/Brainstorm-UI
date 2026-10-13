// @vitest-environment jsdom
/**
 * An item's own page picks its tier above both (ADR 0007): the concept's
 * hand-made view when it has one that applies, else the tier-two page — which
 * itself never asks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";
import { ItemPage } from "./ItemPage";

const { GITHUB } = vi.hoisted(() => ({
  GITHUB: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const HOUSE = "3".repeat(64);

let concept: { data: ResolvedConcept | null; isPending: boolean } = { data: null, isPending: true };
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => concept }));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/components/share/DListItemHero", () => ({
  DListItemHero: () => <div data-testid="tier-two" />,
}));
vi.mock("@/components/items/GitHubAccountView", async (original) => ({
  ...(await original<typeof import("@/components/items/GitHubAccountView")>()),
  GitHubAccountView: () => <div data-testid="tier-three-github" />,
}));

const header = (pubkey: string, d: string, tags: string[][]): HeaderEvent => ({
  id: "h".repeat(64),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", d], ...tags],
});
const githubCommunity = header(AVI, "github-accounts", [
  ["names", "GitHub Account", "GitHub Accounts"],
  ["required", "github-username"],
]);
const item = {
  id: "i".repeat(64),
  kind: 39999,
  pubkey: "1".repeat(64),
  created_at: 2,
  content: "",
  tags: [
    ["z", GITHUB],
    ["github-username", "vcavallo"],
  ],
};

beforeEach(() => {
  concept = { data: resolveConcept({ community: githubCommunity, communityCoordinate: GITHUB }), isPending: false };
});

describe("ItemPage", () => {
  it("draws a concept's own view when the item gives it what it needs", () => {
    renderWithProviders(<ItemPage event={item} />);
    expect(screen.getByTestId("tier-three-github")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-two")).toBeNull();
  });

  it("falls back to the tier-two page when a copy doesn't declare what the view reads", () => {
    const copy = header(HOUSE, "github-accounts", [
      ["names", "GitHub Account", "GitHub Accounts"],
      ["required", "handle"],
      ["b", GITHUB, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community: githubCommunity, communityCoordinate: GITHUB, house: copy }),
      isPending: false,
    };
    renderWithProviders(<ItemPage event={item} />);
    expect(screen.getByTestId("tier-two")).toBeInTheDocument();
  });

  it("draws a concept with no view of its own the tier-two way", () => {
    const songs = header(AVI, "songs", [
      ["names", "Song", "Songs"],
      ["required", "github-username"],
    ]);
    concept = {
      data: resolveConcept({ community: songs, communityCoordinate: `39998:${AVI}:songs` }),
      isPending: false,
    };
    renderWithProviders(<ItemPage event={item} />);
    expect(screen.getByTestId("tier-two")).toBeInTheDocument();
  });

  it("leaves the tier-two page to say so while the definition loads", () => {
    concept = { data: null, isPending: true };
    renderWithProviders(<ItemPage event={item} />);
    expect(screen.getByTestId("tier-two")).toBeInTheDocument();
  });
});
