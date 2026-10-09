// @vitest-environment jsdom
/**
 * List items among the Everything results: "github vcavallo" shows the
 * GitHub account — to everyone, signed in or not. (The Dictionary tab in
 * Settings stays admin-only; that's SettingsPage's concern, not this one.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";

const { GITHUB, BOOKS } = vi.hoisted(() => ({
  GITHUB: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
  BOOKS: "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";

// Who's reading: an admin, anyone signed in, or a signed-out visitor (null).
let viewer: { pubkey: string; isAdmin: boolean } | null = { pubkey: "1".repeat(64), isAdmin: true };
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => viewer,
}));
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  SEARCHABLE_CONCEPTS: [GITHUB],
}));

const header = (pubkey: string, d: string, names: [string, string], field: string): HeaderEvent => ({
  id: d.padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", d],
    ["names", ...names],
    ["required", field],
  ],
});
const entryOf = (coordinate: string, h: HeaderEvent) => ({
  communityCoordinate: coordinate,
  resolved: resolveConcept({
    community: h,
    communityCoordinate: coordinate,
    personal: null,
    assistant: null,
    house: null,
  }),
  inDictionary: false,
  items: [],
});
const github = entryOf(
  GITHUB,
  header(AVI, "github-accounts", ["GitHub Account", "GitHub Accounts"], "github-username"),
);
const books = entryOf(
  BOOKS,
  header("6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b", "books", ["Book", "Books"], "title"),
);

const dictionaryAsked = vi.fn();
vi.mock("@/hooks/useDictionary", () => ({
  useDictionary: (enabled?: boolean, opts?: unknown) => {
    dictionaryAsked(enabled, opts);
    return { data: enabled === false ? undefined : [github, books] };
  },
}));

const account = (id: string, username: string) => ({
  id: id.repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  sig: "",
  tags: [
    ["z", GITHUB],
    ["github-username", username],
  ],
});
const itemsAsked = vi.fn();
vi.mock("@/hooks/useConceptItems", () => ({
  useConceptItems: (entry: { communityCoordinate: string } | undefined, enabled = true) => {
    itemsAsked(entry?.communityCoordinate, enabled);
    return {
      data:
        enabled && entry?.communityCoordinate === GITHUB
          ? [account("a", "vcavallo"), account("b", "fiatjaf"), account("c", "vcavallo-bot")]
          : undefined,
    };
  },
}));
vi.mock("@/components/dictionary/DListItemCard", () => ({
  DListItemCard: ({ event }: { event: { tags: string[][] } }) => (
    <div data-testid="item-card">{event.tags.find((t) => t[0] === "github-username")?.[1]}</div>
  ),
}));

import { ListItemResults } from "./ListItemResults";

beforeEach(() => {
  viewer = { pubkey: "1".repeat(64), isAdmin: true };
  dictionaryAsked.mockClear();
  itemsAsked.mockClear();
});

describe("ListItemResults", () => {
  it("shows the GitHub accounts 'github vcavallo' finds, under the list's name", () => {
    render(<ListItemResults query="github vcavallo" onTabChange={() => {}} />);
    expect(screen.getByTestId("serp-section-list-items")).toHaveTextContent("GitHub Accounts");
    expect(screen.getAllByTestId("item-card").map((c) => c.textContent)).toEqual(["vcavallo", "vcavallo-bot"]);
  });

  it("shows them to anyone signed in, admin or not", () => {
    viewer = { pubkey: "1".repeat(64), isAdmin: false };
    render(<ListItemResults query="github vcavallo" onTabChange={() => {}} />);
    expect(screen.getAllByTestId("item-card").map((c) => c.textContent)).toEqual(["vcavallo", "vcavallo-bot"]);
  });

  it("shows them to a signed-out visitor too, reading the lists with no account", () => {
    viewer = null;
    render(<ListItemResults query="github vcavallo" onTabChange={() => {}} />);
    expect(screen.getAllByTestId("item-card").map((c) => c.textContent)).toEqual(["vcavallo", "vcavallo-bot"]);
    expect(dictionaryAsked).toHaveBeenCalledWith(true, { anonymous: true });
  });

  it("shows nothing when the words name no list, and leaves the items unread", () => {
    const { container } = render(<ListItemResults query="vcavallo" onTabChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(itemsAsked).toHaveBeenCalledWith(undefined, false);
  });

  it("does not search a list the config has not turned on", () => {
    const { container } = render(<ListItemResults query="books tolkien" onTabChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when no item matches", () => {
    const { container } = render(<ListItemResults query="github nobody-here" onTabChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
