// @vitest-environment jsdom
/**
 * Each kind of list item with a page of its own also has a look in search
 * (the team's design, prototyped on prototype/search-list-kinds): on the Top
 * page, a small preview of what the words find — a row of covers for Books,
 * three places with a little map for Places, three accounts for GitHub —
 * shown when the words find something, and only then.
 */
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
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
        ["optional", "opening-hours"],
        ["optional", "accepts-bitcoin"],
        ["optional", "address"],
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
const place = (name: string, category: string, locality: string, extra: string[][] = [], at = ["38.2", "-122.6"]) =>
  item(PLACES, [
    ["name", name],
    ["category", category],
    ["locality", locality],
    ["lat", at[0]],
    ["lon", at[1]],
    ["accepts-bitcoin", "lightning"],
    ...extra,
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
const itemsAsked = vi.hoisted(() => vi.fn<(coordinate: string | undefined, enabled: boolean) => void>());
vi.mock("@/hooks/useConceptItems", () => ({
  useConceptItems: (e: { communityCoordinate: string } | undefined, enabled = true) => {
    itemsAsked(e?.communityCoordinate, enabled);
    return { data: e && enabled ? itemsOf[e.communityCoordinate] : undefined, isPending: false };
  },
}));
// The map draws tiles from the network: its pins are its props here.
vi.mock("@/components/items/PlacesMap", () => ({
  PlacesMap: ({
    pins,
    highlight,
    onPin,
  }: {
    pins: { name: string; label?: string }[];
    highlight?: string | null;
    onPin?: (label: string) => void;
  }) => (
    <div data-testid="places-map" data-labels={pins.map((p) => p.label).join(",")} data-highlight={highlight ?? ""}>
      {pins.length}
      {pins.map((p) => (
        <button key={p.label} type="button" onClick={() => onPin?.(p.label!)}>
          pin {p.label}
        </button>
      ))}
    </div>
  ),
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
// Signed out: places are weighed through the curator's lens.
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
// Reviews of the places shown (kind 34259), read in one batch, and the reviewers' ranks in the
// curator's lens (signed out): what orders places by rating.
const ratings = vi.hoisted(() => ({
  reviews: new Map<string, { pubkey: string; rating: number | null }[]>(),
  ranks: new Map<string, number>(),
}));
vi.mock("@/services/placeReviews", () => ({
  fetchReviewsForPlaces: async (addresses: string[]) =>
    new Map(
      addresses.map((a) => [
        a,
        (ratings.reviews.get(a) ?? []).map((r, i) => ({
          ...r,
          id: `${a}-${i}`,
          at: 1,
          text: "",
          photos: [],
          price: null,
          paid: null,
        })),
      ]),
    ),
  fetchLensRanks: async () => ratings.ranks,
}));

import { LIST_KINDS } from "./ListKindSearch";

const page = (key: string, query: string) => {
  const kind = LIST_KINDS.find((k) => k.key === key)!;
  return renderWithProviders(<kind.Page query={query} />);
};

/** A kind's Top preview, offered both places, above People and below, as the Top page offers it. */
const preview = (key: string, query: string, named = false) => {
  const kind = LIST_KINDS.find((k) => k.key === key)!;
  return renderWithProviders(
    <>
      <div data-testid="slot-lead">
        <kind.Preview query={query} slot="lead" named={named} />
      </div>
      <div data-testid="slot-follow">
        <kind.Preview query={query} slot="follow" named={named} />
      </div>
    </>,
  );
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

  it("Books: a row of covers with titles and authors, found by title", () => {
    preview("books", "dune");
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
    preview("books", "zzzz");
    expect(screen.queryByTestId("kind-preview-books")).toBeNull();
    cleanup();
    preview("places", "the");
    expect(screen.queryByTestId("kind-preview-places")).toBeNull();
  });
});

describe("what the Top page's previews match", () => {
  it("Books match by title on the Top page — a name in a byline is not a search for the book", () => {
    preview("books", "herbert");
    expect(screen.queryByTestId("kind-preview-books")).toBeNull();
  });

  it("the Books page still finds them by author", () => {
    page("books", "herbert");
    expect(screen.getAllByTestId("kind-page-item")).toHaveLength(2);
  });

  it("the dropdown takes the last word as it is being typed", () => {
    const kind = LIST_KINDS.find((k) => k.key === "books")!;
    renderWithProviders(<kind.Suggestion query="dune mess" />);
    expect(screen.getByTestId("kind-suggestion-books")).toHaveTextContent("Dune Messiah");
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
    fireEvent.click(screen.getByRole("button", { name: /^Restaurant/ }));
    expect(
      within(list)
        .getAllByTestId("kind-page-item")
        .map((r) => r.querySelector("a")?.textContent),
    ).toEqual(["Il Sole"]);
    expect(screen.getByRole("button", { name: /^Restaurant/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Restaurant/ }));
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
    renderWithProviders(<kind.Preview query="dune" slot="follow" named={false} onSeeAll={onSeeAll} />);
    fireEvent.click(screen.getByRole("button", { name: "See all 2 books" }));
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

// Cleaner places (the team, 2026-10-19): a number ties each row to its pin, no stand-in icon, no
// Bitcoin badge on a list where every place takes it, a quiet "Closed · opens…", a map only when
// the places are near enough for it to say something, and counts on the chips and See all.
describe("places, presented cleanly", () => {
  it("numbers each row and gives its pin the same number, with no stand-in icon", () => {
    preview("places", "coffee");
    const rows = screen.getAllByTestId("kind-preview-row");
    expect(rows.map((r) => r.querySelector('[data-testid="kind-row-number"]')?.textContent)).toEqual(["1", "2", "3"]);
    expect(rows[0].querySelector("svg")).toBeNull();
    expect(screen.getByTestId("places-map")).toHaveAttribute("data-labels", "1,2,3");
  });

  it("says nothing of Bitcoin on each row, and offers no Bitcoin chip", () => {
    page("places", "");
    expect(screen.getByTestId("kind-page-places")).not.toHaveTextContent("Bitcoin");
    expect(screen.queryByRole("button", { name: /Bitcoin/ })).toBeNull();
  });

  it("says closed quietly, with when it opens", () => {
    const was = itemsOf[PLACES];
    vi.useFakeTimers({ now: new Date("2026-10-15T20:00:00Z"), toFake: ["Date"] });
    try {
      itemsOf[PLACES] = [place("Night Owl", "cafe", "Petaluma", [["opening-hours", "Mo-Su 08:00-09:00"]])];
      page("places", "");
      const status = screen.getByText(/^Closed · opens/);
      expect(status.className).not.toMatch(/rose|red/);
    } finally {
      itemsOf[PLACES] = was;
      vi.useRealTimers();
    }
  });

  it("draws no map when the places are a continent apart", () => {
    const was = itemsOf[PLACES];
    try {
      itemsOf[PLACES] = [
        place("West Cafe", "cafe", "Ewa Beach", [], ["21.33", "-158.0"]),
        place("West Diner", "restaurant", "West Roxbury", [], ["42.28", "-71.13"]),
      ];
      page("places", "");
      expect(screen.queryByTestId("places-map")).toBeNull();
    } finally {
      itemsOf[PLACES] = was;
    }
  });

  it("counts on the chips, and on See all", () => {
    page("places", "");
    expect(screen.getByRole("button", { name: "Cafe 4" })).toBeInTheDocument();
    cleanup();
    const places = LIST_KINDS.find((k) => k.key === "places")!;
    renderWithProviders(<places.Preview query="coffee" slot="follow" named={false} onSeeAll={() => {}} />);
    expect(screen.getByRole("button", { name: "See all 4 places" })).toBeInTheDocument();
  });
});

// Above People only when the words ask for it: they name the kind, or — for Places — a kind of
// place or a town several places are in. Otherwise below People, where a name is most often a person.
describe("where a preview sits on the Top page", () => {
  const sitsIn = (testId: string) =>
    within(screen.getByTestId("slot-lead")).queryByTestId(testId)
      ? "lead"
      : within(screen.getByTestId("slot-follow")).queryByTestId(testId)
        ? "follow"
        : null;

  it("Books follow People unless the words name them", () => {
    preview("books", "dune");
    expect(sitsIn("kind-preview-books")).toBe("follow");
    cleanup();
    preview("books", "books dune", true);
    expect(sitsIn("kind-preview-books")).toBe("lead");
  });

  it("Places lead for a kind of place, or a town several places are in", () => {
    preview("places", "cafe");
    expect(sitsIn("kind-preview-places")).toBe("lead");
    cleanup();
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    try {
      preview("places", "sarasota");
      expect(sitsIn("kind-preview-places")).toBe("lead");
    } finally {
      itemsOf[PLACES].pop();
    }
  });

  it("Places follow for a word that only appears in their names", () => {
    preview("places", "owl");
    expect(sitsIn("kind-preview-places")).toBe("follow");
  });
});

// A row and its pin are one place: pointing at a row lights its pin, and tapping a pin lights its row.
describe("the Places page's rows and pins", () => {
  it("lights a row's pin while the row is pointed at", () => {
    page("places", "");
    const rows = screen.getAllByTestId("kind-page-item");
    fireEvent.mouseEnter(rows[1]);
    expect(screen.getByTestId("places-map")).toHaveAttribute("data-highlight", "2");
    fireEvent.mouseLeave(rows[1]);
    expect(screen.getByTestId("places-map")).toHaveAttribute("data-highlight", "");
  });

  it("lights a pin's row when the pin is tapped", () => {
    page("places", "");
    fireEvent.click(screen.getByRole("button", { name: "pin 3" }));
    expect(screen.getAllByTestId("kind-page-item")[2]).toHaveAttribute("data-highlighted", "true");
  });
});

// The lists are read before anyone searches: once the search page is idle, each kind reads its
// list, so the first search's previews arrive with People rather than after.
describe("warming a kind's list", () => {
  it("reads the list once the page is idle, not before", () => {
    vi.useFakeTimers();
    try {
      itemsAsked.mockClear();
      const kind = LIST_KINDS.find((k) => k.key === "books")!;
      renderWithProviders(<kind.Warm />);
      expect(itemsAsked).not.toHaveBeenCalledWith(BOOKS, true);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(itemsAsked).toHaveBeenCalledWith(BOOKS, true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// A town the words name is said: "Places in Sarasota", and See all says it too.
describe("a town search", () => {
  it("names the town in the Places preview", () => {
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    try {
      const places = LIST_KINDS.find((k) => k.key === "places")!;
      renderWithProviders(<places.Preview query="sarasota" slot="lead" named={false} onSeeAll={() => {}} />);
      expect(screen.getByTestId("kind-preview-places")).toHaveTextContent("Places in Sarasota");
      expect(screen.getByRole("button", { name: "See all 2 places in Sarasota" })).toBeInTheDocument();
    } finally {
      itemsOf[PLACES].pop();
    }
  });
});

// Places come in the order of their rating through the reader's lens — the curator's, signed out —
// damped so one review doesn't top the list (lib/placeReviews orderingScore), and say it.
describe("places ordered by rating", () => {
  it("leads with the best rated, and shows its stars and how many reviewed it", async () => {
    const coffeeTwo = (itemsOf[PLACES] as { pubkey: string; tags: string[][] }[]).find((i) =>
      i.tags.some((t) => t[1] === "Coffee Two"),
    )!;
    const address = `39999:${coffeeTwo.pubkey}:${coffeeTwo.tags.find((t) => t[0] === "d")![1]}`;
    const R1 = "e1".repeat(32);
    const R2 = "e2".repeat(32);
    ratings.reviews = new Map([
      [
        address,
        [
          { pubkey: R1, rating: 5 },
          { pubkey: R2, rating: 4 },
        ],
      ],
    ]);
    ratings.ranks = new Map([
      [R1, 80],
      [R2, 80],
    ]);
    try {
      page("places", "");
      await screen.findByText("★ 4.5 · 2 reviews");
      const rows = screen.getAllByTestId("kind-page-item");
      expect(rows[0]).toHaveTextContent("Coffee Two");
      expect(rows[0]).toHaveTextContent("★ 4.5 · 2 reviews");
    } finally {
      ratings.reviews = new Map();
      ratings.ranks = new Map();
    }
  });
});

// The same account filed by two people is one card, with both copies' endorsements; two branches
// of a chain in one town are two places, told apart by their street.
describe("copies and branches", () => {
  const FRIEND1 = "f1".repeat(32);
  const FRIEND2 = "f2".repeat(32);

  it("shows an account filed twice once, counting who recommends either copy", async () => {
    const copy = { ...account("riverdev"), pubkey: "ab".repeat(32) };
    const original = (itemsOf[GITHUB] as { id: string; tags: string[][] }[]).find((i) =>
      i.tags.some((t) => t[1] === "riverdev"),
    )!;
    const was = itemsOf[GITHUB];
    itemsOf[GITHUB] = [...was, copy];
    trust.endorsers = new Map([
      [original.id, [{ pubkey: FRIEND1, at: 1 }]],
      [copy.id, [{ pubkey: FRIEND2, at: 2 }]],
    ]);
    trust.follows = new Set([FRIEND1, FRIEND2]);
    trust.signedIn = true;
    try {
      page("github", "riverdev");
      expect(screen.getAllByTestId("kind-page-item")).toHaveLength(1);
      expect(await screen.findByText("Recommended by 2 people you trust")).toBeInTheDocument();
    } finally {
      itemsOf[GITHUB] = was;
      trust.endorsers = new Map();
      trust.follows = new Set();
      trust.signedIn = false;
    }
  });

  it("tells two branches in one town apart by their street", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = [
      place("Pink Owl Coffee", "cafe", "San Rafael", [["address", "1100 Fourth Street"]]),
      place("Pink Owl Coffee", "cafe", "San Rafael", [["address", "625 Du Bois Street"]]),
    ];
    try {
      page("places", "");
      const rows = screen.getAllByTestId("kind-page-item");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("Cafe · San Rafael · 1100 Fourth Street");
      expect(rows[1]).toHaveTextContent("Cafe · San Rafael · 625 Du Bois Street");
    } finally {
      itemsOf[PLACES] = was;
    }
  });
});
