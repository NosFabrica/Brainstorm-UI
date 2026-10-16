// @vitest-environment jsdom
/**
 * A book on its own page, the tier-three way (ADR 0007): the cover, the
 * title and the author lead, as in a bookshop; what Open Library adds —
 * subtitle, rating, publisher, description — arrives from our origin and
 * is never needed; the buttons are the definition's templates. The item's
 * fields are read through the governing definition, and while the
 * community header declares none, by their Open Library names (lib/books).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import { useResolvedItemView, isReady } from "@/hooks/useItemView";

const { COMMUNITY, OL_TEMPLATE, GOODREADS_TEMPLATE, SHOP_TEMPLATE } = vi.hoisted(() => ({
  COMMUNITY: "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books",
  OL_TEMPLATE: "a".repeat(64),
  GOODREADS_TEMPLATE: "8382b369db6f7d3dc96be27513609a61491f33c2afcc6f7c005c8bd7cc190c83",
  SHOP_TEMPLATE: "c".repeat(64),
}));
const LIBRARIAN = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const HOUSE = "3".repeat(64);

const viewer = vi.hoisted(() => ({ isAdmin: false, pubkey: null as string | null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (viewer.pubkey ? { isAdmin: viewer.isAdmin, pubkey: viewer.pubkey } : null),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({
    data: new Map([
      [
        OL_TEMPLATE,
        {
          id: OL_TEMPLATE,
          pubkey: "2".repeat(64),
          name: "Open Library work",
          template: "https://openlibrary.org/works/{id}",
        },
      ],
      [
        GOODREADS_TEMPLATE,
        {
          id: GOODREADS_TEMPLATE,
          pubkey: "2".repeat(64),
          name: "Goodreads book",
          template: "https://www.goodreads.com/book/isbn/{isbn10}",
        },
      ],
      [
        SHOP_TEMPLATE,
        {
          id: SHOP_TEMPLATE,
          pubkey: "2".repeat(64),
          name: "Buy on Amazon",
          template: "https://www.amazon.com/dp/{isbn10}",
        },
      ],
    ]),
  }),
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));
// The list the book is on (DListItemNeighbours' read): empty unless a test fills it.
const list = vi.hoisted(() => ({ items: [] as { id: string; pubkey: string; kind: number; tags: string[][] }[] }));
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
  useListItems: () => ({ items: list.items, pending: false, coordinate: COMMUNITY }),
}));
vi.mock("@/hooks/useItemEngagement", () => ({
  useItemEngagement: () => ({ endorsers: [], claimants: [], pending: false }),
  useEndorseItem: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWotItems", () => ({
  useWotItems: (items: { pubkey: string }[]) => ({
    trusted: items,
    outside: [],
    pending: false,
    source: "house",
    observer: "house",
  }),
}));
vi.mock("@/hooks/useMyFollows", () => ({ useMyFollows: () => ({ follows: new Set(), ready: true, signedIn: false }) }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useProfileMap", () => ({ useProfileMap: () => new Map() }));
// Reviews of the book (hooks/useBookReviews — signed comments with stars).
const reviews = vi.hoisted(() => ({
  list: [] as {
    id: string;
    pubkey: string;
    at: number;
    text: string;
    photos: string[];
    price: null;
    paid: null;
    rating: number | null;
  }[],
  post: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/useBookReviews", () => ({
  useBookReviews: () => ({ reviews: reviews.list, pending: false }),
  usePostBookReview: () => reviews.post,
}));
// What our origin knows from Open Library (services/openLibrary); nothing unless a test says so.
const openLibrary = vi.hoisted(() => ({ facts: null as null | Record<string, unknown>, pending: false }));
vi.mock("@/hooks/useBookFacts", () => ({
  useBookFacts: () => ({ data: openLibrary.facts, isPending: openLibrary.pending }),
}));

import { BookView } from "./BookView";

/** The community header as on the relay: a name and nothing declared. */
const community: HeaderEvent = {
  id: "1".repeat(64),
  pubkey: LIBRARIAN,
  kind: 39998,
  created_at: 1,
  tags: [["d", "books"]],
};
/** The drafted house copy (docs/dictionary/house-copies.md), with its three templates. */
const houseCopy: HeaderEvent = {
  id: "2".repeat(64),
  pubkey: HOUSE,
  kind: 39998,
  created_at: 2,
  tags: [
    ["d", "books"],
    ["names", "Book", "Books"],
    ["required", "title"],
    ["recommended", "author"],
    ["recommended", "cover", "Cover image"],
    ["recommended", "isbn", "ISBN-13"],
    ["optional", "isbn10"],
    ["optional", "open-library-id"],
    ["optional", "year"],
    ["optional", "pages"],
    ["optional", "lang"],
    ["optional", "subject"],
    ["optional", "format"],
    ["optional", "source"],
    ["field-type", "cover", "url"],
    ["display", "title", "title"],
    ["display", "summary", "author"],
    ["display", "image", "cover"],
    ["link", OL_TEMPLATE, "wss://dcosl.brainstorm.world", "id", "open-library-id"],
    ["link", GOODREADS_TEMPLATE, "wss://dcosl.brainstorm.world", "isbn10", "isbn10"],
    ["link", SHOP_TEMPLATE, "wss://dcosl.brainstorm.world", "isbn10", "isbn10"],
    ["b", COMMUNITY, "pointer"],
  ],
};
const storm = {
  id: "86d5762bf1feb9172308a4871398498fe232c6eec02ea0a5ab91cc24baff7adf",
  pubkey: LIBRARIAN,
  kind: 39999,
  created_at: 1_780_000_000,
  content: "",
  tags: [
    ["d", "ol-ol19722168w"],
    ["z", COMMUNITY],
    ["title", "The storm before the storm"],
    ["author", "Duncan, Michael (Podcaster)"],
    ["isbn", "9781610397216"],
    ["isbn10", "1549167774"],
    ["open-library-id", "OL19722168W"],
    ["lang", "eng"],
    ["year", "2017"],
    ["pages", "327"],
    ["cover", "https://covers.openlibrary.org/b/id/10092515-L.jpg"],
    ["subject", "History"],
    ["subject", "nyt:combined-print-and-e-book-nonfiction=2017-11-12"],
    ["subject", "Roman Empire"],
    ["format", "reference"],
    ["source", "openlibrary"],
  ],
};

