// @vitest-environment jsdom
/**
 * What one run did, read back to the admin: counts, every list it touched,
 * and — when nothing was published — why, in words, with the next step.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { TrustedListRunData } from "@/services/api";
const loadTrustedList = vi.fn();
vi.mock("./listMembers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./listMembers")>()),
  loadTrustedList: (...a: unknown[]) => loadTrustedList(...a),
}));
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfileMap: async () => new Map([["d".repeat(64), { name: "Vitor Pamplona" }]]),
}));
// What the store and the relays hold, by id or coordinate: a DList's header, a list's notes and items.
const held = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/hooks/useAddressedEvents", () => ({
  useAddressedEvents: () => ({ get: (a: string) => held.get(a), settled: true }),
}));
vi.mock("@/hooks/useRefEvents", () => ({
  useRefEvents: () => ({
    get: (r: { id?: string; addr?: string }) => held.get(r.id ?? r.addr ?? ""),
    profiles: new Map(),
    settled: true,
  }),
}));
// The cards themselves are drawn elsewhere; here, only which one each member gets.
vi.mock("@/components/share/activity/parts", () => ({
  QuotedRef: ({ target }: { target: { id?: string } }) => (
    <div data-testid="quoted-ref">{(held.get(target.id ?? "") as { content?: string } | undefined)?.content}</div>
  ),
}));
vi.mock("@/components/search/AllResults", () => ({
  AllResults: ({ hits }: { hits: { event: { tags: string[][] } }[] }) => (
    <div data-testid="all-results-row">{hits.map((h) => h.event.tags.find((t) => t[0] === "title")?.[1])}</div>
  ),
}));

import { TrustedListRunResult } from "./TrustedListRunResult";

const EMPTY: TrustedListRunData = {
  observer: "b".repeat(64),
  signing_pubkey: "c".repeat(64),
  taggings_in_store: 0,
  qualifying_asserters: 0,
  dictionary_size: 0,
  published: 0,
  failed: 0,
  retracted: 0,
  empty_reason: null,
  tags: [],
};

describe("TrustedListRunResult", () => {
  it.each([
    ["no_taggings_ingested", /no taggings have reached the server yet/i],
    ["no_qualifying_asserters", /calculate it from the users tab/i],
    ["no_tags_met_use_threshold", /older lists were retracted/i],
  ] as const)("explains an empty run (%s) and what to do next", (reason, words) => {
    render(<TrustedListRunResult run={{ ...EMPTY, empty_reason: reason }} observerName="Vitor" />);
    expect(screen.getByTestId("trusted-lists-empty")).toHaveTextContent(words);
  });

  const WITH_LISTS: TrustedListRunData = {
    ...EMPTY,
    qualifying_asserters: 3,
    dictionary_size: 2,
    published: 1,
    failed: 1,
    tags: [
      {
        slug: "podcaster",
        d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-podcaster",
        tag_event_id: "e".repeat(64),
        status: "published",
        taggings_considered: 5,
        member_count: 3,
        error: null,
      },
      {
        slug: "bitcoiner",
        d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-bitcoiner",
        tag_event_id: "f".repeat(64),
        status: "failed",
        taggings_considered: 4,
        member_count: 2,
        error: "relay said: rate-limited",
      },
    ],
  };

  it("shows why a list failed to publish, on its own row", () => {
    render(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);
    expect(screen.getByTestId("trusted-list-row-bitcoiner")).toHaveTextContent("relay said: rate-limited");
    expect(screen.getByTestId("trusted-list-row-podcaster")).not.toHaveTextContent("rate-limited");
  });

  // On a phone a list's details take their own line under its name; on a desk
  // they sit beside it.
  it("wraps a list's details under its name on a phone", () => {
    render(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);
    const meta = screen.getByTestId("trusted-list-meta-podcaster");
    expect(meta).toHaveClass("basis-full");
    expect(meta).toHaveClass("sm:basis-auto");
  });

  // Counts say how big a list is; the members say whether it's right.
  it("shows a published list's members, read back from the relay, with a link to it", async () => {
    loadTrustedList.mockResolvedValue({
      members: [{ pubkey: "d".repeat(64), score: 87, endorsements: 3, disputes: 0 }],
      retracted: false,
      relay: "wss://tl.example",
      naddr: "naddr1example",
    });
    renderWithProviders(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);

    fireEvent.click(screen.getByTestId("trusted-list-view-podcaster"));

    const members = await screen.findByTestId("trusted-list-members-podcaster");
    expect(await screen.findByText("Vitor Pamplona")).toBeInTheDocument();
    expect(members).toHaveTextContent("87");
    expect(loadTrustedList).toHaveBeenCalledWith({
      observer: WITH_LISTS.observer,
      signingPubkey: WITH_LISTS.signing_pubkey,
      dTag: "tl-tag-bbbbbbbb-aaaaaaaa-podcaster",
      kind: 30392,
    });
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    // A list that failed to publish has nothing to read back.
    expect(screen.queryByTestId("trusted-list-view-bitcoiner")).toBeNull();
  });
});

describe("TrustedListRunResult and tagged notes and items", () => {
  const PEOPLE_ONLY: TrustedListRunData = {
    ...EMPTY,
    taggings_in_store: 7013,
    qualifying_asserters: 46,
    dictionary_size: 73,
    published: 73,
    event_taggings_in_store: 0,
    unresolved_targets: 0,
    content_skipped_reason: null,
  };

  it("says when the server holds no taggings of notes or items, so built people lists only", () => {
    render(<TrustedListRunResult run={PEOPLE_ONLY} observerName="nosfabrica" />);
    expect(screen.getByTestId("trusted-lists-no-content")).toHaveTextContent(/built people lists only/i);
    expect(screen.getByTestId("trusted-lists-taggings-held")).toHaveTextContent(
      "Taggings held: 7,013 of people · 0 of notes and items",
    );
  });

  it("says why those lists were skipped, and how many tagged things weren't found", () => {
    render(
      <TrustedListRunResult
        run={{
          ...PEOPLE_ONLY,
          event_taggings_in_store: 120,
          unresolved_targets: 2,
          content_skipped_reason: "lookup failed: wss://r.example",
        }}
        observerName="nosfabrica"
      />,
    );
    expect(screen.queryByTestId("trusted-lists-no-content")).toBeNull();
    expect(screen.getByTestId("trusted-lists-content-skipped")).toHaveTextContent("lookup failed: wss://r.example");
    expect(screen.getByTestId("trusted-lists-taggings-held")).toHaveTextContent("2 tagged things not found");
  });

  const HEADER = `39998:${"a".repeat(64)}:books`;
  const NOTE_ID = "1".repeat(64);
  const ITEM = `39999:${"a".repeat(64)}:the-hobbit`;
  const NOTES_D = "tl-tag-notes-bbbbbbbb-aaaaaaaa-espresso-k1";
  const ITEMS_D = "tl-tag-items-bbbbbbbb-aaaaaaaa-espresso-dlaaaaaaaa-books-1234abcd";
  const row = (over: Partial<TrustedListRunData["tags"][number]>) => ({
    slug: "espresso",
    d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-espresso",
    tag_event_id: "",
    status: "published" as const,
    taggings_considered: 3,
    member_count: 1,
    error: null,
    ...over,
  });
  // One tag, three lists: the people it names, the notes and the books it was applied to.
  const CONTENT: TrustedListRunData = {
    ...PEOPLE_ONLY,
    event_taggings_in_store: 2,
    tags: [
      row({ kind: 30392, tagging_target: null }),
      row({ d_tag: NOTES_D, kind: 30393, tagging_target: "1" }),
      row({ d_tag: ITEMS_D, kind: 30394, tagging_target: HEADER }),
    ],
  };

  it("names what a list of notes or items was tagged on beside its tag", () => {
    held.clear();
    held.set(HEADER, {
      kind: 39998,
      pubkey: "a".repeat(64),
      tags: [
        ["d", "books"],
        ["names", "Book", "Books"],
      ],
    });
    render(<TrustedListRunResult run={CONTENT} observerName="nosfabrica" />);
    expect(screen.getByTestId("trusted-list-row-espresso")).not.toHaveTextContent("espresso ·");
    expect(screen.getByTestId(`trusted-list-row-${NOTES_D}`)).toHaveTextContent("espresso · Notes");
    expect(screen.getByTestId(`trusted-list-row-${ITEMS_D}`)).toHaveTextContent("espresso · Books");
  });

  it("names a DList by its header's d until the header is found", () => {
    held.clear();
    render(<TrustedListRunResult run={CONTENT} observerName="nosfabrica" />);
    expect(screen.getByTestId(`trusted-list-row-${ITEMS_D}`)).toHaveTextContent("espresso · books");
  });

  it("reads a list of notes at its own kind and shows each as a note", async () => {
    held.clear();
    held.set(NOTE_ID, {
      id: NOTE_ID,
      kind: 1,
      pubkey: "d".repeat(64),
      created_at: 1,
      tags: [],
      content: "Best espresso in Lisbon",
    });
    loadTrustedList.mockResolvedValue({
      kind: 30393,
      members: [{ id: NOTE_ID, score: 64, endorsements: 2, disputes: 0 }],
      retracted: false,
      relay: "wss://tl.example",
      naddr: "naddr1example",
    });
    renderWithProviders(<TrustedListRunResult run={CONTENT} observerName="nosfabrica" />);

    fireEvent.click(screen.getByTestId(`trusted-list-view-${NOTES_D}`));

    const members = await screen.findByTestId(`trusted-list-members-${NOTES_D}`);
    expect(loadTrustedList).toHaveBeenLastCalledWith(expect.objectContaining({ dTag: NOTES_D, kind: 30393 }));
    expect(await screen.findByTestId("quoted-ref")).toHaveTextContent("Best espresso in Lisbon");
    expect(members).toHaveTextContent("2 endorsements");
    expect(members).toHaveTextContent("score 64");
  });

  it("reads a list of items at its own kind and shows each item as search draws it", async () => {
    held.clear();
    held.set(ITEM, {
      id: "2".repeat(64),
      kind: 39999,
      pubkey: "a".repeat(64),
      created_at: 1,
      tags: [
        ["d", "the-hobbit"],
        ["title", "The Hobbit"],
      ],
      content: "",
    });
    loadTrustedList.mockResolvedValue({
      kind: 30394,
      members: [{ address: ITEM, score: 90, endorsements: 4, disputes: 0 }],
      retracted: false,
      relay: "wss://tl.example",
      naddr: "naddr1example",
    });
    renderWithProviders(<TrustedListRunResult run={CONTENT} observerName="nosfabrica" />);

    fireEvent.click(screen.getByTestId(`trusted-list-view-${ITEMS_D}`));

    const members = await screen.findByTestId(`trusted-list-members-${ITEMS_D}`);
    expect(loadTrustedList).toHaveBeenLastCalledWith(expect.objectContaining({ dTag: ITEMS_D, kind: 30394 }));
    expect(await screen.findByTestId("all-results-row")).toHaveTextContent("The Hobbit");
    expect(members).toHaveTextContent("score 90");
  });

  it("says nothing of them for a server that doesn't report them", () => {
    render(<TrustedListRunResult run={{ ...PEOPLE_ONLY, event_taggings_in_store: undefined }} observerName="x" />);
    expect(screen.queryByTestId("trusted-lists-no-content")).toBeNull();
    expect(screen.queryByTestId("trusted-lists-taggings-held")).toBeNull();
  });
});
