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

  it("the person panel still wins the slot", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1alice", name: "liverpool", wotRank: 0.8, wotFollowers: 10 },
    ]);
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });
});
