// @vitest-environment jsdom
/**
 * Each kind of list item with a page of its own also has a look in search
 * (the team's design, prototyped on prototype/search-list-kinds): on the Top
 * page, a small preview of what the words find — a row of covers for Books,
 * three places with a little map for Places, three accounts for GitHub —
 * shown when the words find something, and only then.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";

const { PLACES, BOOKS, GITHUB } = vi.hoisted(() => ({
  PLACES: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places",
  BOOKS: "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books",
  GITHUB: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
}));

const header = (coordinate: string, names: [string, string], fields: string[][]): HeaderEvent => {
  const [, pubkey, d] = coordinate.split(":");
  return {
    id: d.padEnd(64, "0"),
    pubkey,
    kind: 39998,
    created_at: 1,
    tags: [["d", d], ["names", ...names], ...fields],
  };
};
const entry = (coordinate: string, h: HeaderEvent) => ({
  communityCoordinate: coordinate,
  resolved: resolveConcept({
    community: h,
    communityCoordinate: coordinate,
    personal: null,
    assistant: null,
    house: null,
  }),
  inDictionary: true,
  items: [],
});
const entries = [
  entry(
    PLACES,
    header(
      PLACES,
      ["Food and Drink Place", "Food and Drink Places"],
      [
        ["required", "name"],
        ["required", "category"],
        ["optional", "locality"],
        ["optional", "cuisine"],
        ["optional", "lat"],
        ["optional", "lon"],
      ],
    ),
  ),
  // As live: the Books header declares no fields; a book reads itself from its own tags.
  entry(BOOKS, header(BOOKS, ["Book", "Books"], [])),
  entry(GITHUB, header(GITHUB, ["GitHub Account", "GitHub Accounts"], [["required", "github-username"]])),
];
vi.mock("@/hooks/useDictionary", () => ({ useDictionary: () => ({ data: entries, isPending: false }) }));

let n = 0;
const item = (z: string, tags: string[][]) => ({
  id: String(++n).padStart(64, "0"),
  pubkey: z.split(":")[1],
  kind: 39999,
  created_at: 1,
  content: "",
  sig: "",
  tags: [["d", `item-${n}`], ["z", z], ...tags],
});
const place = (name: string, category: string, locality: string) =>
  item(PLACES, [
    ["name", name],
    ["category", category],
    ["locality", locality],
    ["lat", "38.2"],
    ["lon", "-122.6"],
  ]);
const book = (title: string, author: string) =>
  item(BOOKS, [
    ["title", title],
    ["author", author],
    ["cover", `https://covers.example/${title.replace(/\s/g, "")}.jpg`],
  ]);
const account = (handle: string) => item(GITHUB, [["github-username", handle]]);

const itemsOf: Record<string, unknown[]> = {
  [PLACES]: [
    place("Pink Owl Coffee", "cafe", "Petaluma"),
    place("Il Sole", "restaurant", "Sarasota"),
    place("Owl Coffee Bar", "cafe", "Lisbon"),
    place("Coffee One", "cafe", "Porto"),
    place("Coffee Two", "cafe", "Faro"),
  ],
  [BOOKS]: [
    book("Dune", "Frank Herbert"),
    book("Dune Messiah", "Frank Herbert"),
    book("The Hobbit", "J. R. R. Tolkien"),
  ],
  [GITHUB]: [account("riverdev"), account("lakebuilder")],
};
vi.mock("@/hooks/useConceptItems", () => ({
  useConceptItems: (e: { communityCoordinate: string } | undefined) => ({
    data: e ? itemsOf[e.communityCoordinate] : undefined,
    isPending: false,
  }),
}));
// The map draws tiles from the network: its pins are its props here.
vi.mock("@/components/items/PlacesMap", () => ({
  PlacesMap: ({ pins }: { pins: { name: string }[] }) => <div data-testid="places-map">{pins.length}</div>,
}));

// Who recommends each item (kind-7 "+", read in one batch for what's shown), and who the reader
// trusts: people they follow, then accounts above the verified line.
const trust = vi.hoisted(() => ({
  endorsers: new Map<string, { pubkey: string; at: number }[]>(),
  follows: new Set<string>(),
  signedIn: false,
}));
vi.mock("@/services/itemEngagement", () => ({
  fetchItemsReactions: async (items: { id: string }[]) =>
    new Map(items.filter((i) => trust.endorsers.has(i.id)).map((i) => [i.id, trust.endorsers.get(i.id)!])),
}));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: trust.follows, ready: true, signedIn: trust.signedIn }),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));

import { LIST_KINDS } from "./ListKindSearch";

const page = (key: string, query: string) => {
  const kind = LIST_KINDS.find((k) => k.key === key)!;
  return renderWithProviders(<kind.Page query={query} />);
};

const preview = (key: string, query: string) => {
  const kind = LIST_KINDS.find((k) => k.key === key)!;
  return renderWithProviders(<kind.Preview query={query} />);
};

describe("a kind's preview on the Top page", () => {
  it("Places: up to three places the words find, each with what it is and where, and their pins on a map", () => {
    preview("places", "coffee");
    const section = screen.getByTestId("kind-preview-places");
    expect(section).toHaveTextContent("Places");
    const rows = screen.getAllByTestId("kind-preview-row");
    expect(rows).toHaveLength(3);
    // A name that starts with the words leads (lib/listSearch), then names holding them.
    expect(rows.map((r) => r.querySelector("a")?.textContent)).toEqual(["Coffee One", "Coffee Two", "Pink Owl Coffee"]);
    expect(rows[2]).toHaveTextContent("Cafe · Petaluma");
    expect(section).not.toHaveTextContent("Il Sole");
    expect(screen.getByTestId("places-map")).toHaveTextContent("3");
    expect(rows[0].querySelector("a")?.getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("Books: a row of covers with titles and authors, found by title or author", () => {
    preview("books", "herbert");
    const covers = screen.getAllByTestId("kind-preview-row");
    expect(covers.map((c) => c.textContent)).toEqual(["DuneFrank Herbert", "Dune MessiahFrank Herbert"]);
    expect(covers[0].querySelector("img")).toHaveAttribute("src", "https://covers.example/Dune.jpg");
  });

  it("GitHub accounts: the accounts the words find, each with its avatar", () => {
    preview("github", "riverdev");
    const [row] = screen.getAllByTestId("kind-preview-row");
    expect(row).toHaveTextContent("riverdev");
    expect(row.querySelector("img")?.getAttribute("src")).toMatch(/^https:\/\/github\.com\/riverdev\.png/);
  });

  it("shows nothing when the words find nothing, or are only small joining words", () => {
    const { container } = preview("books", "zzzz");
    expect(container).toBeEmptyDOMElement();
    const again = preview("places", "the");
    expect(again.container).toBeEmptyDOMElement();
  });
});

describe("a kind's own page", () => {
  it("each kind sits with its neighbours under More", () => {
    expect(Object.fromEntries(LIST_KINDS.map((k) => [k.key, k.group]))).toEqual({
      places: "Out & about",
      books: "Read & listen",
      github: "Build",
    });
  });

  it("Books: a shelf of every book the words find, cover, title and author", () => {
    page("books", "dune");
    const shelf = screen.getByTestId("kind-page-books");
    const books = within(shelf).getAllByTestId("kind-page-item");
    expect(books.map((b) => b.textContent)).toEqual(["DuneFrank Herbert", "Dune MessiahFrank Herbert"]);
    expect(books[0].querySelector("img")).toHaveAttribute("src", "https://covers.example/Dune.jpg");
  });

  it("Books with no words to find: the whole shelf", () => {
    page("books", "books");
    expect(screen.getAllByTestId("kind-page-item")).toHaveLength(3);
  });

  it("Places: the places the words find, their pins on a map, and chips that narrow them", () => {
    page("places", "");
    const list = screen.getByTestId("kind-page-places");
    expect(within(list).getAllByTestId("kind-page-item")).toHaveLength(5);
    expect(screen.getByTestId("places-map")).toHaveTextContent("5");
    fireEvent.click(screen.getByRole("button", { name: "Restaurant" }));
    expect(
      within(list)
        .getAllByTestId("kind-page-item")
        .map((r) => r.querySelector("a")?.textContent),
    ).toEqual(["Il Sole"]);
    expect(screen.getByRole("button", { name: "Restaurant" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Restaurant" }));
    expect(within(list).getAllByTestId("kind-page-item")).toHaveLength(5);
  });

  it("GitHub accounts: a card for each, with its avatar and a way to it", () => {
    page("github", "");
    const cards = screen.getAllByTestId("kind-page-item");
    expect(cards.map((c) => c.querySelector("a")?.textContent)).toEqual(["riverdev", "lakebuilder"]);
    expect(within(cards[0]).getByRole("link", { name: "View account" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/e\/naddr1/),
    );
  });

  it("says so when the words find nothing", () => {
    page("books", "zzzz");
    expect(screen.getByTestId("kind-page-empty")).toHaveTextContent("No books match");
  });
});

describe("a preview's See all", () => {
  it("opens the kind's own page", () => {
    const onSeeAll = vi.fn();
    const kind = LIST_KINDS.find((k) => k.key === "books")!;
    renderWithProviders(<kind.Preview query="herbert" onSeeAll={onSeeAll} />);
    fireEvent.click(screen.getByRole("button", { name: "See all books" }));
    expect(onSeeAll).toHaveBeenCalled();
  });
});

describe("a kind's row in the search dropdown", () => {
  const suggestion = (key: string, query: string) => {
    const kind = LIST_KINDS.find((k) => k.key === key)!;
    return renderWithProviders(<kind.Suggestion query={query} />);
  };

  it("offers the best match, saying what it is, opening its page", () => {
    suggestion("books", "herbert");
    const row = screen.getByTestId("kind-suggestion-books");
    expect(row).toHaveTextContent("Dune");
    expect(row).toHaveTextContent("Frank Herbert");
    expect(row).toHaveTextContent("Book");
    expect(row).not.toHaveTextContent("Dune Messiah");
    expect(row.getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("offers nothing when the words find nothing", () => {
    const { container } = suggestion("places", "zzzz");
    expect(container).toBeEmptyDOMElement();
  });
});

describe("trust orders what search shows", () => {
  const FRIEND1 = "f1".repeat(32);
  const FRIEND2 = "f2".repeat(32);
  const STRANGER = "99".repeat(32);

  it("puts what people the reader trusts recommend first, and says so", async () => {
    const coffeeTwo = (itemsOf[PLACES] as { id: string; tags: string[][] }[]).find((i) =>
      i.tags.some((t) => t[1] === "Coffee Two"),
    )!;
    trust.endorsers = new Map([
      [
        coffeeTwo.id,
        [
          { pubkey: FRIEND1, at: 2 },
          { pubkey: FRIEND2, at: 1 },
          { pubkey: STRANGER, at: 3 },
        ],
      ],
    ]);
    trust.follows = new Set([FRIEND1, FRIEND2]);
    trust.signedIn = true;
    page("places", "");
    const first = await screen.findByText("Recommended by 2 people you trust");
    const rows = screen.getAllByTestId("kind-page-item");
    expect(rows[0]).toHaveTextContent("Coffee Two");
    expect(rows[0]).toContainElement(first);
    expect(rows[1]).not.toHaveTextContent("Recommended");
  });
});
