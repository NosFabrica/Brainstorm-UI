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
    fetchAppsByAddress: (addresses: string[]) => appsByAddressMock(addresses),
  };
});
const appsByAddressMock = vi.fn<(addresses: string[]) => Promise<Map<string, NostrEvent>>>(() => Promise.resolve(new Map()));
const engagementMock = vi.fn<(id: string) => Promise<{ zaps: number; replies: number }>>(() => Promise.resolve({ zaps: 0, replies: 0 }));
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.8);
// Event cards carry the RSVP button, which reads the active account; these
// tests are signed out — the button is the sign-in door and never publishes.
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
}));
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => vi.fn() }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: () => Promise.resolve(null) }));

import { HomeFeed } from "./HomeFeed";
import { __resetNoteEngagementCache } from "@/hooks/useNoteEngagement";

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
  __resetNoteEngagementCache();
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

  // A new account's network is quiet. Rather than a lonely "Quiet in the last
  // 24 hours" above the fold, the page says so in one line and the wider
  // block moves up to lead.
  it("a quiet network (fewer than five items) says so and lets Across Nostr lead", async () => {
    render(<HomeFeed personal userPubkey={"9".repeat(64)} onHide={vi.fn()} onBrowse={vi.fn()} />);
    streamsOf("mywot", "notes")[0].emit({ hits: [hitOf(ev("n1", 1, "1".repeat(64), "one lonely note"))], eose: true, timeMs: 100 });
    streamsOf("nosfabrica", "notes")[0].emit({ hits: [hitOf(ev("h1", 1, "2".repeat(64), "busy world"))], eose: true, timeMs: 100 });
    await screen.findByTestId("serp-row-h1");
    const blocks = screen.getAllByTestId(/^feed-block-/).map((b) => b.getAttribute("data-testid"));
    expect(blocks).toEqual(["feed-block-house", "feed-block-personal"]);
    expect(screen.getByTestId("feed-quiet-network")).toHaveTextContent(/quiet/i);
    // The lonely note still shows, under its own kicker, below.
    expect(within(screen.getByTestId("feed-block-personal")).getByTestId("serp-row-n1")).toBeInTheDocument();
  });

  // Live-updating without the list jumping under the reader: posts that
  // arrive after the first page settles wait behind a "3 new" pill.
  it("new posts after the page settles wait behind an N-new pill until asked for", async () => {
    render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
    const stream = streamsOf("nosfabrica", "notes")[0];
    const first = [hitOf(ev("h1", 1, "1".repeat(64), "first"))];
    stream.emit({ hits: first, eose: true, timeMs: 100 });
    await screen.findByTestId("serp-row-h1");
    expect(screen.queryByTestId("feed-new-pill")).toBeNull();
    // Two more arrive on the open stream — newest first, as the relay sends them.
    const later = [hitOf(ev("h3", 1, "3".repeat(64), "third", [], NOW - 10)), hitOf(ev("h2", 1, "2".repeat(64), "second", [], NOW - 20))];
    stream.emit({ hits: [...later, ...first], eose: true, timeMs: 100 });
    expect(screen.queryByTestId("serp-row-h2")).toBeNull();
    const pill = await screen.findByTestId("feed-new-pill");
    expect(pill).toHaveTextContent("2 new");
    // It counts Latest, so it sits at the top of Latest — not under Live now.
    const latestBand = screen.getByTestId("feed-band-latest");
    expect(latestBand.contains(pill)).toBe(true);
    expect(pill.compareDocumentPosition(screen.getByTestId("serp-row-h1")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(pill);
    expect(screen.getByTestId("serp-row-h2")).toBeInTheDocument();
    expect(screen.getByTestId("serp-row-h3")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-new-pill")).toBeNull();
  });

  describe("bands", () => {
    const DAY = 86_400;
    const NEWS = (n: number) =>
      `Liverpool complete the record signing of Bradley Barcola ${n}\nhttps://www.liverpoolecho.co.uk/story-${n}\nSummary ${n}. https://cdn.example/photo-${n}.jpg`;

    it("streams every band through the block's lens with the same since", () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      const tabs = calls.filter((c) => c.params.pov === "nosfabrica").map((c) => c.params.tab);
      expect(tabs).toEqual(expect.arrayContaining(["live", "notes", "events", "media"]));
      // …except releases (a week) and events (a month): both are announced
      // long before they happen, so "the last 24 hours" would miss them.
      const sinces = new Set(calls.filter((c) => c.params.tab !== "releases" && c.params.tab !== "events").map((c) => c.params.since));
      expect(sinces.size).toBe(1);
      const day = [...sinces][0]!;
      expect(streamsOf("nosfabrica", "releases")[0].params.since).toBe(day - 6 * 86_400);
      expect(streamsOf("nosfabrica", "events")[0].params.since).toBe(day - 29 * 86_400);
    });

    it("Live now leads only while someone is streaming; ended streams don't count", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      const live = streamsOf("nosfabrica", "live")[0];
      live.emit({
        hits: [
          hitOf(ev("s1", 30311, "1".repeat(64), "", [["d", "a"], ["title", "Anfield Radio"], ["status", "live"], ["streaming", "https://x/live.m3u8"]]), "radio"),
          hitOf(ev("s2", 30311, "2".repeat(64), "", [["d", "b"], ["title", "Old show"], ["status", "ended"]]), "tv"),
        ],
        eose: true,
        timeMs: 90,
      });
      const band = await screen.findByTestId("feed-band-live");
      expect(band).toHaveTextContent("Live now");
      expect(within(band).getByTestId("live-card-s1")).toBeInTheDocument();
      expect(within(band).queryByTestId("live-card-s2")).toBeNull();
      // First band in the block.
      const block = screen.getByTestId("feed-block-house");
      const bands = [...block.querySelectorAll('[data-testid^="feed-band-"]')].map((b) => b.getAttribute("data-testid"));
      expect(bands[0]).toBe("feed-band-live");
    });

    it("no live streams, no Live band", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      streamsOf("nosfabrica", "live")[0].emit({ hits: [hitOf(ev("s2", 30311, "2".repeat(64), "", [["d", "b"], ["status", "ended"]]))], eose: true, timeMs: 90 });
      streamsOf("nosfabrica", "notes")[0].emit({ hits: [hitOf(ev("n1", 1, "1".repeat(64), "hi"))], eose: true, timeMs: 90 });
      await screen.findByTestId("serp-row-n1");
      expect(screen.queryByTestId("feed-band-live")).toBeNull();
    });

    it("Top stories lead Latest, three or nothing, like the search page", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      streamsOf("nosfabrica", "notes")[0].emit({
        hits: [1, 2, 3].map((n) => hitOf(ev(`n${n}`, 1, String(n).repeat(64), NEWS(n)), `outlet${n}`)),
        eose: true,
        timeMs: 90,
      });
      const strip = await screen.findByTestId("serp-top-stories");
      expect(strip.querySelectorAll('[data-testid^="top-story-"]')).toHaveLength(3);
      expect(screen.queryByTestId("serp-row-n1")).toBeNull();
    });

    it("This week's events: upcoming within seven days, soonest first, as event cards", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      const cal = (id: string, title: string, start: number) =>
        hitOf(ev(id, 31923, "c".repeat(64), "", [["d", id], ["title", title], ["start", String(start)], ["location", "Chicago"]]), "club");
      streamsOf("nosfabrica", "events")[0].emit({
        hits: [cal("far", "Next month", NOW + 20 * DAY), cal("gone", "Yesterday", NOW - DAY), cal("soon", "Tomorrow", NOW + DAY), cal("mid", "Friday", NOW + 3 * DAY)],
        eose: true,
        timeMs: 90,
      });
      const band = await screen.findByTestId("feed-band-events");
      expect(band).toHaveTextContent("This week");
      const cards = [...band.querySelectorAll('[data-testid^="event-card-"]')].map((c) => c.getAttribute("data-testid"));
      expect(cards).toEqual(["event-card-soon", "event-card-mid"]);
    });

    it("Media as a tile grid", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      streamsOf("nosfabrica", "media")[0].emit({
        hits: [hitOf(ev("m1", 20, "1".repeat(64), "sunset", [["imeta", "url https://cdn.example/sunset.jpg", "m image/jpeg"]]), "photog")],
        eose: true,
        timeMs: 90,
      });
      const band = await screen.findByTestId("feed-band-media");
      expect(band).toHaveTextContent("Media");
      expect(within(band).getByTestId("media-tile-m1")).toBeInTheDocument();
    });

    it("Trending topics: hashtags two or more voices used, as chips into the tag feed", async () => {
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      streamsOf("nosfabrica", "notes")[0].emit({
        hits: [
          hitOf(ev("n1", 1, "1".repeat(64), "gm", [["t", "bitcoin"], ["t", "nostr"]])),
          hitOf(ev("n2", 1, "2".repeat(64), "gn", [["t", "bitcoin"]])),
          hitOf(ev("n3", 1, "3".repeat(64), "solo", [["t", "onlyme"]])),
        ],
        eose: true,
        timeMs: 90,
      });
      const band = await screen.findByTestId("feed-band-trending");
      expect(band).toHaveTextContent("Trending");
      expect(within(band).getByTestId("feed-trend-bitcoin").getAttribute("href")).toBe("/?q=%23bitcoin");
      expect(within(band).queryByTestId("feed-trend-onlyme")).toBeNull();
    });

    // New releases: apps in the network that shipped this week (kind 30063),
    // one card per app, newest release first, wearing the listing's icon.
    it("New releases: one card per app that shipped, newest first, into the app page", async () => {
      appsByAddressMock.mockResolvedValue(
        new Map([
          ["32267:" + "a".repeat(64) + ":com.vitorpamplona.amethyst", ev("app-amethyst", 32267, "a".repeat(64), "", [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"], ["icon", "https://cdn.zapstore.dev/amethyst.png"]])],
          ["32267:" + "b".repeat(64) + ":net.primal.android", ev("app-primal", 32267, "b".repeat(64), "", [["d", "net.primal.android"], ["name", "Primal"]])],
        ]),
      );
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      const rel = (id: string, app: string, pk: string, version: string, at: number) =>
        hitOf(ev(id, 30063, pk, "", [["d", `${app}@${version}`], ["a", `32267:${pk}:${app}`]], at), "zapstore");
      streamsOf("nosfabrica", "releases")[0].emit({
        hits: [
          rel("r1", "com.vitorpamplona.amethyst", "a".repeat(64), "1.14.0", NOW - 3600),
          rel("r2", "com.vitorpamplona.amethyst", "a".repeat(64), "1.13.9", NOW - 7200), // same app, older
          rel("r3", "net.primal.android", "b".repeat(64), "3.5.25", NOW - 600),
        ],
        eose: true,
        timeMs: 90,
      });
      const band = await screen.findByTestId("feed-band-releases");
      expect(band).toHaveTextContent("New releases");
      const cards = [...band.querySelectorAll('[data-testid^="feed-release-"]')];
      expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["feed-release-r3", "feed-release-r1"]);
      expect(cards[1]).toHaveTextContent("Amethyst");
      expect(cards[1]).toHaveTextContent("v1.14.0");
      expect(cards[1].querySelector("img")?.getAttribute("src")).toBe("https://cdn.zapstore.dev/amethyst.png");
      expect(cards[1].getAttribute("href")).toMatch(/^\/e\//);
      expect(appsByAddressMock).toHaveBeenCalledWith(expect.arrayContaining(["32267:" + "a".repeat(64) + ":com.vitorpamplona.amethyst"]));
    });

    it("rows carry quiet zap and reply counts once they arrive; zero stays silent", async () => {
      engagementMock.mockImplementation((id) => Promise.resolve(id === "n1" ? { zaps: 12, replies: 4 } : { zaps: 0, replies: 0 }));
      render(<HomeFeed personal={false} onHide={vi.fn()} onBrowse={vi.fn()} />);
      streamsOf("nosfabrica", "notes")[0].emit({
        hits: [hitOf(ev("n1", 1, "1".repeat(64), "loud")), hitOf(ev("n2", 1, "2".repeat(64), "quiet"))],
        eose: true,
        timeMs: 90,
      });
      const row = await screen.findByTestId("serp-row-n1");
      await vi.waitFor(() => expect(within(row).getByTestId("serp-engagement")).toHaveTextContent("⚡ 12 · 4 replies"));
      expect(within(screen.getByTestId("serp-row-n2")).queryByTestId("serp-engagement")).toBeNull();
    });
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
