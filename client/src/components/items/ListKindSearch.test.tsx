// @vitest-environment jsdom
/**
 * Each kind of list item with a page of its own also has a look in search
 * (the team's design, prototyped on prototype/search-list-kinds): on the Top
 * page, a small preview of what the words find — a row of covers for Books,
 * three places with a little map for Places, three accounts for GitHub —
 * shown when the words find something, and only then.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SearchPriorityContext } from "@/hooks/useSearchPriority";
import { __resetNip05Cache } from "@/lib/nip05";
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
        ["optional", "phone"],
        ["optional", "website"],
        ["optional", "price-range"],
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
// The map draws tiles from the network: its pins are its props here, and "move map" stands in
// for the reader panning or zooming it to `mapMove.view`.
const mapMove = vi.hoisted(() => ({ view: { south: 0, west: 0, north: 0, east: 0 } }));
vi.mock("@/components/items/PlacesMap", () => ({
  PlacesMap: ({
    pins,
    highlight,
    onPin,
    onEvent,
    onOpen,
    onMoved,
  }: {
    pins: { name: string; label?: string; kind?: string; id?: string }[];
    highlight?: string | null;
    onPin?: (label: string) => void;
    onEvent?: (id: string) => void;
    onOpen?: () => void;
    onMoved?: (view: typeof mapMove.view) => void;
  }) => (
    <div
      data-testid="places-map"
      data-labels={pins
        .filter((p) => p.kind !== "event")
        .map((p) => p.label)
        .join(",")}
      data-events={pins
        .filter((p) => p.kind === "event")
        .map((p) => p.name)
        .join(",")}
      data-highlight={highlight ?? ""}
    >
      {pins.length}
      {onOpen && (
        <button type="button" onClick={onOpen}>
          Open the map
        </button>
      )}
      {onMoved && (
        <button type="button" onClick={() => onMoved(mapMove.view)}>
          move map
        </button>
      )}
      {pins.map((p) =>
        p.kind === "event" ? (
          <button key={`event-${p.id}`} type="button" onClick={() => onEvent?.(p.id!)}>
            event {p.name}
          </button>
        ) : (
          <button key={p.label} type="button" onClick={() => onPin?.(p.label!)}>
            pin {p.label}
          </button>
        ),
      )}
    </div>
  ),
}));

// Who recommends each item (kind-7 "+", read in one batch for what's shown), and who the reader
// trusts: people they follow, then accounts above the verified line.
const trust = vi.hoisted(() => ({
  endorsers: new Map<string, { pubkey: string; at: number }[]>(),
  follows: new Set<string>(),
  signedIn: false,
  asked: 0,
}));
vi.mock("@/services/itemEngagement", () => ({
  fetchItemsReactions: async (items: { id: string }[]) => {
    trust.asked++;
    return new Map(items.filter((i) => trust.endorsers.has(i.id)).map((i) => [i.id, trust.endorsers.get(i.id)!]));
  },
}));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: trust.follows, ready: true, signedIn: trust.signedIn }),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
// A town's events, as the search relay answers for its name (kinds 31922/31923).
const townEvents = vi.hoisted(() => ({
  list: [] as unknown[],
  asked: [] as string[],
  areaAsked: [] as { cells: string[]; town: string | null }[],
}));
vi.mock("@/services/townEvents", () => ({
  fetchTownEvents: async (town: string) => {
    townEvents.asked.push(town);
    return townEvents.list;
  },
  fetchAreaEvents: async (cells: string[], town: string | null) => {
    townEvents.areaAsked.push({ cells, town });
    return townEvents.list;
  },
}));
// What GitHub says about who owns each listed account (services/github), by handle: none by default.
const githubEvidence = vi.hoisted(() => ({
  of: {} as Record<
    string,
    { checked?: boolean; named: string[]; blogHost: string | null; claimants?: string[]; provenClaimants: string[] }
  >,
}));
vi.mock("@/services/github", () => ({
  fetchGitHubEvidence: async (handle: string) => {
    const known = githubEvidence.of[handle.toLowerCase()];
    return known
      ? { checked: true, claimants: [], ...known }
      : { checked: false, named: [], blogHost: null, claimants: [], provenClaimants: [] };
  },
}));
// Signed out: places are weighed through the curator's lens.
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
// Reviews of the places shown (kind 34259), read in one batch, and the reviewers' ranks in the
// curator's lens (signed out): what orders places by rating.
const ratings = vi.hoisted(() => ({
  reviews: new Map<string, { pubkey: string; rating: number | null }[]>(),
  ranks: new Map<string, number>(),
  asked: 0,
}));
vi.mock("@/services/placeReviews", () => ({
  fetchReviewsForPlaces: async (addresses: string[]) => (
    ratings.asked++,
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
    )
  ),
  fetchLensRanks: async () => ratings.ranks,
}));

import { LIST_KINDS } from "./ListKindSearch";

const page = (key: string, query: string) => {
  const kind = LIST_KINDS.find((k) => k.key === key)!;
  return renderWithProviders(<kind.Page query={query} />);
};

/**
 * Below a desktop's width — a tablet's, where the preview still draws its little map — the side
 * panel folds to a strip, so a town's places stay in the results (PlacesPanel takes them on a desktop).
 */