function Page({ event, copy = null }: { event: typeof storm; copy?: HeaderEvent | null }) {
  const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: copy });
  const view = useResolvedItemView(event, resolved);
  if (!isReady(view)) return <p>not ready</p>;
  return <BookView event={event} view={view} />;
}

const FACTS = {
  subtitle: "the beginning of the end of the Roman Republic",
  description: "The creator of the award-winning podcast series The History of Rome brings to life the bloody battles.",
  publisher: "PublicAffairs",
  publishDate: "2017",
  pages: 327,
  rating: { average: 4.714285714285714, count: 7 },
  read: null,
};

beforeEach(() => {
  viewer.isAdmin = false;
  viewer.pubkey = null;
  openLibrary.facts = null;
  openLibrary.pending = false;
  reviews.list = [];
  reviews.post.mutate.mockClear();
  list.items = [];
});

describe("BookView", () => {
  it("leads with the cover, the title and the author, as in a bookshop — from the item, before anything is asked", () => {
    renderWithProviders(<Page event={storm} />);
    const hero = screen.getByTestId("book-hero");
    expect(within(hero).getByTestId("book-cover")).toHaveAttribute("src", expect.stringContaining("10092515-L.jpg"));
    expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent("The storm before the storm");
    expect(within(hero).getByTestId("book-author")).toHaveTextContent("Michael Duncan");
    expect(within(hero).getByTestId("book-meta")).toHaveTextContent("2017 · 327 pages · English");
    expect(screen.getByTestId("book-subjects")).toHaveTextContent("History · Roman Empire");
    expect(screen.getByTestId("book-subjects")).not.toHaveTextContent("nyt:");
    expect(screen.queryByTestId("book-subjects-more")).toBeNull();
    expect(screen.queryByTestId("book-rating")).toBeNull();
    expect(screen.queryByTestId("book-description")).toBeNull();
    // Not signed in: no "you" to trust, so the line speaks of recommendations.
    expect(screen.getByTestId("book-trust-line")).toHaveTextContent("No recommendations yet · No reviews yet");
    // Nothing for a reader to open: the community header names no template.
    expect(screen.queryByTestId("book-actions")).toBeNull();
    expect(screen.getByTestId("neighbours-slot")).toBeInTheDocument();
    expect(screen.getByTestId("book-attribution")).toHaveTextContent("Open Library");
  });

  it("what Open Library adds: the subtitle, readers' rating, the publisher, and the book's description", () => {
    openLibrary.facts = FACTS;
    renderWithProviders(<Page event={storm} />);
    expect(screen.getByTestId("book-subtitle")).toHaveTextContent("the beginning of the end of the Roman Republic");
    const rating = screen.getByTestId("book-rating");
    expect(rating).toHaveTextContent("4.7");
    expect(rating).toHaveTextContent("7 ratings");
    expect(rating).toHaveAttribute("aria-label", "Rated 4.7 out of 5 by 7 readers on Open Library");
    expect(screen.getByTestId("book-meta")).toHaveTextContent("2017 · 327 pages · English · PublicAffairs");
    expect(screen.getByTestId("book-description")).toHaveTextContent("brings to life the bloody battles");
  });

  it("the buttons are the definition's templates: read it, see reviews, buy it", () => {
    renderWithProviders(<Page event={storm} copy={houseCopy} />);
    const actions = screen.getByTestId("book-actions");
    const buttons = within(actions).getAllByRole("link");
    expect(buttons.map((b) => b.textContent)).toEqual(["Open Library work", "Goodreads book", "Buy on Amazon"]);
    expect(buttons[0]).toHaveAttribute("href", "https://openlibrary.org/works/OL19722168W");
    expect(buttons[2]).toHaveAttribute("href", "https://www.amazon.com/dp/1549167774");
    expect(buttons[0]).toHaveAttribute("target", "_blank");
  });

  it("readers see the book; the concept kicker and the field fold are the admin's", () => {
    renderWithProviders(<Page event={storm} copy={houseCopy} />);
    expect(screen.queryByTestId("dlist-item-admin-toggle")).toBeNull();
    expect(screen.queryByText(/^Book$/)).toBeNull();
    viewer.pubkey = "f".repeat(64);
    viewer.isAdmin = true;
    renderWithProviders(<Page event={storm} copy={houseCopy} />);
    expect(screen.getByTestId("dlist-item-admin-toggle")).toBeInTheDocument();
  });
});

