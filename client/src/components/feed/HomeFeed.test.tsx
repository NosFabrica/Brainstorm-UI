// @vitest-environment jsdom
/**
 * "What's happening now" — the home feed. Grilled 2026-09-03: signed in, your
 * own perspective leads ("From people you trust") with an "Across Nostr"
 * house-lens block beneath; visitors get only the wider block. Last 24 hours,
 * live-updating, opt-in behind the toggle, no tab strip — each band carries
 * its own "More →". The seam is mocked per stream, like ComposedResults.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot, SearchParams } from "@/services/search";

interface StreamCall {
  query: string;
  params: SearchParams;
  emit: (s: Partial<SearchSnapshot>) => void;
  cancelled: boolean;
}
let calls: StreamCall[] = [];

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (query: string, params: SearchParams, onSnapshot: (s: SearchSnapshot) => void) => {
      const call: StreamCall = {
        query,
        params,
        emit: (partial) => onSnapshot({ hits: [], eose: false, timeMs: null, error: null, ...partial }),
        cancelled: false,
      };
      calls.push(call);
      return () => {
        call.cancelled = true;
      };
    },
    suggestProfiles: () => Promise.resolve([]),
    fetchNoteEngagement: (id: string) => engagementMock(id),
  };
});
const engagementMock = vi.fn<(id: string) => Promise<{ zaps: number; replies: number }>>(() => Promise.resolve({ zaps: 0, replies: 0 }));
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.8);
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
}));
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => vi.fn() }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: () => Promise.resolve(null) }));

import { HomeFeed } from "./HomeFeed";

const NOW = Math.floor(Date.now() / 1000);
function ev(id: string, kind: number, pubkey: string, content = "", tags: string[][] = [], created_at = NOW - 600): NostrEvent {
  return { id, kind, pubkey, tags, content, created_at, sig: "s" } as NostrEvent;
}
const author = (pubkey: string, name: string) => ({ pubkey, npub: `npub1${name}`, name, wotRank: null, wotFollowers: null });
const hitOf = (event: NostrEvent, name = "someone") => ({ event, author: author(event.pubkey, name), rank: null });
const streamsOf = (pov: string, tab: string) => calls.filter((c) => c.params.pov === pov && c.params.tab === tab);

beforeEach(() => {
  calls = [];
  vi.clearAllMocks();
  engagementMock.mockImplementation(() => Promise.resolve({ zaps: 0, replies: 0 }));
});

describe("HomeFeed", () => {
  it("signed in: your network leads, the wider network follows, both asking for the last 24 hours", () => {
    const onHide = vi.fn();
    render(<HomeFeed personal userPubkey={"9".repeat(64)} onHide={onHide} onBrowse={vi.fn()} perspective={<span data-testid="pov-slot" />} />);
    // Header: the perspective control and one way out — no tab strip.
    const header = screen.getByTestId("home-feed-header");
    expect(within(header).getByTestId("pov-slot")).toBeInTheDocument();
    expect(screen.queryByTestId("search-tabs")).toBeNull();
    fireEvent.click(within(header).getByTestId("home-feed-hide"));
    expect(onHide).toHaveBeenCalled();

    const blocks = screen.getAllByTestId(/^feed-block-/).map((b) => b.getAttribute("data-testid"));
    expect(blocks).toEqual(["feed-block-personal", "feed-block-house"]);
    expect(screen.getByTestId("feed-block-personal")).toHaveTextContent("From people you trust");
    expect(screen.getByTestId("feed-block-house")).toHaveTextContent("Across Nostr");

    // Each block streams fresh notes through its own lens, last 24h to the second.
    const mine = streamsOf("mywot", "notes")[0];
    const house = streamsOf("nosfabrica", "notes")[0];
    expect(mine.query).toBe("sort:recent");
    expect(mine.params.userPubkey).toBe("9".repeat(64));
    expect(Math.abs((mine.params.since ?? 0) - (NOW - 86_400))).toBeLessThan(5);
    expect(house.params.since).toBe(mine.params.since);
  });

  it("renders Latest rows from your network's notes, newest first as the relay sends them", async () => {
    render(<HomeFeed personal userPubkey={"9".repeat(64)} onHide={vi.fn()} onBrowse={vi.fn()} />);
    streamsOf("mywot", "notes")[0].emit({
      hits: [hitOf(ev("n1", 1, "1".repeat(64), "First light over Anfield"), "kop"), hitOf(ev("n2", 1, "2".repeat(64), "Coffee and a keyboard"), "dev")],
      eose: true,
      timeMs: 120,
    });
    const block = screen.getByTestId("feed-block-personal");
    expect(await within(block).findByTestId("serp-row-n1")).toBeInTheDocument();
    expect(within(block).getByTestId("serp-row-n2")).toBeInTheDocument();
    expect(within(block).getByTestId("feed-band-latest")).toHaveTextContent("Latest");
  });

  it("signed out: only the wider block, no talk of your network", () => {
    render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
    expect(screen.queryByTestId("feed-block-personal")).toBeNull();
    expect(screen.getByTestId("feed-block-house")).toBeInTheDocument();
    expect(screen.queryByText(/people you trust/)).toBeNull();
    expect(streamsOf("mywot", "notes")).toHaveLength(0);
  });

  it("each band's More → opens that vertical as a browse", async () => {
    const onBrowse = vi.fn();
    render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={onBrowse} />);
    streamsOf("nosfabrica", "notes")[0].emit({ hits: [hitOf(ev("n1", 1, "1".repeat(64), "hello"))], eose: true, timeMs: 100 });
    await screen.findByTestId("serp-row-n1");
    fireEvent.click(within(screen.getByTestId("feed-band-latest")).getByRole("button", { name: /more/i }));
    expect(onBrowse).toHaveBeenCalledWith("notes");
  });
});
