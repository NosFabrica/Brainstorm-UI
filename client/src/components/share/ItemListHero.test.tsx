// @vitest-environment jsdom
/**
 * A bookmark set (kind 30003) on /e opens as the things it holds — its notes
 * as note cards, its hashtags as topics, its links as links — not as a table
 * of tags. Its `e` tags are items: nothing about it is a reply.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const notesById = new Map<string, NostrEvent>();
const relaysAsked = vi.fn();
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
vi.mock("@/hooks/useSpecsForKind", () => ({ useSpecsForKind: () => [] }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[], relays?: string[]) => {
    relaysAsked(relays);
    return ids.map((id) => notesById.get(id)).filter(Boolean);
  },
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
  },
}));

import { ItemListHero } from "./ItemListHero";

const CURATOR = "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331";
const id = (n: number) => n.toString(16).padStart(64, "a");

const note = (n: number, content: string): NostrEvent =>
  ({
    id: id(n),
    kind: 1,
    pubkey: "1".repeat(64),
    tags: [],
    content,
    created_at: 1_789_000_000,
    sig: "s",
  }) as NostrEvent;

const pin = (tags: string[][], content = ""): NostrEvent =>
  ({
    id: "f".repeat(64),
    kind: 30003,
    pubkey: CURATOR,
    tags: [
      ["d", "notes-pin-2efaa715-2efaa715-stoicism"],
      ["z", "39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:tag-pinning"],
      ["title", "stoicism — notes"],
      ["description", 'Notes tagged "stoicism", pinned by 2efaa715…'],
      ...tags,
    ],
    content,
    created_at: 1_789_701_197,
    sig: "s",
  }) as NostrEvent;

beforeEach(() => {
  notesById.clear();
  relaysAsked.mockClear();
});

describe("ItemListHero", () => {
  it("opens a notes pin as its notes, each a card, and a note not found yet as a way to it", async () => {
    notesById.set(id(1), note(1, "The obstacle is the way."));
    render(
      <ItemListHero
        event={pin([
          ["e", id(1)],
          ["e", id(2)],
        ])}
      />,
    );

    expect(screen.getByTestId("item-list-title")).toHaveTextContent("stoicism — notes");
    expect(screen.getByTestId("item-list-count")).toHaveTextContent("2 notes");
    expect(screen.getByText(/Notes tagged "stoicism"/)).toBeInTheDocument();
    expect(await screen.findByText("The obstacle is the way.")).toBeInTheDocument();
    expect(screen.getByTestId(`item-list-note-pending-${id(2)}`).getAttribute("href")).toMatch(/^\/e\/nevent1/);
    // Items, not a conversation.
    expect(screen.queryByText(/Replying to/)).toBeNull();
  });

  it("pages a long list ten notes at a time, asking only for the page shown", () => {
    const tags = Array.from({ length: 12 }, (_, i) => ["e", id(100 + i)]);
    render(<ItemListHero event={pin(tags)} />);
    expect(screen.getAllByTestId(/^item-list-note-pending-/)).toHaveLength(10);
    expect(screen.getByTestId("item-list-notes-toggle")).toHaveTextContent("Show 2 more of 2");
    fireEvent.click(screen.getByTestId("item-list-notes-toggle"));
    expect(screen.getAllByTestId(/^item-list-note-pending-/)).toHaveLength(12);
    expect(screen.queryByTestId("item-list-notes-toggle")).toBeNull();
  });

  it("asks a note's own relay hint beside the default relays", () => {
    render(<ItemListHero event={pin([["e", id(200), "wss://notes.example"]])} />);
    expect(relaysAsked).toHaveBeenCalledWith(expect.arrayContaining(["wss://notes.example"]));
    expect(relaysAsked.mock.calls[0][0].length).toBeGreaterThan(1);
  });

  it("shows hashtags as topics and links as links, and says what is sealed", () => {
    render(
      <ItemListHero
        event={pin(
          [
            ["t", "stoicism"],
            ["r", "https://dailystoic.com/articles/"],
          ],
          "AgK3c2Vh?iv=bG9yZW0=",
        )}
      />,
    );
    expect(screen.getByTestId("item-list-hashtag-stoicism").getAttribute("href")).toBe("/t/stoicism");
    expect(screen.getByTestId("item-list-link").getAttribute("href")).toBe("https://dailystoic.com/articles/");
    expect(screen.getByTestId("item-list-count")).toHaveTextContent("1 hashtag · 1 link · private items");
    expect(screen.getByTestId("item-list-sealed")).toHaveTextContent("private items only its owner can read");
  });

  it("says an empty list is empty, and keeps the tags one click away", () => {
    render(<ItemListHero event={pin([])} />);
    expect(screen.getByTestId("item-list-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("item-list-advanced-toggle"));
    expect(screen.getByTestId("structural-hero")).toBeInTheDocument();
  });
});
