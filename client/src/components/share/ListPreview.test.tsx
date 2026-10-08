// @vitest-environment jsdom
/**
 * A bookmark set a note names, drawn as the list: quoted by id it was a note
 * card with nothing in it; linked by address, in the Notes tab, an article
 * teaser with the default cover beside a "↗ bookmark set" link.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const CURATOR = "2".repeat(64);
const WRITER = "1".repeat(64);
const NOTE_IN_LIST: MinimalEvent = {
  id: "c".repeat(64),
  kind: 1,
  pubkey: WRITER,
  created_at: 1_789_000_000,
  content: "The obstacle is the way.",
  tags: [],
};
const LIST: MinimalEvent = {
  id: "f".repeat(64),
  kind: 30003,
  pubkey: CURATOR,
  created_at: 1_789_701_197,
  content: "",
  tags: [
    ["d", "notes-pin-stoicism"],
    ["title", "stoicism — notes"],
    ["e", NOTE_IN_LIST.id],
    ["e", "d".repeat(64)],
  ],
};
const COORD = `30003:${CURATOR}:notes-pin-stoicism`;
const NADDR = nip19.naddrEncode({ kind: 30003, pubkey: CURATOR, identifier: "notes-pin-stoicism" });

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => [NOTE_IN_LIST, LIST].filter((e) => ids.includes(e.id)),
  fetchAddressableEvents: async () => new Map([[COORD, LIST]]),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
const navigate = vi.fn();
vi.mock("wouter", async (orig) => ({
  ...(await orig<typeof import("wouter")>()),
  useLocation: () => ["/", navigate],
}));

import { EmbeddedListCard } from "./ListPreview";
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { ShareNoteCard } from "./ShareNoteCard";
import { NostrRef } from "./NostrRef";

beforeEach(() => vi.clearAllMocks());

describe("EmbeddedListCard", () => {
  it("names the list, says what it holds, shows its first notes, and opens the list", async () => {
    renderWithProviders(<EmbeddedListCard event={LIST} author={{ name: "vinney" }} />);
    const card = screen.getByTestId("embedded-list");
    expect(card).toHaveTextContent("stoicism — notes");
    expect(screen.getByTestId("embedded-list-count")).toHaveTextContent("2 notes");
    expect(card).toHaveTextContent("vinney");
    expect(await screen.findByTestId(`list-preview-note-${NOTE_IN_LIST.id}`)).toHaveTextContent(
      "The obstacle is the way.",
    );
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith(`/e/${NADDR}`);
  });

  it("inside a card inside a card, stops at its name", () => {
    renderWithProviders(<EmbeddedListCard event={LIST} nested />);
    expect(screen.getByTestId("embedded-list")).toHaveTextContent("stoicism — notes");
    expect(screen.queryByTestId(`list-preview-${LIST.id}`)).toBeNull();
  });
});

describe("a list a note names", () => {
  it("quoted by id, is the list's card, not an empty note card", () => {
    renderWithProviders(<EmbeddedNoteCard event={LIST} href="/e/x" />);
    expect(screen.getByTestId("embedded-list")).toBeInTheDocument();
    expect(screen.queryByTestId("embedded-note")).toBeNull();
  });

  it("linked by address in a note card, is the list's card, not an article teaser", () => {
    const note: MinimalEvent = {
      id: "b".repeat(64),
      kind: 1,
      pubkey: WRITER,
      created_at: 1_789_800_000,
      content: `My reading for the week nostr:${NADDR}`,
      tags: [["a", COORD]],
    };
    renderWithProviders(
      <ShareNoteCard event={note} profiles={new Map()} eventsById={new Map()} addrByCoord={new Map([[COORD, LIST]])} />,
    );
    expect(screen.getByTestId("embedded-list")).toHaveTextContent("stoicism — notes");
    expect(screen.queryByTestId("embedded-article")).toBeNull();
    // The card is its link: no "↗ bookmark set" beside it.
    expect(screen.queryByText(/bookmark set/i)).toBeNull();
  });

  it("linked by address in a quoted note, is one list card and no second link", async () => {
    const note: MinimalEvent = {
      id: "9".repeat(64),
      kind: 1,
      pubkey: WRITER,
      created_at: 1_789_800_000,
      content: `My reading for the week nostr:${NADDR}`,
      tags: [["a", COORD]],
    };
    renderWithProviders(<EmbeddedNoteCard event={note} href="/e/x" />);
    expect(await screen.findByTestId("embedded-list")).toHaveTextContent("stoicism — notes");
    expect(screen.queryByText(/bookmark set/i)).toBeNull();
  });

  it("named in long-form text, becomes the list's card once found", async () => {
    renderWithProviders(<NostrRef bech32={NADDR} />);
    expect(await screen.findByTestId("embedded-list")).toHaveTextContent("stoicism — notes");
  });
});