describe("reviews from people you trust", () => {
  const review = (pubkey: string, rating: number | null, text: string) => ({
    id: pubkey.slice(0, 4).padEnd(64, "0"),
    pubkey,
    at: 1_780_000_000,
    text,
    photos: [],
    price: null as null,
    paid: null as null,
    rating,
  });

  it("each review shows its stars, and the hero sums them up beside the vouches", () => {
    reviews.list = [
      review("a".repeat(64), 5, "Gripping from the first page."),
      review("b".repeat(64), 4, "Dense but worth it."),
    ];
    renderWithProviders(<Page event={storm} />);
    const section = screen.getByTestId("book-reviews");
    const rows = within(section).getAllByTestId("book-review");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("book-review-stars")).toHaveAttribute("aria-label", "5 out of 5 stars");
    expect(rows[0]).toHaveTextContent("Gripping from the first page.");
    expect(screen.getByTestId("book-trust-line")).toHaveTextContent("Rated 4.5 by 2 people · 2 reviews");
    // Not signed in: no composer, a word about signing in.
    expect(screen.queryByTestId("book-review-composer")).toBeNull();
  });

  it("a signed-in reader rates it with five stars and a few words, and the post carries both", async () => {
    viewer.pubkey = "f".repeat(64);
    renderWithProviders(<Page event={storm} />);
    const composer = screen.getByTestId("book-review-composer");
    await userEvent.click(within(composer).getByRole("button", { name: "4 stars" }));
    await userEvent.type(within(composer).getByRole("textbox"), "Dense but worth it.");
    await userEvent.click(within(composer).getByRole("button", { name: "Post review" }));
    expect(reviews.post.mutate).toHaveBeenCalledWith(
      { text: "Dense but worth it.", rating: 4, price: null, paid: null, photos: [] },
      expect.anything(),
    );
  });
});

