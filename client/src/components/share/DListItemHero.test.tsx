/**
 * A GitHub account on its own page: the governing definition's fields, the
 * renderer's title and link, the undeclared tags folded away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";

const { COMMUNITY } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const TA = "2".repeat(64);

let concept: { data: ResolvedConcept | null; isPending: boolean } = { data: null, isPending: true };
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => concept }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
// The GitHub profile template, as published on dcosl (pinned by id).
const { TEMPLATE_ID } = vi.hoisted(() => ({
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
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
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  DICTIONARY_CONCEPTS: [COMMUNITY],
  rendererKeyOf: (c: string) => (c === COMMUNITY ? "github-account" : null),
}));

import { DListItemHero } from "./DListItemHero";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [
  ["description", "A list of github handles/accounts"],
  ["required", "github-username"],
  ["field-type", "github-username", "text"],
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
};

beforeEach(() => {
  concept = { data: resolveConcept({ community, communityCoordinate: COMMUNITY }), isPending: false };
});

describe("DListItemHero", () => {
  it("draws a GitHub account: title, link to GitHub, the declared field", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-hero")).toHaveAttribute("data-renderer", "github-account");
    expect(screen.getByTestId("dlist-item-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-item-link")).toHaveAttribute("href", "https://github.com/vcavallo");
    expect(screen.getByTestId("dlist-item-link")).toHaveAttribute("data-link-source", "renderer");
    expect(screen.getByTestId("dlist-item-fields")).toHaveTextContent("github-username");
    expect(screen.getByText("GitHub Account")).toBeInTheDocument();
  });

  it("a definition that names a URL template links from data, not from the renderer", () => {
    const copy = header(TA, [
      ["required", "github-username"],
      ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "username", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy }),
      isPending: false,
    };
    renderWithProviders(<DListItemHero event={item} />);
    const link = screen.getByTestId("dlist-item-link");
    expect(link).toHaveAttribute("href", "https://github.com/vcavallo");
    expect(link).toHaveAttribute("data-link-source", "template");
    expect(link).toHaveTextContent("GitHub profile");
    expect(link).toHaveTextContent("github.com");
  });

  it("keeps tags the definition doesn't declare out of the fields, folded away", async () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-fields")).not.toHaveTextContent("Vinney Cavallo");
    const toggle = screen.getByTestId("dlist-item-extras-toggle");
    expect(toggle).toHaveTextContent("1 more detail the author added, outside the GitHub Account definition");
    await userEvent.click(toggle);
    expect(screen.getByTestId("dlist-item-extras")).toHaveTextContent("Vinney Cavallo");
  });

  it("draws from the reader's copy when it declares more — and says it differs", () => {
    const copy = header(TA, [
      ["description", "A list of github handles/accounts"],
      ["required", "github-username"],
      ["field-type", "github-username", "text"],
      ["optional", "description", "Who it belongs to"],
      ["b", COMMUNITY, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy }),
      isPending: false,
    };
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-fields")).toHaveTextContent("Vinney Cavallo");
    expect(screen.queryByTestId("dlist-item-extras-toggle")).toBeNull();
    expect(screen.getByTestId("chip-dictionary-agreement")).toHaveTextContent("Differs from the community");
    expect(screen.getByText(/your Assistant's copy of/)).toBeInTheDocument();
  });

  it("flags a required field the item lacks", () => {
    renderWithProviders(<DListItemHero event={{ ...item, tags: [["z", COMMUNITY]] }} />);
    expect(screen.getByTestId("dlist-item-fields")).toHaveTextContent("Missing — the list requires it");
  });

  it("with no definition, says so and shows what the item carries", () => {
    concept = { data: null, isPending: false };
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-hero")).toHaveAttribute("data-renderer", "none");
    expect(screen.getByText(/whose definition couldn.t be read/)).toBeInTheDocument();
    expect(screen.getByText("vcavallo")).toBeInTheDocument();
  });
});
