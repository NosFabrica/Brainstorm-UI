// @vitest-environment jsdom
/**
 * Each kind of list item with a page of its own also has a look in search
 * (the team's design, prototyped on prototype/search-list-kinds): on the Top
 * page, a small preview of what the words find — a row of covers for Books,
 * three places with a little map for Places, three accounts for GitHub —
 * shown when the words find something, and only then.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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

import { LIST_KINDS } from "./ListKindSearch";

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
