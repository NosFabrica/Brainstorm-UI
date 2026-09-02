// @vitest-environment jsdom
/**
 * One panel slot, two panel types: a strong PERSON match wins it; otherwise
 * a query with real hashtag activity earns the TOPIC panel — the entity
 * card for "liverpool" the way jack gets his.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot, SearchParams } from "@/services/search";

const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
let streamCalls: { query: string; params: SearchParams; emit: (s: Partial<SearchSnapshot>) => void }[] = [];

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    suggestProfiles: () => suggestMock(),
    searchStream: (query: string, params: SearchParams, onSnapshot: (s: SearchSnapshot) => void) => {
      streamCalls.push({
        query,
        params,
        emit: (partial) => onSnapshot({ hits: [], eose: false, timeMs: null, error: null, ...partial }),
      });
      return () => {};
    },
  };
});
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));

import { KnowledgePanel } from "./KnowledgePanel";

function noteHit(id: string, pubkey: string, name: string, created_at: number) {
  return {
    event: { id, kind: 1, pubkey, tags: [], content: "x", created_at, sig: "s" } as NostrEvent,
    author: { pubkey, npub: `npub1${name}`, name, wotRank: null, wotFollowers: null },
    rank: null,
  };
}

const NOW = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  streamCalls = [];
});

describe("the topic panel", () => {
  it("appears for a tag-active query when no person matches", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    // Person probe found nobody → the tag probe fires for #liverpool.
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    expect(streamCalls[0].query).toBe("#liverpool");

    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });

    const panel = await screen.findByTestId("search-topic-panel");
    expect(panel).toHaveTextContent("#liverpool");
    expect(screen.getByTestId("topic-panel-feed").getAttribute("href")).toBe("/t/liverpool");
  });

  it("stays silent when the tag is quiet", async () => {
    render(<KnowledgePanel query="zzzobscure" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({ hits: [noteHit("t1", "1".repeat(64), "solo", NOW)], eose: true, timeMs: 80 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  it("shows the person when their name matches exactly and the topic is quiet", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1jack", name: "jack", wotRank: 0.8, wotFollowers: 10 },
    ]);
    render(<KnowledgePanel query="jack" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  // Benjamin's catch: "liverpool" prefix-matched a fan account named
  // LiverpoolHODL and promoted it as THE match. A name-alike is not the
  // entity — prefix matches never earn the panel.
  it("never promotes a name-alike person (prefix matches are out)", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1hodl", name: "LiverpoolHODL", wotRank: 0.9, wotFollowers: 999 },
    ]);
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    // Topic quiet too → the slot stays empty rather than showing the wrong face.
    streamCalls[0].emit({ hits: [], eose: true, timeMs: 60 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  it("an active topic outranks even an exact-named person", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1lfc", name: "liverpool", wotRank: 0.8, wotFollowers: 10 },
    ]);
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 90,
    });
    await screen.findByTestId("search-topic-panel");
    expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
  });
});
