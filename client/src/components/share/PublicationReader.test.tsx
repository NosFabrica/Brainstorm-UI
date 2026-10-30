// @vitest-environment jsdom
/**
 * NKBIP-01 publications on the article reader: a kind-30040 index reads as a
 * book — cover, contents, every chapter's text — and a kind-30041 section
 * reads on its own, with its book above it and its neighbours below. The
 * events are Alexandria's United States Constitution, as published.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

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
const ALL = [root, constitution, preamble, article4, section3];
const coord = (e: Ev) => `${e.kind}:${e.pubkey}:${e.tags[0][1]}`;

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
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
      "Document · 1st version · 2 sections · Published 15.12.1791",
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