describe("a book is recommended, not vouched for", () => {
  it("the section and the hero speak of recommending; the button recommends", () => {
    viewer.pubkey = "f".repeat(64);
    renderWithProviders(<Page event={storm} />);
    const verdict = screen.getByTestId("book-verdict");
    expect(verdict).toHaveTextContent("Recommended by");
    expect(verdict).not.toHaveTextContent(/vouch/i);
    expect(within(verdict).getByTestId("book-endorse")).toHaveTextContent("Recommend");
    expect(screen.getByTestId("book-trust-line")).toHaveTextContent("No one you trust has recommended it yet");
    expect(screen.getByTestId("book-trust-line")).toHaveTextContent("No reviews yet");
  });

  it("stars alone count as a rating, words as a review, and the hero counts them apart", () => {
    reviews.list = [
      {
        id: "1".padEnd(64, "0"),
        pubkey: "a".repeat(64),
        at: 1,
        text: "",
        photos: [],
        price: null,
        paid: null,
        rating: 5,
      },
      {
        id: "2".padEnd(64, "0"),
        pubkey: "b".repeat(64),
        at: 2,
        text: "Dense but worth it.",
        photos: [],
        price: null,
        paid: null,
        rating: 3,
      },
    ];
    renderWithProviders(<Page event={storm} />);
    expect(screen.getByTestId("book-trust-line")).toHaveTextContent("Rated 4.0 by 2 people · 1 review");
  });

  it("the book first, then the people: About and the subjects sit above who recommends it", () => {
    openLibrary.facts = FACTS;
    renderWithProviders(<Page event={storm} />);
    const about = screen.getByTestId("book-description");
    const subjects = screen.getByTestId("book-subjects");
    const verdict = screen.getByTestId("book-verdict");
    expect(about.compareDocumentPosition(subjects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subjects.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("reading it", () => {
  it("a public-domain scan: a quiet Read on Internet Archive button that opens there in a new window, first among the buttons", () => {
    openLibrary.facts = {
      ...FACTS,
      read: {
        kind: "full",
        url: "https://archive.org/details/stormbeforestorm00dunc",
        ocaid: "stormbeforestorm00dunc",
      },
    };
    renderWithProviders(<Page event={storm} copy={houseCopy} />);
    const actions = screen.getByTestId("book-actions");
    const read = within(actions).getByRole("link", { name: /Read on Internet Archive/ });
    expect(actions.firstElementChild).toBe(read);
    expect(read).toHaveAttribute("href", "https://archive.org/details/stormbeforestorm00dunc");
    expect(read).toHaveAttribute("target", "_blank");
    expect(read.className).not.toMatch(/bg-brand-primary/);
    expect(screen.queryByTestId("book-reader")).toBeNull();
  });

  it("a scan that can only be borrowed is the same quiet button, worded Borrow; a book with no scan has neither", () => {
    openLibrary.facts = {
      ...FACTS,
      read: {
        kind: "restricted",
        url: "https://archive.org/details/stormbeforestorm00dunc",
        ocaid: "stormbeforestorm00dunc",
      },
    };
    renderWithProviders(<Page event={storm} />);
    const borrow = within(screen.getByTestId("book-actions")).getByRole("link", { name: /Borrow on Internet Archive/ });
    expect(borrow).toHaveAttribute("href", "https://archive.org/details/stormbeforestorm00dunc");
    expect(borrow).toHaveAttribute("target", "_blank");
    expect(borrow.className).not.toMatch(/bg-brand-primary/);
    expect(screen.queryByText(/Read on Internet Archive/)).toBeNull();
  });
});

describe("more from the list", () => {
  const other = (id: string, fields: string[][]) => ({
    ...storm,
    id: id.padEnd(64, "0"),
    tags: [["d", id], ["z", COMMUNITY], ...fields],
  });
  const hero = other("hero", [
    ["title", "Hero of Two Worlds"],
    ["author", "Duncan, Michael (Podcaster)"],
    ["cover", "https://covers.openlibrary.org/b/id/1-L.jpg"],
  ]);
  const rubicon = other("rubicon", [
    ["title", "Rubicon"],
    ["author", "Tom Holland"],
    ["subject", "Roman Empire"],
  ]);
  const cats = other("cats", [
    ["title", "Kaspar"],
    ["author", "Michael Morpurgo"],
    ["subject", "Cats"],
  ]);

  it("more by this author and books sharing its subjects, each a shelf of covers; the author's name leads to the shelf", () => {
    list.items = [storm, hero, rubicon, cats];
    renderWithProviders(<Page event={storm} />);
    const byAuthor = screen.getByTestId("book-by-author");
    expect(byAuthor).toHaveTextContent("More by Michael Duncan");
    expect(
      within(byAuthor)
        .getAllByTestId("book-shelf-item")
        .map((el) => el.textContent),
    ).toEqual(["Hero of Two Worlds"]);
    const similar = screen.getByTestId("book-similar");
    expect(similar).toHaveTextContent("If you liked this");
    expect(
      within(similar)
        .getAllByTestId("book-shelf-item")
        .map((el) => el.textContent),
    ).toEqual(["Rubicon"]);
    expect(screen.queryByText("Kaspar")).toBeNull();
    expect(within(screen.getByTestId("book-author")).getByRole("link")).toHaveAttribute("href", "#book-by-author");
  });

  it("with nothing else on the list, neither shelf, and the author's name is plain", () => {
    renderWithProviders(<Page event={storm} />);
    expect(screen.queryByTestId("book-by-author")).toBeNull();
    expect(screen.queryByTestId("book-similar")).toBeNull();
    expect(within(screen.getByTestId("book-author")).queryByRole("link")).toBeNull();
  });
});

describe("subjects, quietly", () => {
  it("a few on one muted line, the rest behind a count the reader can open", async () => {
    const many = {
      ...storm,
      tags: [
        ...storm.tags.filter((t) => t[0] !== "subject"),
        ["subject", "History of the middle east"],
        ["subject", "Criminology and law enforcement"],
        ["subject", "Intelligence service, israel"],
        ["subject", "Israel, politics and government"],
        ["subject", "Intelligence service"],
        ["subject", "History"],
        ["subject", "Politics and government"],
        ["subject", "Israel"],
      ],
    };
    renderWithProviders(<Page event={many} />);
    const line = screen.getByTestId("book-subjects");
    expect(line).toHaveTextContent("Israel · History · Intelligence service · Politics and government");
    expect(line).not.toHaveTextContent("Criminology");
    const more = screen.getByTestId("book-subjects-more");
    expect(more).toHaveTextContent("+4 more");
    await userEvent.click(more);
    expect(line).toHaveTextContent("Criminology and law enforcement");
    // And back: the same quiet control, now reading "Show less".
    const less = screen.getByTestId("book-subjects-less");
    expect(less).toHaveTextContent("Show less");
    expect(less.className).toBe(more.className);
    await userEvent.click(less);
    expect(line).not.toHaveTextContent("Criminology");
    expect(screen.getByTestId("book-subjects-more")).toHaveTextContent("+4 more");
  });
});

describe("while Open Library answers", () => {
  it("holds a quiet placeholder where the rating will go, so the hero doesn't jump when it lands", () => {
    openLibrary.pending = true;
    renderWithProviders(<Page event={storm} />);
    expect(screen.getByTestId("book-facts-pending")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("book-rating")).toBeNull();
  });

  it("and once answered — or silent — the placeholder is gone", () => {
    openLibrary.facts = FACTS;
    renderWithProviders(<Page event={storm} />);
    expect(screen.queryByTestId("book-facts-pending")).toBeNull();
    expect(screen.getByTestId("book-rating")).toBeInTheDocument();
  });
});