const belowDesktop = (run: () => void | Promise<void>) => async () => {
  const width = window.innerWidth;
  window.innerWidth = 800;
  try {
    await run();
  } finally {
    window.innerWidth = width;
  }
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
      <div data-testid="slot-late">
        <kind.Preview query={query} slot="late" named={named} />
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

  // An account the words don't name is a band on a topic page that isn't about it: it waits
  // at the end, with the other matches that only share a word, unless a shown person owns it.
  it("GitHub accounts the words don't name wait at the end of the page; named, they lead", () => {
    preview("github", "riverdev");
    expect(within(screen.getByTestId("slot-late")).getByTestId("kind-preview-row")).toHaveTextContent("riverdev");
    expect(within(screen.getByTestId("slot-follow")).queryByTestId("kind-preview-row")).toBeNull();
    cleanup();
    preview("github", "github riverdev", true);
    expect(within(screen.getByTestId("slot-lead")).getByTestId("kind-preview-row")).toHaveTextContent("riverdev");
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
    renderWithProviders(<kind.Suggestion query="dune mess" slot="follow" />);
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
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    try {
      page("places", "");
      const list = screen.getByTestId("kind-page-places");
      expect(within(list).getAllByTestId("kind-page-item")).toHaveLength(6);
      expect(screen.getByTestId("places-map")).toHaveTextContent("6");
      fireEvent.click(screen.getByRole("button", { name: /^Restaurant/ }));
      expect(
        within(list)
          .getAllByTestId("kind-page-item")
          .map((r) => r.querySelector("a")?.textContent),
      ).toEqual(["Il Sole", "Il Sole Two"]);
      expect(screen.getByRole("button", { name: /^Restaurant/ })).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: /^Restaurant/ }));
      expect(within(list).getAllByTestId("kind-page-item")).toHaveLength(6);
    } finally {
      itemsOf[PLACES].pop();
    }
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
    return renderWithProviders(
      <>
        <kind.Suggestion query={query} slot="lead" />
        <kind.Suggestion query={query} slot="follow" />
      </>,
    );
  };

  // The dropdown opens for a kind's row alone, so a row says whether it has one to offer.
  it("says whether it has a row to offer, for the box to open on", () => {
    const offers: boolean[] = [];
    const kind = LIST_KINDS.find((k) => k.key === "books")!;
    renderWithProviders(<kind.Suggestion query="dune" slot="follow" onOffer={(on) => offers.push(on)} />);
    expect(offers.at(-1)).toBe(true);
    cleanup();
    renderWithProviders(<kind.Suggestion query="zzzz" slot="follow" onOffer={(on) => offers.push(on)} />);
    expect(offers.at(-1)).toBe(false);
  });

  it("offers no book for a word a title only shares", () => {
    itemsOf[BOOKS].push(book("Hornblower in the West Indies", "C. S. Forester"));
    try {
      suggestion("books", "west");
      expect(screen.queryByTestId("kind-suggestion-books")).toBeNull();
      cleanup();
      suggestion("books", "hornblower in the west");
      expect(screen.getByTestId("kind-suggestion-books")).toHaveTextContent("Hornblower in the West Indies");
    } finally {
      itemsOf[BOOKS].pop();
    }
  });

  it("offers the book its title names, saying what it is, opening its page", () => {
    suggestion("books", "dune");
    const row = screen.getByTestId("kind-suggestion-books");
    expect(row).toHaveTextContent("Dune");
    expect(row).toHaveTextContent("Frank Herbert");
    expect(row).toHaveTextContent("Book");
    expect(row).not.toHaveTextContent("Dune Messiah");
    expect(row.getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("offers no book for a name only in its byline", () => {
    const { container } = suggestion("books", "herbert");
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a group of places, when the words name one, opening the Places page for them", () => {
    suggestion("places", "cafe");
    const row = screen.getByTestId("kind-suggestion-places-group");
    expect(row).toHaveTextContent("Cafe places");
    expect(row).toHaveTextContent("4");
    expect(row.getAttribute("href")).toBe("/?q=cafe&t=places");
    expect(screen.queryByTestId("kind-suggestion-places")).toBeNull();
  });

  it("offers no place for a word its name only shares", () => {
    suggestion("places", "owl");
    expect(screen.queryByTestId("kind-suggestion-places")).toBeNull();
  });

  it("offers the place its name names, with a small pin when it has no photo", () => {
    suggestion("places", "pink ow");
    const row = screen.getByTestId("kind-suggestion-places");
    expect(row).toHaveTextContent("Pink Owl Coffee");
    expect(row.querySelector('[data-testid="kind-suggestion-pin"]')).not.toBeNull();
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
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    try {
      page("places", "");
      expect(screen.getByRole("button", { name: "Cafe 4" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Restaurant 2" })).toBeInTheDocument();
    } finally {
      itemsOf[PLACES].pop();
    }
    cleanup();
    const places = LIST_KINDS.find((k) => k.key === "places")!;
    renderWithProviders(<places.Preview query="coffee" slot="late" named={false} onSeeAll={() => {}} />);
    expect(screen.getByRole("button", { name: "See all 4 places" })).toBeInTheDocument();
  });
});

// Above People only when the words ask for it: they name the kind, or — for Places — a kind of
// place or a town several places are in. Otherwise below People, where a name is most often a person.
describe("where a preview sits on the Top page", () => {
  /** The one slot a preview sits in — and never two. */
  const sitsIn = (testId: string) => {
    const slots = (["lead", "follow", "late"] as const).filter(
      (slot) => !!within(screen.getByTestId(`slot-${slot}`)).queryByTestId(testId),
    );
    if (slots.length > 1) throw new Error(`${testId} sits in ${slots.join(" and ")}`);
    return slots[0] ?? null;
  };

  it("Books follow People unless the words name them", () => {
    preview("books", "dune");
    expect(sitsIn("kind-preview-books")).toBe("follow");
    cleanup();
    preview("books", "books dune", true);
    expect(sitsIn("kind-preview-books")).toBe("lead");
  });

  // A word a title only shares isn't a search for the book: "west" means people and news named West
  // first. Such books sit low on the page, by Media; most of a title's words find it after People.
  it("Books sit low when the words only share a word with titles, after People when they're most of one", () => {
    itemsOf[BOOKS].push(book("Hornblower in the West Indies", "C. S. Forester"));
    try {
      preview("books", "west");
      expect(sitsIn("kind-preview-books")).toBe("late");
      cleanup();
      preview("books", "hornblower west indies");
      expect(sitsIn("kind-preview-books")).toBe("follow");
      cleanup();
      // Articles don't count: "The Hobbit" is all "hobbit".
      preview("books", "hobbit");
      expect(sitsIn("kind-preview-books")).toBe("follow");
    } finally {
      itemsOf[BOOKS].pop();
    }
  });

  it(
    "Places lead for a kind of place, or a town several places are in (below a desktop)",
    belowDesktop(() => {
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
    }),
  );

  // As for books: a word a place's name only shares ("west" in Local Joe West) isn't a search for it,
  // so its places sit low, by Media; most of a name finds them right after People.
  it("Places sit low for a word only in their names, after People for most of a name", () => {
    preview("places", "owl");
    expect(sitsIn("kind-preview-places")).toBe("late");
    cleanup();
    preview("places", "pink owl coffee");
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
  it(
    "names the town in the Places preview (below a desktop)",
    belowDesktop(() => {
      itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
      try {
        const places = LIST_KINDS.find((k) => k.key === "places")!;
        renderWithProviders(<places.Preview query="sarasota" slot="lead" named={false} onSeeAll={() => {}} />);
        expect(screen.getByTestId("kind-preview-places")).toHaveTextContent("Places in Sarasota");
        expect(screen.getByRole("button", { name: "See all 2 places in Sarasota" })).toBeInTheDocument();
      } finally {
        itemsOf[PLACES].pop();
      }
    }),
  );
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

// A town search's map shows the town's upcoming events beside its places: the ones with a geohash
// near the places, in their own style, with a key. Others stay in the side panel's list.
describe("a town's events on its map", () => {
  const event = (id: string, title: string, g: string, start: number) => ({
    id,
    kind: 31923,
    pubkey: "e".repeat(64),
    created_at: 1,
    content: "",
    tags: [
      ["d", id],
      ["title", title],
      ["start", String(start)],
      ["g", g],
    ],
  });

  it(
    "pins the town's upcoming events near its places, and keys them (below a desktop)",
    belowDesktop(async () => {
      const soon = Math.floor(Date.now() / 1000) + 3600;
      townEvents.list = [
        event("near", "Meetup by the river", "9qbc3gy", soon),
        event("far", "Austin thing", "9v6kpy7", soon),
      ];
      itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
      try {
        const places = LIST_KINDS.find((k) => k.key === "places")!;
        renderWithProviders(<places.Preview query="sarasota" slot="lead" named={false} />);
        await waitFor(() =>
          expect(screen.getByTestId("places-map")).toHaveAttribute("data-events", "Meetup by the river"),
        );
        expect(townEvents.asked).toContain("Sarasota");
        expect(screen.getByTestId("places-map-key")).toHaveTextContent("Events");
      } finally {
        itemsOf[PLACES].pop();
        townEvents.list = [];
      }
    }),
  );

  it("asks for no events when the words name no town", () => {
    townEvents.asked = [];
    preview("places", "cafe");
    expect(townEvents.asked).toEqual([]);
  });
});

// The Places page reads like a map app's: how many places and how many are open, sortable, each
// row with its price and the ways to go there, and on a phone the map one tap away.
describe("the Places page, a map app's way", () => {
  it("says how many places the words found, in the town they name, and how many are open now", () => {
    const was = itemsOf[PLACES];
    vi.useFakeTimers({ now: new Date("2026-10-15T20:00:00Z"), toFake: ["Date"] });
    try {
      itemsOf[PLACES] = [
        place("Il Sole", "restaurant", "Sarasota", [["opening-hours", "Mo-Su 00:00-24:00"]]),
        place("Il Sole Two", "restaurant", "Sarasota", [["opening-hours", "Mo-Su 08:00-09:00"]]),
        place("Sun Cafe", "cafe", "Sarasota"),
      ];
      page("places", "sarasota");
      expect(screen.getByTestId("places-summary")).toHaveTextContent("3 places in Sarasota · 1 open now");
      cleanup();
      page("places", "cafe");
      expect(screen.getByTestId("places-summary")).toHaveTextContent(/^1 place$/);
    } finally {
      itemsOf[PLACES] = was;
      vi.useRealTimers();
    }
  });

  it("gives each row its price, the way the place's page says it", () => {
    const was = itemsOf[PLACES];
    try {
      itemsOf[PLACES] = [
        place("Il Sole", "restaurant", "Sarasota", [["price-range", "2"]]),
        place("Sun Cafe", "cafe", "Sarasota"),
      ];
      page("places", "");
      const rows = screen.getAllByTestId("kind-page-item");
      expect(within(rows[0]).getByTestId("place-row-price")).toHaveTextContent("$$");
      expect(within(rows[1]).queryByTestId("place-row-price")).toBeNull();
    } finally {
      itemsOf[PLACES] = was;
    }
  });

  it("offers each row's ways there: directions, a call, its website, when it has them", () => {
    const was = itemsOf[PLACES];
    try {
      itemsOf[PLACES] = [
        place("Il Sole", "restaurant", "Sarasota", [
          ["phone", "+1 (941) 555-0100"],
          ["website", "https://ilsole.example"],
        ]),
        place("Sun Cafe", "cafe", "Sarasota"),
      ];
      page("places", "");
      const [full, bare] = screen.getAllByTestId("kind-page-item");
      expect(within(full).getByRole("link", { name: "Directions" })).toHaveAttribute(
        "href",
        expect.stringContaining("38.2%2C-122.6"),
      );
      expect(within(full).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+19415550100");
      expect(within(full).getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://ilsole.example");
      expect(within(bare).getByRole("link", { name: "Directions" })).toBeInTheDocument();
      expect(within(bare).queryByRole("link", { name: "Call" })).toBeNull();
      expect(within(bare).queryByRole("link", { name: "Website" })).toBeNull();
    } finally {
      itemsOf[PLACES] = was;
    }
  });

  it("sorts by best match or by stars alone, once places have stars to sort by", async () => {
    const was = itemsOf[PLACES];
    vi.useFakeTimers({ now: new Date("2026-10-15T20:00:00Z"), toFake: ["Date"] });
    const one = place("One Review", "cafe", "Sarasota");
    const many = place("Many Reviews", "cafe", "Sarasota");
    const open = place("Open Late", "cafe", "Sarasota", [["opening-hours", "Mo-Su 00:00-24:00"]]);
    const addressOf = (i: typeof one) => `39999:${i.pubkey}:${i.tags.find((t) => t[0] === "d")![1]}`;
    const R = ["a1", "a2", "a3", "a4"].map((r) => r.repeat(32));
    // One five-star review against four that average 4.5: the damped score puts the four first,
    // the stars alone the one.
    ratings.reviews = new Map([
      [addressOf(one), [{ pubkey: R[0], rating: 5 }]],
      [addressOf(many), R.map((pubkey, i) => ({ pubkey, rating: i < 2 ? 5 : 4 }))],
    ]);
    ratings.ranks = new Map(R.map((r) => [r, 80]));
    const names = () => screen.getAllByTestId("kind-page-item").map((r) => r.querySelector("a")?.textContent);
    try {
      itemsOf[PLACES] = [open, one, many];
      page("places", "");
      await screen.findByText(/★ 5\.0/);
      expect(names()).toEqual(["Many Reviews", "One Review", "Open Late"]);
      fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "rated" } });
      expect(names()).toEqual(["One Review", "Many Reviews", "Open Late"]);
      expect(
        within(screen.getByRole("combobox", { name: "Sort" }))
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["Best match", "Top rated"]);
      cleanup();
      ratings.reviews = new Map();
      page("places", "");
      expect(screen.queryByRole("combobox", { name: "Sort" })).toBeNull();
    } finally {
      itemsOf[PLACES] = was;
      ratings.reviews = new Map();
      ratings.ranks = new Map();
      vi.useRealTimers();
    }
  });

  it("on a phone: the list, with the map one tap away and a card for each place on it", () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      page("places", "");
      expect(screen.queryByTestId("places-map")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Map" }));
      const map = screen.getByRole("dialog", { name: "Map of places" });
      expect(within(map).getByTestId("places-map")).toHaveAttribute("data-labels", "1,2,3,4,5");
      const cards = within(map).getAllByTestId("place-card");
      expect(cards).toHaveLength(5);
      fireEvent.click(within(map).getByRole("button", { name: "pin 3" }));
      expect(cards[2]).toHaveAttribute("data-highlighted", "true");
      expect(within(map).getByTestId("places-map")).toHaveAttribute("data-highlight", "3");
      fireEvent.click(within(map).getByRole("button", { name: "List" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getAllByTestId("kind-page-item")).toHaveLength(5);
    } finally {
      window.innerWidth = width;
    }
  });

  it("on a desktop: a tapped pin opens its place's card over the map, until it's closed", () => {
    page("places", "");
    const third = screen.getAllByTestId("kind-page-item")[2].querySelector("a")!.textContent!;
    expect(screen.queryByTestId("place-picked")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "pin 3" }));
    const card = screen.getByTestId("place-picked");
    expect(card).toHaveTextContent(third);
    expect(within(card).getByRole("link", { name: "Directions" })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("place-picked")).toBeNull();
  });
});

// A filter is offered only when it narrows the list: one that empties it, or keeps every place,
// is a dead end. A filter that's on says how many places it leaves, with a way back.
describe("the Places page's filters", () => {
  const at = (when: string) => vi.useFakeTimers({ now: new Date(when), toFake: ["Date"] });
  const withPlaces = (list: unknown[], run: () => void) => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = list;
    try {
      run();
    } finally {
      itemsOf[PLACES] = was;
      vi.useRealTimers();
    }
  };

  it("offers Open now, with how many are, only when some places are open and some aren't", () => {
    at("2026-10-15T20:00:00Z");
    withPlaces(
      [
        place("Always", "cafe", "Sarasota", [["opening-hours", "Mo-Su 00:00-24:00"]]),
        place("Mornings", "cafe", "Sarasota", [["opening-hours", "Mo-Su 08:00-09:00"]]),
        place("No Hours", "cafe", "Sarasota"),
      ],
      () => {
        page("places", "");
        expect(screen.getByRole("button", { name: "Open now 1" })).toBeInTheDocument();
      },
    );
    cleanup();
    at("2026-10-15T20:00:00Z");
    withPlaces(
      [
        place("Mornings", "cafe", "Sarasota", [["opening-hours", "Mo-Su 08:00-09:00"]]),
        place("No Hours", "cafe", "Sarasota"),
      ],
      () => {
        page("places", "");
        expect(screen.queryByRole("button", { name: /^Open now/ })).toBeNull();
      },
    );
  });

  it("offers the kinds of place that split the list — two or more, each of several places — with coffee as cafe", () => {
    withPlaces(
      [
        place("Bean", "cafe", "Sarasota"),
        place("Brew", "coffee", "Sarasota"),
        place("Cup", "cafe", "Sarasota"),
        place("Il Sole", "restaurant", "Sarasota"),
        place("Il Sole Two", "restaurant", "Sarasota"),
        place("Tap", "bar", "Sarasota"),
      ],
      () => {
        page("places", "");
        const chips = screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent);
        expect(chips).toEqual(["Cafe 3", "Restaurant 2"]);
      },
    );
    cleanup();
    // Four places of four kinds: a chip for each would leave one place, so none is offered.
    withPlaces(
      [
        place("Sweets", "confectionery", "Austin"),
        place("Tap", "bar", "Austin"),
        place("Bean", "cafe", "Austin"),
        place("Il Sole", "restaurant", "Austin"),
      ],
      () => {
        page("places", "");
        expect(screen.queryAllByRole("button", { pressed: false })).toEqual([]);
      },
    );
  });

  it("says how many places the filters leave, and clears them — from an empty result too", () => {
    at("2026-10-15T20:00:00Z");
    withPlaces(
      [
        place("Bean", "cafe", "Sarasota"),
        place("Brew", "cafe", "Sarasota"),
        place("Cup", "cafe", "Sarasota"),
        place("Il Sole", "restaurant", "Sarasota"),
        place("Il Sole Two", "restaurant", "Sarasota"),
        place("Tap", "bar", "Sarasota", [["opening-hours", "Mo-Su 00:00-24:00"]]),
      ],
      () => {
        page("places", "");
        const summary = screen.getByTestId("places-summary");
        expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Restaurant 2" }));
        expect(summary).toHaveTextContent(/^2 of 6 places/);
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(summary).toHaveTextContent(/^6 places/);
        expect(screen.getByRole("button", { name: "Restaurant 2" })).toHaveAttribute("aria-pressed", "false");

        fireEvent.click(screen.getByRole("button", { name: "Open now 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Cafe 3" }));
        expect(screen.getByText("No places match these filters.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(screen.getAllByTestId("kind-page-item")).toHaveLength(6);
      },
    );
  });

  it("says 60+ when the page shows only the first sixty places it found", () => {
    withPlaces(
      Array.from({ length: 61 }, (_, i) => place(`Cafe ${i}`, "cafe", "Sarasota")),
      () => {
        page("places", "");
        expect(screen.getByTestId("places-summary")).toHaveTextContent(/^60\+ places$/);
      },
    );
  });
});

// An event on a town's map is a way into the event: its pin opens a card that says what, when and
// where, and leads to the event's own page — as a place's pin opens the place's card.
describe("an event's pin on the Places page", () => {
  const START = Math.floor(Date.parse("2030-05-04T19:00:00Z") / 1000);
  const meetup = {
    id: "a".repeat(64),
    kind: 31923,
    pubkey: "e".repeat(64),
    created_at: 1,
    content: "",
    tags: [
      ["d", "river-meetup"],
      ["title", "Meetup by the river"],
      ["start", String(START)],
      ["g", "9qbc3gy"],
      ["location", "Riverside Park"],
    ],
  };

  it("opens the event's card: what, when, where, and the way to its page", async () => {
    townEvents.list = [meetup];
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    try {
      page("places", "sarasota");
      fireEvent.click(await screen.findByRole("button", { name: "event Meetup by the river" }));
      const card = screen.getByTestId("event-picked");
      expect(card).toHaveTextContent("Meetup by the river");
      expect(card).toHaveTextContent(/May.*2030/);
      expect(card).toHaveTextContent("Riverside Park");
      expect(within(card).getByRole("link", { name: "See event" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/e\/naddr1/),
      );
      // One card at a time: a place's pin takes its place, and Close puts it away.
      fireEvent.click(screen.getByRole("button", { name: "pin 1" }));
      expect(screen.queryByTestId("event-picked")).toBeNull();
      expect(screen.getByTestId("place-picked")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "event Meetup by the river" }));
      expect(screen.queryByTestId("place-picked")).toBeNull();
      fireEvent.click(within(screen.getByTestId("event-picked")).getByRole("button", { name: "Close" }));
      expect(screen.queryByTestId("event-picked")).toBeNull();
    } finally {
      itemsOf[PLACES].pop();
      townEvents.list = [];
    }
  });
});

// The Top page's little map is a glance, not a map to work: tapping it opens the Places page,
// where the map can be moved and zoomed.
describe("the Places preview's map", () => {
  it("opens the Places page when tapped", () => {
    const seeAll = vi.fn();
    const places = LIST_KINDS.find((k) => k.key === "places")!;
    renderWithProviders(<places.Preview query="coffee" slot="late" named={false} onSeeAll={seeAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the map" }));
    expect(seeAll).toHaveBeenCalledTimes(1);
  });
});

// Moving the map offers to search where it now shows: the words' places in that view, the town
// they named dropped — "cafe sarasota" panned to Lido Key finds Lido Key's cafes too.
describe("searching the map's area", () => {
  const sarasota = [
    place("Bean", "cafe", "Sarasota", [], ["27.33", "-82.53"]),
    place("Brew", "cafe", "Sarasota", [], ["27.34", "-82.54"]),
    place("Far Cup", "cafe", "Sarasota", [], ["27.50", "-82.60"]),
    place("Il Sole", "restaurant", "Sarasota", [], ["27.335", "-82.535"]),
    place("Lido Cafe", "cafe", "Lido Key", [], ["27.32", "-82.55"]),
  ];
  const names = () => screen.getAllByTestId("kind-page-item").map((r) => r.querySelector("a")?.textContent);

  it("offers Search this area once the map moves, and finds the words' places there", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    mapMove.view = { south: 27.3, west: -82.56, north: 27.36, east: -82.5 };
    try {
      page("places", "cafe sarasota");
      expect(names()).toEqual(["Bean", "Brew", "Far Cup"]);
      expect(screen.queryByRole("button", { name: "Search this area" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "move map" }));
      fireEvent.click(screen.getByRole("button", { name: "Search this area" }));
      expect(names().sort()).toEqual(["Bean", "Brew", "Lido Cafe"]);
      expect(screen.getByTestId("places-summary")).toHaveTextContent(/^3 places in this area/);
      expect(screen.queryByRole("button", { name: "Search this area" })).toBeNull();
      // The area is a filter like any other: its chip puts the town's search back.
      fireEvent.click(screen.getByRole("button", { name: "In this area" }));
      expect(names()).toEqual(["Bean", "Brew", "Far Cup"]);
    } finally {
      itemsOf[PLACES] = was;
    }
  });

  it("keeps the area in the link: a shared link opens on it, and Back returns to it", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    const AREA = "area=27.3000,-82.5600,27.3600,-82.5000";
    window.history.replaceState({}, "", `/?q=cafe+sarasota&t=places&${AREA}`);
    try {
      page("places", "cafe sarasota");
      expect(names().sort()).toEqual(["Bean", "Brew", "Lido Cafe"]);
      fireEvent.click(screen.getByRole("button", { name: "In this area" }));
      expect(window.location.search).not.toContain("area=");
      expect(names()).toEqual(["Bean", "Brew", "Far Cup"]);
      // Back: the link has the area again, and so does the page.
      act(() => {
        window.history.replaceState({}, "", `/?q=cafe+sarasota&t=places&${AREA}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(names().sort()).toEqual(["Bean", "Brew", "Lido Cafe"]);
      // Searching an area writes it to the link.
      fireEvent.click(screen.getByRole("button", { name: "In this area" }));
      mapMove.view = { south: 27.31, west: -82.555, north: 27.345, east: -82.52 };
      fireEvent.click(screen.getByRole("button", { name: "move map" }));
      fireEvent.click(screen.getByRole("button", { name: "Search this area" }));
      expect(window.location.search).toContain("area=27.3100,-82.5550,27.3450,-82.5200");
    } finally {
      itemsOf[PLACES] = was;
      window.history.replaceState({}, "", "/");
    }
  });

  it("pins the events in the area: asked for by its cells and the town, kept to those inside it", async () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    const soon = Math.floor(Date.now() / 1000) + 3600;
    const event = (id: string, title: string, g: string[]) => ({
      id: id.repeat(64),
      kind: 31923,
      pubkey: "e".repeat(64),
      created_at: 1,
      content: "",
      tags: [["d", id], ["title", title], ["start", String(soon)], ...g.map((h) => ["g", h])],
    });
    // One on the riverwalk inside the area, tagged at three precisions; one up the coast in St. Petersburg.
    townEvents.list = [
      event("a", "Riverwalk meetup", ["dhv73zr", "dhv73z", "dhv73"]),
      event("b", "St. Pete market", ["dhvn5"]),
    ];
    mapMove.view = { south: 27.3, west: -82.56, north: 27.36, east: -82.5 };
    try {
      page("places", "cafe sarasota");
      fireEvent.click(screen.getByRole("button", { name: "move map" }));
      fireEvent.click(screen.getByRole("button", { name: "Search this area" }));
      await waitFor(() => expect(screen.getByTestId("places-map")).toHaveAttribute("data-events", "Riverwalk meetup"));
      expect(townEvents.areaAsked.at(-1)).toEqual({ cells: ["dhv73", "dhv76", "dhv79", "dhv7d"], town: "Sarasota" });
    } finally {
      itemsOf[PLACES] = was;
      townEvents.list = [];
      window.history.replaceState({}, "", "/");
    }
  });

  it("drops the area when the words change: it belonged to the search before", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    window.history.replaceState({}, "", "/?q=cafe+sarasota&t=places&area=27.3000,-82.5600,27.3600,-82.5000");
    try {
      const places = LIST_KINDS.find((k) => k.key === "places")!;
      const { rerender } = page("places", "cafe sarasota");
      expect(screen.getByRole("button", { name: "In this area" })).toBeInTheDocument();
      // A new search writes its own link, with no area in it.
      window.history.replaceState({}, "", "/?q=restaurant+sarasota&t=places");
      rerender(<places.Page query="restaurant sarasota" />);
      expect(screen.queryByRole("button", { name: "In this area" })).toBeNull();
      expect(names()).toEqual(["Il Sole"]);
    } finally {
      itemsOf[PLACES] = was;
      window.history.replaceState({}, "", "/");
    }
  });

  it("finds a place in the area wherever it sits in the list, past the first five hundred", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = [
      ...Array.from({ length: 501 }, (_, i) => place(`Far ${i}`, "cafe", "Tampa", [], ["27.95", "-82.46"])),
      place("Bean", "cafe", "Sarasota", [], ["27.33", "-82.53"]),
    ];
    // No words left to match ("austin" panned away from is the town, dropped): the area alone decides.
    window.history.replaceState({}, "", "/?t=places&area=27.3000,-82.5600,27.3600,-82.5000");
    try {
      page("places", "");
      expect(names()).toEqual(["Bean"]);
    } finally {
      itemsOf[PLACES] = was;
      window.history.replaceState({}, "", "/");
    }
  });
});

// A town is a thing the search is about, so on a desktop its places lead the side panel, Google's
// way: a map with the places and events, the top three, and See all. Phones keep them in the
// results, where the folded panel would hide them, and a kind of place stays in the results too.
describe("a town's places in the side panel", () => {
  const panel = (query: string, onSeeAll = () => {}) => {
    const Panel = LIST_KINDS.find((k) => k.key === "places")!.Panel!;
    return renderWithProviders(<Panel query={query} onSeeAll={onSeeAll} />);
  };

  it("leads with a map, the top three places and See all, for a town on a desktop", () => {
    itemsOf[PLACES].push(
      place("Il Sole Two", "restaurant", "Sarasota"),
      place("Il Sole Three", "cafe", "Sarasota"),
      place("Il Sole Four", "bar", "Sarasota"),
    );
    const seeAll = vi.fn();
    try {
      panel("sarasota", seeAll);
      const card = screen.getByTestId("panel-places");
      expect(card).toHaveTextContent("Places in Sarasota");
      expect(within(card).getByTestId("places-map")).toBeInTheDocument();
      expect(within(card).getAllByTestId("kind-preview-row")).toHaveLength(3);
      fireEvent.click(within(card).getByRole("button", { name: "See all 4 places in Sarasota" }));
      expect(seeAll).toHaveBeenCalledTimes(1);
    } finally {
      itemsOf[PLACES].splice(-3);
    }
  });

  it("shows nothing for a kind of place, which leads the results instead, nor on a phone", () => {
    panel("cafe");
    expect(screen.queryByTestId("panel-places")).toBeNull();
    cleanup();
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      panel("sarasota");
      expect(screen.queryByTestId("panel-places")).toBeNull();
    } finally {
      window.innerWidth = width;
      itemsOf[PLACES].pop();
    }
  });

  it("leaves a town's places to the panel on a desktop, and keeps them in the results on a phone", () => {
    itemsOf[PLACES].push(place("Il Sole Two", "restaurant", "Sarasota"));
    const width = window.innerWidth;
    try {
      preview("places", "sarasota");
      expect(screen.queryByTestId("kind-preview-places")).toBeNull();
      cleanup();
      window.innerWidth = 390;
      preview("places", "sarasota");
      expect(within(screen.getByTestId("slot-lead")).getByTestId("kind-preview-places")).toBeInTheDocument();
      cleanup();
      // A kind of place is a local pack in the results, on a desktop too.
      window.innerWidth = width;
      preview("places", "cafe");
      expect(within(screen.getByTestId("slot-lead")).getByTestId("kind-preview-places")).toBeInTheDocument();
    } finally {
      window.innerWidth = width;
      itemsOf[PLACES].pop();
    }
  });
});

// Fixes from the review: the map belongs to the search, not to whatever the filters leave; the
// offer to search the area goes once the map moves for the reader; the phone's map is a dialog.
describe("the Places map, held steady", () => {
  const sarasota = [
    place("Bean", "cafe", "Sarasota", [["opening-hours", "Mo-Su 08:00-09:00"]], ["27.33", "-82.53"]),
    place("Brew", "cafe", "Sarasota", [], ["27.34", "-82.54"]),
    place("Il Sole", "restaurant", "Sarasota", [["opening-hours", "Mo-Su 00:00-24:00"]], ["27.335", "-82.535"]),
    place("Il Sole Two", "restaurant", "Sarasota", [], ["27.336", "-82.536"]),
  ];

  it("keeps the map when the filters leave no place on it", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    vi.useFakeTimers({ now: new Date("2026-10-15T20:00:00Z"), toFake: ["Date"] });
    try {
      page("places", "sarasota");
      fireEvent.click(screen.getByRole("button", { name: "Open now 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Cafe 2" }));
      expect(screen.getByText("No places match these filters.")).toBeInTheDocument();
      expect(screen.getByTestId("places-map")).toBeInTheDocument();
    } finally {
      itemsOf[PLACES] = was;
      vi.useRealTimers();
    }
  });

  it("withdraws Search this area once the map moves for the reader: a filter, or Back", () => {
    const was = itemsOf[PLACES];
    itemsOf[PLACES] = sarasota;
    mapMove.view = { south: 27.3, west: -82.56, north: 27.36, east: -82.5 };
    try {
      page("places", "sarasota");
      fireEvent.click(screen.getByRole("button", { name: "move map" }));
      // A filter frames its places: the area offered is no longer the one shown.
      fireEvent.click(screen.getByRole("button", { name: "Cafe 2" }));
      expect(screen.queryByRole("button", { name: "Search this area" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "move map" }));
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(screen.queryByRole("button", { name: "Search this area" })).toBeNull();
    } finally {
      itemsOf[PLACES] = was;
      window.history.replaceState({}, "", "/");
    }
  });

  it("on a phone, the map is a dialog: it takes focus, Escape closes it, and focus returns to Map", () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      page("places", "");
      fireEvent.click(screen.getByRole("button", { name: "Map" }));
      const dialog = screen.getByRole("dialog", { name: "Map of places" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Map" }));
    } finally {
      window.innerWidth = width;
    }
  });
});

// A GitHub account and a person the dropdown shows are one row only on proof (lib/githubLink): the
// GitHub profile names their npub, its website is their verified handle's domain, a gist proves
// their claim, or their verified root handle is on the domain named for the account. Never a name.
describe("one person, one row", () => {
  const OWNER = "a1".repeat(32);
  const github = (people?: { pubkey: string; nip05?: string }[]) => {
    const kind = LIST_KINDS.find((k) => k.key === "github")!;
    return renderWithProviders(<kind.Suggestion query="riverdev" slot="follow" people={people} />);
  };
  const domainAnswers = (names: Record<string, string> | null) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        names
          ? new Response(JSON.stringify({ names }), { status: 200 })
          : Promise.reject(new TypeError("Failed to fetch")),
      ),
    );
  const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetNip05Cache();
    githubEvidence.of = {};
  });

  it("leaves the account to its owner's row when both sides agree: GitHub names their npub, their profile names the account", async () => {
    githubEvidence.of = { riverdev: { named: [OWNER], blogHost: null, provenClaimants: [] } };
    github([{ pubkey: OWNER, website: "https://github.com/riverdev" }]);
    await waitFor(() => expect(screen.queryByTestId("kind-suggestion-github")).toBeNull());
  });

  // A GitHub profile's owner alone writes it: naming someone's npub doesn't make the account theirs.
  it("keeps the account's own row when only the GitHub side says so", async () => {
    githubEvidence.of = { riverdev: { named: [OWNER], blogHost: null, provenClaimants: [] } };
    github([{ pubkey: OWNER }]);
    await settle();
    await settle();
    expect(screen.getByTestId("kind-suggestion-github")).toBeInTheDocument();
  });

  it("leaves it to a verified root handle on the domain named for it", async () => {
    domainAnswers({ _: OWNER });
    github([{ pubkey: OWNER, nip05: "_@riverdev.com" }]);
    await waitFor(() => expect(screen.queryByTestId("kind-suggestion-github")).toBeNull());
  });

  it("offers the account while nothing proves it: an unverified handle, or a name alike", async () => {
    domainAnswers(null);
    github([{ pubkey: OWNER, nip05: "_@riverdev.com" }]);
    await settle();
    expect(screen.getByTestId("kind-suggestion-github")).toHaveTextContent("riverdev");
    cleanup();
    github([{ pubkey: OWNER, nip05: "riverdev@nostr.example" }]);
    await settle();
    expect(screen.getByTestId("kind-suggestion-github")).toBeInTheDocument();
  });

  // The mark beside the person's name, on the same proof.
  it("marks the owner once proven: a verified root handle, or GitHub and their profile naming each other", async () => {
    const Mark = LIST_KINDS.find((k) => k.key === "github")!.PersonMark!;
    domainAnswers({ _: OWNER });
    renderWithProviders(<Mark pubkey={OWNER} nip05="_@riverdev.com" />);
    const mark = await screen.findByRole("link", { name: "riverdev on GitHub" });
    expect(mark).toHaveAttribute("href", expect.stringMatching(/^\/e\/naddr1/));
    cleanup();
    githubEvidence.of = { lakebuilder: { named: ["b2".repeat(32)], blogHost: null, provenClaimants: [] } };
    renderWithProviders(<Mark pubkey={"b2".repeat(32)} website="github.com/lakebuilder" />);
    expect(await screen.findByRole("link", { name: "lakebuilder on GitHub" })).toBeInTheDocument();
  });

  it("marks no one on a claim alone", async () => {
    const Mark = LIST_KINDS.find((k) => k.key === "github")!.PersonMark!;
    domainAnswers({ _: "c3".repeat(32) });
    renderWithProviders(<Mark pubkey={OWNER} nip05="_@riverdev.com" />);
    await settle();
    expect(screen.queryByRole("link", { name: "riverdev on GitHub" })).toBeNull();
  });
});

// On the Top page the people and notes the words find come first: a preview's lookups for its rows'
// order — who recommends each, its stars — wait until the search's own results have answered, so
// they never queue in front of them at the relay (hooks/useSearchPriority).
describe("a preview's lookups wait for the search's own results", () => {
  const coffee = (answered: boolean) => {
    const places = LIST_KINDS.find((k) => k.key === "places")!;
    return renderWithProviders(
      <SearchPriorityContext.Provider value={answered}>
        <places.Preview query="coffee" slot="late" named={false} />
      </SearchPriorityContext.Provider>,
    );
  };

  it("asks nothing about recommendations or stars while the search's own results are pending", async () => {
    trust.asked = 0;
    ratings.asked = 0;
    coffee(false);
    expect(screen.getByTestId("kind-preview-places")).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(trust.asked).toBe(0);
    expect(ratings.asked).toBe(0);
  });

  it("asks once they have answered", async () => {
    trust.asked = 0;
    ratings.asked = 0;
    coffee(true);
    await waitFor(() => expect(trust.asked).toBeGreaterThan(0));
    await waitFor(() => expect(ratings.asked).toBeGreaterThan(0));
  });
});
