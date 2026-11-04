// @vitest-environment jsdom
/**
 * NKBIP-01 publications on the article reader: a kind-30040 index reads as a
 * book — cover, contents, every chapter's text — and a kind-30041 section
 * reads on its own, with its book above it and its neighbours below. The
 * events are Alexandria's United States Constitution, as published.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import { __resetNearViewport } from "@/hooks/useNearViewport";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

const PK = "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319";
const BOOK = "the-united-states-constitution-and-the-bill-of-rights";
const CONST = `${BOOK}-the-constitution-of-the-united-states-of-america-1787`;
const ART4 = `${CONST}-article-four`;

type Ev = {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
};
const ev = (n: number, kind: number, d: string, tags: string[][], content = ""): Ev => ({
  id: n.toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: 1793383185,
  content,
  tags: [["d", d], ...tags],
  sig: "",
});
const a = (kind: number, d: string) => ["a", `${kind}:${PK}:${d}`, ""];

const root = ev(1, 30040, BOOK, [
  ["title", "The United States Constitution and The Bill of Rights"],
  ["author", "United States"],
  ["published_on", "15.12.1791"],
  ["summary", "Constitution of the United States\n\nBill of Rights"],
  ["image", "https://www.gutenberg.org/cache/epub/5/pg5.cover.medium.jpg"],
  ["type", "document"],
  ["version", "1st version"],
  ["t", "law"],
  a(30040, CONST),
  a(30040, `${BOOK}-the-united-states-bill-of-rights`),
]);
const constitution = ev(2, 30040, CONST, [
  ["title", "THE CONSTITUTION OF THE UNITED STATES OF AMERICA, 1787"],
  a(30041, `${CONST}-preamble`),
  a(30040, ART4),
]);
const preamble = ev(3, 30041, `${CONST}-preamble`, [["title", "Preamble"]], "We the People of the United States");
const article4 = ev(4, 30040, ART4, [
  ["title", "ARTICLE FOUR"],
  a(30041, `${ART4}-section-2`),
  a(30041, `${ART4}-section-3`),
  a(30041, `${ART4}-section-4`),
]);
const section3 = ev(
  5,
  30041,
  `${ART4}-section-3`,
  [
    ["title", "Section 3"],
    ["m", "text/asciidoc"],
  ],
  "New States may be admitted by the Congress into this Union;\nbut no new States shall be formed or erected within the Jurisdiction\nof any other State.",
);
// A book of 13 parts, each of one section: past what the contents open by themselves.
const bigParts = Array.from({ length: 13 }, (_, i) =>
  ev(100 + i, 30040, `big-part-${i}`, [["title", `Part ${i + 1}`], a(30041, `big-part-${i}-s`)]),
);
const bigBook = ev(99, 30040, "big", [["title", "A long book"], ...bigParts.map((p) => a(30040, p.tags[0][1]))]);
// Alexandria's shelves: `root` holds a reader's shelves, a shelf holds books.
const shelf = ev(200, 30045, "my-book-collection", [["title", "My Book Collection"], a(30040, BOOK), a(30040, "big")]);
const rootShelf = ev(201, 30045, "root", [a(30045, "my-book-collection"), a(30045, "gone-shelf")]);
// A chain of indexes, each listing a new one: no real book, and it must not be followed forever.
const chain = Array.from({ length: 12 }, (_, i) =>
  ev(300 + i, 30040, `chain-${i}`, [["title", `Level ${i}`], a(30040, `chain-${i + 1}`)]),
);
// A stranger's book listing Laeserin's section: it must not become that section's book.
const STRANGER = "5".repeat(64);
const strangersBook = {
  ...ev(400, 30040, "borrowed", [["title", "A stranger's anthology"]]),
  pubkey: STRANGER,
  tags: [
    ["d", "borrowed"],
    ["title", "A stranger's anthology"],
    ["a", `30041:${PK}:${ART4}-section-3`, ""],
    ["a", `30041:${PK}:loose-leaf`, ""],
  ],
};
// A section of Laeserin's that no book of hers lists — only the stranger's does.
const looseLeaf = ev(401, 30041, "loose-leaf", [["title", "A loose leaf"]], "Some words.");
const ALL = [
  root,
  constitution,
  preamble,
  article4,
  section3,
  bigBook,
  ...bigParts,
  shelf,
  rootShelf,
  ...chain,
  strangersBook,
  looseLeaf,
];
/** Every `d` the relays were asked for. */
const asked: string[] = [];
const coord = (e: Ev) => `${e.kind}:${e.pubkey}:${e.tags[0][1]}`;

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    asked.push(...refs.map((r) => r.identifier)) &&
    new Map(
      refs.flatMap((r) => {
        const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
        const found = ALL.find((e) => coord(e) === key);
        return found ? [[key, found]] : [];
      }),
    ),
  fetchIndexesListing: async (coordinate: string) =>
    ALL.filter((e) => e.kind === 30040 && e.tags.some((t) => t[0] === "a" && t[1] === coordinate)),
}));
vi.mock("@/services/api", () => ({ apiClient: { getHouseInfluence: async () => null } }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { ArticleScreen } from "./ArticleScreen";

let io: ReturnType<typeof stubControllableIntersectionObserver>;
beforeEach(() => {
  __resetNearViewport();
  io = stubControllableIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

/** Brings every section waiting to be drawn into view until none is left: a part's sections appear as it draws. */
async function scrollThrough() {
  for (let round = 0; round < 6; round++) {
    io.bringAllIntoView();
    await new Promise((r) => setTimeout(r, 80));
  }
}

const open = (e: Ev) => {
  const ptr = { kind: e.kind, pubkey: e.pubkey, identifier: e.tags[0][1] };
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <ArticleScreen ev={e} naddr={nip19.naddrEncode(ptr)} ptr={ptr} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );
};

describe("a publication index", () => {
  it("reads as a book: its cover and facts, its contents, and every chapter's text", async () => {
    open(root);
    const header = screen.getByTestId("publication-header");
    expect(header).toHaveTextContent("The United States Constitution and The Bill of Rights");
    expect(screen.getByTestId("publication-author")).toHaveTextContent("by United States");
    expect(screen.getByTestId("publication-facts")).toHaveTextContent(
      "Document · 1st version · 2 parts · Published 15.12.1791",
    );
    expect(screen.getByTestId("publication-cover")).toHaveAttribute(
      "src",
      "https://www.gutenberg.org/cache/epub/5/pg5.cover.medium.jpg",
    );
    // The summary's paragraphs stay paragraphs.
    expect(within(screen.getByTestId("article-summary")).getAllByText(/./)).toHaveLength(2);

    const toc = screen.getByTestId("publication-toc");
    await waitFor(() => expect(toc).toHaveTextContent("THE CONSTITUTION OF THE UNITED STATES OF AMERICA, 1787"));
    // A part's own entries are listed under it.
    await waitFor(() => expect(toc).toHaveTextContent("ARTICLE FOUR"));

    const text = screen.getByTestId("publication-text");
    // Nothing off screen is drawn: its heading is in place, its text waits.
    await waitFor(() => expect(text).toHaveTextContent("THE CONSTITUTION OF THE UNITED STATES OF AMERICA, 1787"));
    expect(text).not.toHaveTextContent("We the People");
    await scrollThrough();
    await waitFor(() => expect(text).toHaveTextContent("We the People of the United States"));
    await waitFor(() => expect(text).toHaveTextContent("New States may be admitted by the Congress"));
    // The wrapped lines of a section are one paragraph.
    expect(within(text).getByText(/New States may be admitted/).tagName).toBe("P");
    // A section not on the relays says so, under the name its slug gives it.
    await waitFor(() => expect(text).toHaveTextContent("Section 2"));
    await waitFor(() => expect(within(text).getAllByTestId("publication-missing").length).toBeGreaterThan(0));
  });
});

describe("a publication section", () => {
  it("reads its body, with the books it belongs to above it and its neighbours below", async () => {
    open(section3);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Section 3");
    expect(screen.getByTestId("article-body")).toHaveTextContent("New States may be admitted by the Congress");

    const trail = await screen.findByTestId("publication-trail");
    await waitFor(() =>
      expect(trail).toHaveTextContent(
        "The United States Constitution and The Bill of RightsTHE CONSTITUTION OF THE UNITED STATES OF AMERICA, 1787ARTICLE FOUR",
      ),
    );

    expect(await screen.findByTestId("publication-previous")).toHaveTextContent("Section 2");
    expect(screen.getByTestId("publication-next")).toHaveTextContent("Section 4");
  });
});

describe("a long publication", () => {
  it("lists its parts, and asks for a part's contents only once it is opened or read", async () => {
    open(bigBook);
    const toc = screen.getByTestId("publication-toc");
    await waitFor(() => expect(within(toc).getAllByTestId("publication-toc-toggle")).toHaveLength(13));
    const toggles = within(toc).getAllByTestId("publication-toc-toggle");
    expect(toggles.every((t) => t.getAttribute("aria-expanded") === "false")).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(asked.filter((d) => /^big-part-\d+-s$/.test(d))).toEqual([]);

    fireEvent.click(toggles[0]);
    await waitFor(() => expect(asked).toContain("big-part-0-s"));
    expect(asked).not.toContain("big-part-1-s");
  });
});

describe("a bookshelf", () => {
  it("shows its shelves, then its books as covers with their authors", async () => {
    open(rootShelf);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bookshelf");
    expect(screen.getByTestId("bookshelf-facts")).toHaveTextContent("2 shelves");
    const shelves = await screen.findAllByTestId("bookshelf-shelf");
    await waitFor(() => expect(shelves[0]).toHaveTextContent("My Book Collection2 books"));
    // A shelf the relays do not have says so, under the name its slug gives it.
    await waitFor(() => expect(screen.getAllByTestId("bookshelf-shelf")[1]).toHaveTextContent("Gone ShelfNot found"));
  });

  it("a shelf of books: each a cover, its title and author, opening the book", async () => {
    open(shelf);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My Book Collection");
    await waitFor(() => expect(screen.getAllByTestId("bookshelf-book")).toHaveLength(2));
    const [first, second] = screen.getAllByTestId("bookshelf-book");
    await waitFor(() => expect(first).toHaveTextContent("The United States Constitution and The Bill of Rights"));
    expect(first).toHaveTextContent("United States");
    expect(first.querySelector("img")).toHaveAttribute(
      "src",
      "https://www.gutenberg.org/cache/epub/5/pg5.cover.medium.jpg",
    );
    expect(first.querySelector("a")?.getAttribute("href")).toMatch(/^\/e\/naddr1/);
    // No cover: the title on a plain jacket.
    expect(second).toHaveTextContent("A long book");
  });
});

describe("hostile publications", () => {
  it("a chain of parts is followed no deeper than a real book goes", async () => {
    open(chain[0]);
    await scrollThrough();
    await scrollThrough();
    expect(asked).toContain("chain-3");
    expect(asked).not.toContain("chain-8");
  });

  it("a stranger's book listing a section is not that section's book", async () => {
    open(looseLeaf);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("A loose leaf");
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByTestId("publication-trail")).toBeNull();
    expect(screen.queryByTestId("publication-pager")).toBeNull();
  });
});
