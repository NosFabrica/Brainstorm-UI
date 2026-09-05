// @vitest-environment jsdom
/**
 * The results half of the Google-anatomy search page: owns the stream
 * lifecycle (a query/tab/POV change cancels and restarts), the vertical tabs,
 * and per-kind result rendering. The seam (services/search) is mocked — its
 * own suite covers the wire; these tests cover what a searcher sees.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot } from "@/services/search";

const streamMock = vi.fn();
const cancelMock = vi.fn();
const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
// Every stream registered, with its callback. The KnowledgePanel's probes
// (the #query topic probe, the limit-6 apps probe and the limit-60 events
// probe) ride the same mock — tests target the MAIN stream.
const isPanelProbe = (q: string, p?: { tab?: string; limit?: number }) =>
  q.startsWith("#") || (p?.tab === "apps" && p?.limit === 6) || (p?.tab === "events" && p?.limit === 60);
let allStreams: { query: string; params: { tab?: string; limit?: number }; cb: (s: SearchSnapshot) => void }[] = [];
const mainStreamCalls = () =>
  streamMock.mock.calls.filter(([q, p]) => !isPanelProbe(String(q), p as { tab?: string; limit?: number }));

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (...args: unknown[]) => {
      allStreams.push({
        query: args[0] as string,
        params: args[1] as { tab?: string; limit?: number },
        cb: args[2] as (s: SearchSnapshot) => void,
      });
      streamMock(args[0], args[1]);
      return cancelMock;
    },
    suggestProfiles: (...args: unknown[]) => suggestMock(...(args as [])),
    fetchRepoCounts: (...args: unknown[]) => repoCountsMock(...(args as [])),
    fetchGitStatuses: (ids: string[]) => gitStatusesMock(ids),
    fetchGitCommentCounts: (ids: string[]) => gitCommentsMock(ids),
    fetchEventRsvps: (addresses: string[]) => eventRsvpsMock(addresses),
  };
});
// Who is going, per event address — nobody unless a test says otherwise.
const eventRsvpsMock = vi.fn<(addresses: string[]) => Promise<Map<string, { going: number; faces: string[] }>>>(() => Promise.resolve(new Map()));
const gitCommentsMock = vi.fn<(ids: string[]) => Promise<Map<string, number>>>(() => Promise.resolve(new Map()));
// Issue / patch states for the Repos tab — none unless a test says otherwise.
const gitStatusesMock = vi.fn<(ids: string[]) => Promise<Map<string, { kind: number; at: number }>>>(() => Promise.resolve(new Map()));
const repoCountsMock = vi.fn<() => Promise<{ issues: number; patches: number }>>(() =>
  Promise.resolve({ issues: 0, patches: 0 }),
);

// Member piles hydrate through fetchProfileMap — stubbed so jsdom never
// touches relays; tests seed profiles into this map per case.
const profileMapMock = new Map<string, { name?: string; picture?: string }>();
// The panel's person can have media of their own — notes with files attached.
const recentByKindsMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock("@/services/nostr", () => ({
  // The person panel asks for the person's tracks and streams; nobody here has any.
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentByKindsMock(pubkey, kinds, limit),
  fetchLiveStreams: () => Promise.resolve([]),
  fetchProfileMap: vi.fn(() => Promise.resolve(profileMapMock)),
}));

// The relay expresses rank as ORDER only — per-author scores come from the
// shared house-influence cache. Faked here so cards can prove they use it.
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.85);
// Event cards carry the RSVP button, which reads the active account; these
// tests are signed out — the button is the sign-in door and never publishes.
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
}));

// Endorsements (reviews / zaps / collections) ride their own memoized hook —
// faked so a card can prove what it does with the answer, not how it got it.
type Endorsements = import("@/services/endorsements").AppEndorsements;
const endorsementsMock = vi.fn<(address: string | null, opts: unknown) => Endorsements | null>(() => null);
vi.mock("@/hooks/useAppEndorsements", () => ({
  useAppEndorsements: (address: string | null, opts: unknown) => endorsementsMock(address, opts),
}));
let followsMock = new Set<string>();
// Wavlake as the second music source: nothing unless a test says otherwise.
type WavlakeSong = import("@/lib/wavlake").WavlakeSong;
type WavlakeHits = import("@/lib/wavlake").WavlakeCatalogueHits;
const wavlakeSearchMock = vi.fn<(term: string) => Promise<WavlakeSong[]>>(() => Promise.resolve([]));
const wavlakeCatalogueMock = vi.fn<(term: string) => Promise<WavlakeHits>>(() => Promise.resolve({ artists: [], albums: [], songs: [] }));
const wavlakeTrendingMock = vi.fn<(opts?: { genre?: string }) => Promise<WavlakeSong[]>>(() => Promise.resolve([]));
vi.mock("@/lib/wavlake", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wavlake")>()),
  searchWavlakeTracks: (term: string) => wavlakeSearchMock(term),
  searchWavlake: (term: string) => wavlakeCatalogueMock(term),
  fetchWavlakeTrending: (opts?: { genre?: string }) => wavlakeTrendingMock(opts),
}));
const wavlakeSong = (id: string, title: string, artist: string, extra: Partial<WavlakeSong> = {}): WavlakeSong => ({
  id: `wavlake:${id}`,
  title,
  artist,
  cover: `https://img/${id}.jpg`,
  audio: `https://cdn/${id}.mp3`,
  durationSec: 200,
  url: `https://wavlake.com/track/${id}`,
  source: "wavlake",
  artistNpub: "",
  ...extra,
});

// A replay is advertised only after its recording answers; here "rec.ok" answers.
vi.mock("@/lib/liveStream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/liveStream")>()),
  verifyRecording: (url: string) => Promise.resolve(url.includes("rec.ok")),
}));

vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: followsMock, ready: true, signedIn: followsMock.size > 0 }),
}));
type PersonEndorsements = import("@/services/endorsements").PersonEndorsements;
const personEndorsementsMock = vi.fn<(pubkey: string | null, personal: boolean) => PersonEndorsements | null>(() => null);
vi.mock("@/hooks/usePersonEndorsements", () => ({
  usePersonEndorsements: (pubkey: string | null, personal: boolean) => personEndorsementsMock(pubkey, personal),
}));
const flagsMock = vi.fn<(pk: string) => boolean | undefined>(() => false);
vi.mock("@/hooks/useAuthorFlags", () => ({
  useAuthorFlags: () => (pk: string) => flagsMock(pk),
}));
// The viewer's network reach (direct follows, friends of friends) — faked so
// the reach filter can prove what it keeps.
const reachMock = vi.fn<(pk?: string | null) => { direct: Set<string>; friends: Set<string>; ready: boolean }>(() => ({ direct: new Set(), friends: new Set(), ready: true }));
vi.mock("@/hooks/useNetworkReach", () => ({ useNetworkReach: (pk?: string | null) => reachMock(pk) }));

import { SearchResults } from "./SearchResults";
import { NowPlayingBar } from "./NowPlayingBar";

function ev(id: string, kind: number, pubkey = "a".repeat(64), content = "", tags: string[][] = []): NostrEvent {
  return { id, kind, pubkey, tags, content, created_at: 1_700_000_000, sig: "s" } as NostrEvent;
}

function person(id: string, pubkey: string, name: string): NostrEvent {
  return ev(id, 0, pubkey, JSON.stringify({ name }));
}

const author = (pubkey: string, name: string) => ({
  pubkey,
  npub: "npub1test",
  name,
  wotRank: null,
  wotFollowers: null,
});

function emit(partial: Partial<SearchSnapshot>) {
  // The tab's own stream (the panel's probes are not it, and neither is the
  // Media tab's companion notes stream): the newest whose tab is the URL's,
  // else simply the newest main stream.
  const urlTab = new URLSearchParams(window.location.search).get("t") ?? "everything";
  const mains = [...allStreams].reverse().filter((c) => !isPanelProbe(c.query, c.params));
  const main = mains.find((c) => c.params.tab === urlTab) ?? mains[0];
  main.cb({ hits: [], eose: false, timeMs: null, error: null, ...partial });
}

beforeEach(() => {
  vi.clearAllMocks();
  recentByKindsMock.mockResolvedValue([]);
  profileMapMock.clear();
  repoCountsMock.mockResolvedValue({ issues: 0, patches: 0 });
  endorsementsMock.mockReturnValue(null);
  followsMock = new Set();
  personEndorsementsMock.mockReturnValue(null);
  flagsMock.mockImplementation(() => false);
  reachMock.mockReturnValue({ direct: new Set(), friends: new Set(), ready: true });
  scoreOfMock.mockImplementation(() => 0.85);
  wavlakeCatalogueMock.mockResolvedValue({ artists: [], albums: [], songs: [] });
  wavlakeTrendingMock.mockResolvedValue([]);
  allStreams = [];
  window.history.replaceState({}, "", "/?q=jack");
});

const setUrlTab = (t: string | null) =>
  window.history.replaceState({}, "", t ? `/?q=jack&t=${t}` : "/?q=jack");

describe("SearchResults", () => {
  // The team: Brainstorm is praised for being clean and the new search is
  // "all very busy" — the blue ring around every profile "is just more
  // information that doesn't need to be there", and Verified badges say
  // nothing "if all of them are verified". So search wears no rings, and
  // trust speaks only as the exception: a person outside the network says so.
  it("search wears no trust rings and marks only the exception — a person outside the network", async () => {
    setUrlTab("people");
    render(<SearchResults query="jack" pov="nosfabrica" />);
    const inside = { ...author("1".repeat(64), "jack"), wotRank: 0.85 };
    // Below the network's line (0.02): no one has vouched for them.
    const outside = { ...author("2".repeat(64), "jack imposter"), wotRank: 0.01 };
    emit({ hits: [{ event: person("p1", inside.pubkey, "jack"), author: inside, rank: null }, { event: person("p2", outside.pubkey, "jack imposter"), author: outside, rank: null }], eose: true, timeMs: 100 });
    const first = await screen.findByTestId("result-profile-0");
    // (The coin keeps its own border for screen readers only; a visible ring is what must be gone.)
    const visibleRing = (root: HTMLElement) => root.querySelector('[class*="shadow-[0_0_0"]:not(.sr-only)');
    expect(visibleRing(first)).toBeNull();
    expect(first).not.toHaveTextContent(/Verified/);
    expect(within(first).queryByTestId("tier-word-chip")).toBeNull();
    const second = screen.getByTestId("result-profile-1");
    expect(visibleRing(second)).toBeNull();
    expect(within(second).getByTestId("tier-word-chip")).toHaveTextContent("Outside your network");
    // Nothing else in the results wears a ring either.
    expect(visibleRing(screen.getByTestId("search-results"))).toBeNull();
  });

  it("streams people into profile cards, skeleton first, count line at EOSE", async () => {
    setUrlTab("people");
    render(<SearchResults query="jack" pov="nosfabrica" />);

    // The main stream starts for the tab with the submitted query (the
    // panel's #topic probe is separate).
    expect(mainStreamCalls()).toHaveLength(1);
    expect(mainStreamCalls()[0][0]).toBe("jack");
    expect(mainStreamCalls()[0][1]).toMatchObject({ tab: "people", pov: "nosfabrica" });

    // Before anything arrives: skeleton.
    expect(screen.getByTestId("container-search-loading")).toBeInTheDocument();

    const alice = person("p1", "b".repeat(64), "alice");
    emit({
      hits: [{ event: alice, author: author(alice.pubkey, "alice"), rank: null }],
      eose: true,
      timeMs: 420,
    });
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.queryByTestId("container-search-loading")).toBeNull();
    expect(screen.getByTestId("text-search-stats").textContent).toContain("0.42");
  });

  it("switching tabs cancels the stream and starts a new one with that tab", async () => {
    setUrlTab("people");
    render(<SearchResults query="jack" pov="nosfabrica" />);
    expect(mainStreamCalls()).toHaveLength(1);

    fireEvent.click(screen.getByTestId("search-tab-notes"));
    expect(cancelMock).toHaveBeenCalled();
    expect(mainStreamCalls()).toHaveLength(2);
    expect(mainStreamCalls()[1][1]).toMatchObject({ tab: "notes" });
    // The tab lands in the URL so results deep-link.
    expect(new URLSearchParams(window.location.search).get("t")).toBe("notes");
  });

  // The SERP composition: Everything is Google's front page — sections, not
  // a flat dump. A user-typed sort: means they chose an order, so the flat
  // honored list returns.
  it("Everything renders the composed sections page", () => {
    render(<SearchResults query="liverpool" pov="nosfabrica" />);
    expect(screen.getByTestId("composed-results")).toBeInTheDocument();
    expect(screen.queryByTestId("container-search-loading")).toBeNull();
    // Five parallel section streams, not one flat stream.
    expect(streamMock.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("a typed sort: bypasses composition — flat list, order honored", () => {
    render(<SearchResults query="liverpool sort:recent" pov="nosfabrica" />);
    expect(screen.queryByTestId("composed-results")).toBeNull();
    expect(mainStreamCalls()).toHaveLength(1);
    expect(mainStreamCalls()[0][0]).toBe("liverpool sort:recent");
  });

  // Content tabs land on what's fresh by default; a typed sort: always wins,
  // and People stays trust-ranked.
  it("content tabs default to newest-first on the wire", () => {
    setUrlTab("notes");
    render(<SearchResults query="bitcoin" pov="nosfabrica" />);
    expect(mainStreamCalls()[0][0]).toBe("bitcoin sort:recent");
  });

  it("a typed sort keeps content tabs exactly as asked", () => {
    setUrlTab("notes");
    render(<SearchResults query="bitcoin sort:rank" pov="nosfabrica" />);
    expect(mainStreamCalls()[0][0]).toBe("bitcoin sort:rank");
  });

  // Browse mode: no keyword, just "show me this vertical" — newest first.
  it("browses a whole vertical when the query is empty", async () => {
    setUrlTab("live");
    render(<SearchResults query="" pov="nosfabrica" />);
    expect(mainStreamCalls()[0][0]).toBe("sort:recent");
    expect(mainStreamCalls()[0][1]).toMatchObject({ tab: "live" });

    // Published just now: a "live" nobody updated in a week is stale by design.
    const live = { ...ev("l1", 30311, "e".repeat(64), "", [["d", "s"], ["title", "NoGood Radio"], ["status", "live"]]), created_at: Math.floor(Date.now() / 1000) };
    emit({ hits: [{ event: live, author: author(live.pubkey, "radio"), rank: null }], eose: true, timeMs: 400 });
    expect(await screen.findByText("NoGood Radio")).toBeInTheDocument();
  });

  // Benjamin: the nine-tab strip was "distracting and takes up a lot of
  // space". Google's shape: five tabs in view, the rest behind More ▾, and
  // the chosen overflow tab takes the More slot so you can see where you are.
  it("shows five verticals and folds Apps, Repos, Live and Lists behind More", () => {
    render(<SearchResults query="jack" pov="nosfabrica" />);
    for (const t of ["everything", "people", "notes", "articles", "media"]) {
      expect(screen.getByTestId(`search-tab-${t}`)).toBeInTheDocument();
    }
    for (const t of ["apps", "repos", "events", "live", "lists"]) expect(screen.queryByTestId(`search-tab-${t}`)).toBeNull();
    expect(screen.queryByTestId("search-tab-code")).toBeNull();

    const more = screen.getByTestId("search-tab-more");
    expect(more).toHaveTextContent("More");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    for (const t of ["apps", "repos", "events", "live", "lists"]) expect(within(menu).getByTestId(`search-tab-${t}`)).toBeInTheDocument();

    fireEvent.click(within(menu).getByTestId("search-tab-apps"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(mainStreamCalls().at(-1)![1]).toMatchObject({ tab: "apps" });
    // The slot now names the active vertical and carries the selected state.
    expect(screen.getByTestId("search-tab-more")).toHaveTextContent("Apps");
    expect(screen.getByTestId("search-tab-more").getAttribute("aria-selected")).toBe("true");
    expect(new URLSearchParams(window.location.search).get("t")).toBe("apps");
  });

  it("a deep link to a folded vertical opens with that vertical named in the More slot", () => {
    setUrlTab("lists");
    render(<SearchResults query="jack" pov="nosfabrica" />);
    expect(screen.getByTestId("search-tab-more")).toHaveTextContent("Lists");
    expect(screen.getByTestId("search-tab-everything").getAttribute("aria-selected")).toBe("false");
  });

  it("the More menu closes on Escape and on a click elsewhere without changing tabs", () => {
    render(<SearchResults query="jack" pov="nosfabrica" />);
    fireEvent.click(screen.getByTestId("search-tab-more"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByTestId("search-tab-more"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("search-tab-everything").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("search-tab-more")).toHaveTextContent("More");
  });

  // The Brainstorm / My perspective control moves INTO this row once results
  // show (two rows of chrome fewer under the box). The page owns that
  // control; the row just gives it a seat beside Filters.
  it("seats the caller's perspective control in the tab row, before Filters", () => {
    render(
      <SearchResults query="jack" pov="nosfabrica" onQueryRewrite={() => {}} perspective={<span data-testid="pov-slot">POV</span>} />,
    );
    const row = screen.getByTestId("search-toolbar");
    const slot = within(row).getByTestId("pov-slot");
    const filters = within(row).getByTestId("search-filters-toggle");
    expect(slot.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and it sits outside the scrolling tab strip, so it never scrolls away
    expect(screen.getByTestId("search-tabs").contains(slot)).toBe(false);
  });

  it("legacy ?t=code deep links land on the Repos tab", () => {
    setUrlTab("code");
    render(<SearchResults query="relay" pov="nosfabrica" />);
    expect(mainStreamCalls()[0][1]).toMatchObject({ tab: "repos" });
  });

  // Vitor's split, the Apps half: Zap Store listings render as real
  // app-store cards — the app's own icon, name, summary, platforms, and a
  // Get-it link out. Fixture is the live-probed PosterChan shape.
  it("renders a Zap Store listing as an app card", async () => {
    setUrlTab("apps");
    render(<SearchResults query="poster" pov="nosfabrica" />);
    const app = ev("app1", 32267, "9".repeat(64), "PosterChan is the Android half of a Nostr-powered personal cloud.", [
      ["d", "place.poster.app"],
      ["name", "PosterChan"],
      ["summary", "A Nostr-powered personal cloud and self-hosted AI"],
      ["icon", "https://cdn.zapstore.dev/icon.png"],
      ["url", "https://poster.place"],
      ["repository", "https://github.com/example/posterchan"],
      ["f", "android-arm64-v8a"],
      ["f", "android-x86"],
      ["license", "GPL-3.0-or-later"],
    ]);
    emit({ hits: [{ event: app, author: author(app.pubkey, "zapstore bot"), rank: null }], eose: true, timeMs: 200 });

    expect(await screen.findByText("PosterChan")).toBeInTheDocument();
    expect(screen.getByText(/personal cloud and self-hosted AI/)).toBeInTheDocument();
    const icon = screen.getByTestId("app-icon-app1") as HTMLImageElement;
    expect(icon.src).toContain("cdn.zapstore.dev/icon.png");
    // Platforms dedupe to one human word.
    // Twice now: the card chip AND the platform facet above the results.
    expect(screen.getAllByText("Android")).toHaveLength(2);
    // "Get it" goes where you actually get it — the app's Zap Store page,
    // wearing Zap Store's favicon — not the marketing site.
    const getIt = screen.getByTestId("app-get-app1");
    expect(getIt.getAttribute("href")).toMatch(/^https:\/\/zapstore\.dev\/apps\/naddr1/);
    expect(getIt.querySelector("img")?.getAttribute("src")).toContain("zapstore.dev");
    // A new tab (the reader keeps their place) with noopener — but WITH a
    // referrer, so the destination sees Brainstorm as the traffic source.
    expect(getIt.getAttribute("target")).toBe("_blank");
    expect(getIt.getAttribute("rel")).toBe("noopener");
  });

  // Benjamin, over the Apps grid: "the containers are all different sizes —
  // keep them all the same size and make it look nice; maybe the logo icon
  // should be in the right corner". App-store anatomy: every card the same
  // height (grid items stretch, the summary always reserves two lines), the
  // icon in the top-right corner, and Get it in the footer beside the
  // publisher — where the eye lands last, like the store's GET button.
  it("app cards share one shape: icon in the corner, Get it in the footer, equal heights", async () => {
    setUrlTab("apps");
    render(<SearchResults query="poster" pov="nosfabrica" />);
    const long = ev("app1", 32267, "9".repeat(64), "", [["d", "a"], ["name", "PosterChan"], ["summary", "A Nostr-powered personal cloud and self-hosted AI — notes, calendar, contacts, files, passwords"], ["icon", "https://cdn.zapstore.dev/icon.png"], ["f", "android-arm64-v8a"], ["license", "GPL-3.0-or-later"]]);
    // No d tag → no Zap Store page, no site, no repo: nowhere to "get it".
    const short = ev("app2", 32267, "8".repeat(64), "", [["name", "Ditto"], ["summary", "Your content."]]);
    emit({ hits: [long, short].map((e) => ({ event: e, author: author(e.pubkey, "pub"), rank: null })), eose: true, timeMs: 200 });
    const card = await screen.findByTestId("app-card-app1");

    // Reading order = tab order: name, summary, chips, publisher, then Get it.
    const getIt = within(card).getByTestId("app-get-app1");
    const publisher = within(card).getByText("Published by");
    expect(publisher.compareDocumentPosition(getIt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByTestId("app-get-slot-app1")).toContainElement(getIt);
    // The icon sits in its own corner slot, not inline before the name.
    const icon = within(card).getByTestId("app-icon-app1");
    const name = within(card).getByText("PosterChan");
    expect(name.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Both cards fill their grid cell; the summary block reserves two lines
    // even for a one-line summary, so a row of cards lines up.
    for (const id of ["app1", "app2"]) {
      expect(screen.getByTestId(`app-card-${id}`).className).toMatch(/\bh-full\b/);
      expect(screen.getByTestId(`app-summary-${id}`).className).toMatch(/line-clamp-2/);
      expect(screen.getByTestId(`app-summary-${id}`).className).toMatch(/min-h-/);
    }
    // No Get it at all → the slot is simply absent, the footer stays put.
    expect(within(screen.getByTestId("app-card-app2")).queryByTestId("app-get-slot-app2")).toBeNull();
  });

  // Benjamin: "we should be able to filter by events also — via search
  // browse filters… view past and future events… in a pretty designed way".
  // NIP-52 calendar events get their own vertical. The relay only knows
  // created_at (probed: 44k events, no start-tag filter), so the tab asks
  // for a deep recent page and does the calendar work here: a When facet
  // row, Upcoming by default and soonest-first, Past newest-first.
  describe("Events tab", () => {
    const DAY = 86_400;
    const nowSec = Math.floor(Date.now() / 1000);
    const cal = (id: string, title: string, start: number, extra: string[][] = [], pubkey = "c".repeat(64)) =>
      ev(id, 31923, pubkey, "", [["d", id], ["title", title], ["start", String(start)], ["location", "Liverpool, UK"], ...extra]);
    // (The conference has a different organiser — same-author near-identical
    // titles collapse behind a +N chip, which is its own test below.)
    const emitEvents = () =>
      emit({
        hits: [
          { event: cal("e-next-month", "Bitcoin Liverpool Conference", nowSec + 20 * DAY, [], "d".repeat(64)), author: author("d".repeat(64), "conf"), rank: null },
          { event: cal("e-tonight", "Bitcoin Liverpool Meetup", nowSec + 5 * 3600), author: author("c".repeat(64), "club"), rank: null },
          { event: cal("e-last-week", "Bitcoin Liverpool Meetup (Aug)", nowSec - 7 * DAY), author: author("c".repeat(64), "club"), rank: null },
        ],
        eose: true,
        timeMs: 300,
      });

    it("is a vertical of its own behind More and asks the relay for a deep recent page", () => {
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      fireEvent.click(screen.getByTestId("search-tab-more"));
      fireEvent.click(screen.getByTestId("search-tab-events"));
      const [q, params] = mainStreamCalls().at(-1)!;
      expect(q).toBe("liverpool sort:recent");
      expect(params).toMatchObject({ tab: "events", limit: 300 });
    });

    it("shows upcoming events soonest-first by default, with a When facet row that counts", async () => {
      setUrlTab("events");
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      emitEvents();
      const cards = await screen.findAllByTestId(/^event-card-/);
      expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["event-card-e-tonight", "event-card-e-next-month"]);
      expect(screen.queryByTestId("event-card-e-last-week")).toBeNull();
      const facets = screen.getByTestId("event-facets");
      expect(within(facets).getByTestId("event-facet-upcoming")).toHaveTextContent("Upcoming 2");
      expect(within(facets).getByTestId("event-facet-upcoming").getAttribute("aria-pressed")).toBe("true");
      expect(within(facets).getByTestId("event-facet-past")).toHaveTextContent("Past 1");
      // The card reads as an event: the start time, the title, who hosts, where.
      const tonight = screen.getByTestId("event-card-e-tonight");
      expect(within(tonight).getByTestId("event-time-e-tonight")).toHaveTextContent(/\d{1,2}:\d{2}/);
      expect(tonight).toHaveTextContent("Bitcoin Liverpool Meetup");
      expect(tonight).toHaveTextContent("Liverpool, UK");
      expect(tonight).toHaveTextContent(/By\s*club/);
    });

    // Luma's list is a timeline: a header per day, cards under it that lead
    // with the start time — the date is said once — and the guests who said
    // they are going, as faces with a count.
    it("is a timeline: a header per day with the date said once, cards led by their time, and who is going", async () => {
      setUrlTab("events");
      const addr = "31923:" + "c".repeat(64) + ":e-tonight";
      eventRsvpsMock.mockResolvedValue(new Map([[addr, { going: 3, faces: ["1".repeat(64), "2".repeat(64), "3".repeat(64)] }]]));
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      emitEvents();
      await screen.findByTestId("event-card-e-tonight");
      const days = screen.getAllByTestId(/^event-day-/);
      expect(days).toHaveLength(2);
      expect(days[0]).toHaveTextContent(/Today|Tomorrow/);
      expect(days[1]).toHaveTextContent(new Date((nowSec + 20 * DAY) * 1000).toLocaleDateString(undefined, { month: "short" }));
      // The date is in the header, not repeated on every card.
      expect(within(screen.getByTestId("event-card-e-tonight")).queryByTestId("event-date-tile")).toBeNull();
      expect(eventRsvpsMock).toHaveBeenCalledWith(expect.arrayContaining([addr]));
      const going = await within(screen.getByTestId("event-card-e-tonight")).findByTestId("event-going-e-tonight");
      expect(going).toHaveTextContent("3 going");
      expect(going.querySelectorAll('[data-testid^="event-going-face-"]')).toHaveLength(3);
      expect(within(screen.getByTestId("event-card-e-next-month")).queryByTestId("event-going-e-next-month")).toBeNull();
    });

    // Benjamin, over the phone view: a header "Wed, Sep 2" led the Upcoming
    // shelf — a bird-walk series that started days ago and runs on for weeks.
    // Ongoing is not a date; the shelf says so. And the RSVP pill in the
    // card's corner was squeezing titles to "Kansas City Sovereign…" on a
    // phone, where the event page has the real button: it hides below sm and
    // the title takes the width.
    it("an event already running leads Upcoming under \"Ongoing\", and phones give the title its width", async () => {
      setUrlTab("events");
      render(<SearchResults query="raystown" pov="nosfabrica" />);
      const pk = "c".repeat(64);
      const running = ev("e-running", 31922, pk, "", [["d", "walks"], ["title", "Migration Morning Bird Walks"], ["start", new Date((nowSec - 3 * DAY) * 1000).toISOString().slice(0, 10)], ["end", new Date((nowSec + 10 * DAY) * 1000).toISOString().slice(0, 10)]]);
      const later = ev("e-later", 31923, pk, "", [["d", "later"], ["title", "Juniata College Women's Soccer"], ["start", String(nowSec + 6 * DAY)], ["end", String(nowSec + 6 * DAY + 7200)]]);
      emit({ hits: [running, later].map((event) => ({ event, author: author(pk, "Raystown Events"), rank: null })), eose: true, timeMs: 120 });
      await screen.findByTestId("event-card-e-running");
      const days = screen.getAllByTestId(/^event-day-/);
      expect(days[0].getAttribute("data-testid")).toBe("event-day-ongoing");
      expect(days[0]).toHaveTextContent("Ongoing");
      expect(days[0].querySelector('[data-testid="day-header-tile"]')).toBeNull();
      expect(days[1]).not.toHaveTextContent("Ongoing");
      const card = screen.getByTestId("event-card-e-running");
      const corner = within(card).getByTestId("card-corner");
      expect((corner.firstElementChild as HTMLElement).className).toMatch(/hidden sm:inline-flex/);
      const title = within(card).getByText("Migration Morning Bird Walks");
      expect(title.className).toMatch(/sm:pr-24/);
      expect(title.className).not.toMatch(/(^|\s)pr-24/);
    });

    it("Past flips to what already happened, newest first", async () => {
      setUrlTab("events");
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      emitEvents();
      await screen.findByTestId("event-card-e-tonight");
      fireEvent.click(screen.getByTestId("event-facet-past"));
      const cards = screen.getAllByTestId(/^event-card-/);
      expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["event-card-e-last-week"]);
    });

    it("with nothing upcoming, shows past events and says so instead of an empty page", async () => {
      setUrlTab("events");
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      emit({
        hits: [{ event: cal("e-old", "Bitcoin Liverpool Meetup (Aug)", nowSec - 7 * DAY), author: author("c".repeat(64), "club"), rank: null }],
        eose: true,
        timeMs: 300,
      });
      await screen.findByTestId("event-card-e-old");
      expect(screen.getByTestId("event-facets-note")).toHaveTextContent(/No upcoming events.*showing past/i);
    });

    // An upcoming event's one action is "I'm going" — a NIP-52 RSVP on
    // Nostr, no calendar vendor (Benjamin: "I don't want this to go to
    // Google"). Past events with a recording offer the replay instead.
    it("upcoming cards offer I'm going; past cards with a recording offer the replay", async () => {
      setUrlTab("events");
      render(<SearchResults query="liverpool" pov="nosfabrica" />);
      emit({
        hits: [
          { event: cal("e-up", "Meetup", nowSec + DAY), author: null, rank: null },
          { event: cal("e-rec", "Talk", nowSec - DAY, [["recording", "https://youtu.be/abc12345"]]), author: null, rank: null },
        ],
        eose: true,
        timeMs: 300,
      });
      const up = await screen.findByTestId("event-card-e-up");
      expect(within(up).getByTestId("event-rsvp")).toHaveTextContent(/I'm going/);
      expect(within(up).queryByTestId("event-open-e-up")).toBeNull();
      expect(up.querySelector('a[href*="google"]')).toBeNull();
      fireEvent.click(screen.getByTestId("event-facet-past"));
      expect(screen.getByTestId("event-open-e-rec").getAttribute("href")).toBe("https://youtu.be/abc12345");
      expect(screen.getByTestId("event-open-e-rec")).toHaveTextContent(/replay/i);
    });
  });

  // Benjamin: reviews, reviewer faces and quotes stay OFF the search cards —
  // they live on the app page. A card is icon, name, summary, chips, publisher.
  it("app cards carry no reviews, faces or quotes, whatever the network said", async () => {
    setUrlTab("apps");
    endorsementsMock.mockReturnValue({
      address: "32267:" + "9".repeat(64) + ":com.vitorpamplona.amethyst",
      reviews: [{ id: "r1", pubkey: "1".repeat(64), text: "love it", at: 1, version: null, k: "32267", kind: 1111 }],
      reviewCount: 14, zaps: [], zapCount: 101, collectionCount: 46,
    });
    render(<SearchResults query="amethyst" pov="nosfabrica" />);
    const app = ev("app1", 32267, "9".repeat(64), "", [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"], ["summary", "The all-in-one Nostr client"]]);
    emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });
    await screen.findByTestId("app-card-app1");
    expect(screen.queryByTestId("app-endorsements-app1")).toBeNull();
    expect(screen.queryByTestId("app-endorsement-quote-app1")).toBeNull();
    expect(screen.getByTestId("app-card-app1")).not.toHaveTextContent(/Reviewed by|collection/);
    expect(endorsementsMock).not.toHaveBeenCalled();
  });

  // Benjamin's review catch: People cards rendered bare — no ring, no coin,
  // no tier word — because relay hits carry wotRank null (rank is order-only
  // on the wire). The verification chrome must feed from the same per-author
  // score source the note cards already use, so the user's display settings
  // apply on EVERY tab.
  it("people cards get verification chrome from the author-score source", async () => {
    setUrlTab("people");
    render(<SearchResults query="jack" pov="nosfabrica" />);
    const p = person("p1", "b".repeat(64), "jack");
    emit({
      hits: [{ event: p, author: { ...author(p.pubkey, "jack"), wotRank: null }, rank: null }],
      eose: true,
      timeMs: 100,
    });
    await screen.findByText("jack");
    // The coin (whatever display mode renders it as) carries the accessible
    // verification label — present only when a score reached the card.
    expect(screen.getByLabelText(/Verification/)).toBeInTheDocument();
  });

  it("renders note hits as note cards with the hydrated author shown", async () => {
    setUrlTab("notes");
    render(<SearchResults query="bitcoin" pov="nosfabrica" />);
    const note = ev("n1", 1, "c".repeat(64), "gm, bitcoin is doing fine");
    emit({
      hits: [{ event: note, author: author(note.pubkey, "carol"), rank: null }],
      eose: true,
      timeMs: 300,
    });
    // The note body renders, and the multi-author feed shows who wrote it.
    expect(await screen.findByText(/bitcoin is doing fine/)).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
  });

  it("renders article hits as article cards by title", async () => {
    setUrlTab("articles");
    render(<SearchResults query="mining" pov="nosfabrica" />);
    const article = ev("a1", 30023, "d".repeat(64), "long form body", [
      ["d", "my-article"],
      ["title", "The State of Mining"],
    ]);
    emit({ hits: [{ event: article, author: author(article.pubkey, "dave"), rank: null }], eose: true, timeMs: 300 });
    expect(await screen.findByText("The State of Mining")).toBeInTheDocument();
  });

  it("renders a live event with its status pill and title", async () => {
    setUrlTab("live");
    render(<SearchResults query="conf" pov="nosfabrica" />);
    const live = { ...ev("l1", 30311, "e".repeat(64), "", [
      ["d", "stream-1"],
      ["title", "Nostr Dev Call"],
      ["status", "live"],
    ]), created_at: Math.floor(Date.now() / 1000) };
    emit({ hits: [{ event: live, author: author(live.pubkey, "erin"), rank: null }], eose: true, timeMs: 200 });
    expect(await screen.findByText("Nostr Dev Call")).toBeInTheDocument();
    expect(screen.getByTestId("live-status-l1")).toHaveTextContent(/live/i);
  });

  // Benjamin: "when users are searching live it needs to be laid out like
  // YouTube or Twitch… simple, less is more". The thumbnail is the card: a
  // grid of 16:9 posters wearing a LIVE pill with the viewer count and how
  // long it has been on; the title and the channel below — the streamer the
  // `p host` tag names, never the platform that published. Three shelves,
  // Live · Upcoming · Replays, live sorted by viewers; an ended stream is a
  // replay only after its recording answers; closed rooms never show.
  it("the Live tab is a YouTube-style grid with LIVE pills, viewers, time on air, the host as channel, and Live · Upcoming · Replays shelves", async () => {
    const now = Math.floor(Date.now() / 1000);
    const platform = "e".repeat(64);
    const host = "f".repeat(64);
    profileMapMock.set(host, { name: "erin", picture: "https://img/erin.jpg" });
    setUrlTab("live");
    render(<SearchResults query="" pov="nosfabrica" />);
    // Every fixture is freshly published: a "live" nobody updated in a week is stale by design.
    const mk = (id: string, kind: number, tags: string[][]) => ({ ...ev(id, kind, platform, "", [["d", id], ...tags]), created_at: now });
    const hits = [
      mk("l2", 30311, [["title", "Chill Radio"], ["status", "live"], ["current_participants", "5"], ["starts", String(now - 3 * 86_400)], ["t", "radio"]]),
      mk("l1", 30311, [["title", "Nostr Dev Call"], ["status", "live"], ["image", "https://img/dev.jpg"], ["current_participants", "23"], ["starts", String(now - (2 * 3600 + 15 * 60))], ["t", "streaming"], ["t", "tech"], ["p", host, "wss://r", "host"]]),
      mk("r1", 30311, [["title", "Yesterday's show"], ["status", "ended"], ["recording", "https://rec.ok/r1.m3u8"]]),
      mk("r2", 30311, [["title", "Lost show"], ["status", "ended"], ["recording", "https://rec.dead/r2.m3u8"]]),
      mk("e1", 30311, [["title", "Gone"], ["status", "ended"]]),
      mk("m1", 30313, [["title", "Grounded Value"], ["status", "planned"], ["starts", String(now + 3 * 3600)]]),
      mk("c1", 30312, [["status", "closed"], ["room", "x"]]),
    ].map((event) => ({ event, author: author(platform, "zap.stream"), rank: null }));
    emit({ hits, eose: true, timeMs: 300 });

    const grid = await screen.findByTestId("container-search-results");
    expect(grid.className).toMatch(/grid/);
    const tiles = () => [...grid.querySelectorAll('[data-testid^="live-tile-"]')].map((n) => n.getAttribute("data-testid"));
    // Live first, most watched first.
    expect(tiles()).toEqual(["live-tile-l1", "live-tile-l2"]);
    const l1 = screen.getByTestId("live-tile-l1");
    expect(within(l1).getByTestId("live-status-l1")).toHaveTextContent(/LIVE/);
    expect(within(l1).getByTestId("live-status-l1")).toHaveTextContent("23");
    expect(within(l1).getByTestId("live-onair-l1")).toHaveTextContent("2h 15m");
    expect(screen.queryByTestId("live-onair-l2")).toBeNull();
    expect((l1.querySelector("img") as HTMLImageElement).src).toBe("https://img/dev.jpg");
    await vi.waitFor(() => expect(l1).toHaveTextContent("erin"));
    expect(l1).not.toHaveTextContent("zap.stream");
    // One quiet category, the generic platform words dropped.
    expect(l1).toHaveTextContent("tech");
    expect(l1).not.toHaveTextContent("streaming");
    expect(l1.querySelector("a")?.getAttribute("href")).toMatch(/^\/e\//);

    // Shelves with counts; Replays counts only the recording that answered.
    const facets = screen.getByTestId("live-facets");
    expect(within(facets).getByTestId("live-facet-live")).toHaveAttribute("aria-pressed", "true");
    expect(within(facets).getByTestId("live-facet-live")).toHaveTextContent("Live 2");
    expect(within(facets).getByTestId("live-facet-upcoming")).toHaveTextContent("Upcoming 1");
    await vi.waitFor(() => expect(within(facets).getByTestId("live-facet-replays")).toHaveTextContent("Replays 1"));

    fireEvent.click(within(facets).getByTestId("live-facet-upcoming"));
    expect(tiles()).toEqual(["live-tile-m1"]);
    expect(within(screen.getByTestId("live-tile-m1")).getByTestId("live-status-m1")).toHaveTextContent(/Upcoming/);
    fireEvent.click(within(facets).getByTestId("live-facet-replays"));
    expect(tiles()).toEqual(["live-tile-r1"]);
    expect(within(screen.getByTestId("live-tile-r1")).getByTestId("live-status-r1")).toHaveTextContent(/Replay/);
    for (const gone of ["r2", "e1", "c1"]) expect(screen.queryByTestId(`live-tile-${gone}`)).toBeNull();
  });

  // Benjamin, over two "live" tiles with no picture and no stream: "events
  // showing up as live with no thumbnails, no video replay either — we should
  // fix this so users don't get confused". A live nobody updated in a week is
  // gone; one a day old shows only once its stream answers; a poster that is
  // not a picture gives way to the channel's own art.
  it("stale live events never show, an old one must prove its stream, and a broken poster falls back to the channel", async () => {
    const now = Math.floor(Date.now() / 1000);
    setUrlTab("live");
    render(<SearchResults query="joe martin" pov="nosfabrica" />);
    const mk = (id: string, ageSec: number, tags: string[][]) => ({ ...ev(id, 30311, "e".repeat(64), "", [["d", id], ["title", `Show ${id}`], ["status", "live"], ...tags]), created_at: now - ageSec });
    const hits = [
      mk("fresh", 600, [["streaming", "https://rec.dead/fresh.m3u8"], ["image", "https://www.venue.example/joe-martin"]]),
      mk("stale", 78 * 86_400, [["streaming", "https://rec.ok/stale.m3u8"]]),
      mk("oldok", 2 * 86_400, [["streaming", "https://rec.ok/old.m3u8"]]),
      mk("olddead", 2 * 86_400, [["streaming", "https://rec.dead/old.m3u8"]]),
    ].map((event) => ({ event, author: { ...author("e".repeat(64), "tunestr"), picture: "https://img/tunestr.jpg" }, rank: null }));
    emit({ hits, eose: true, timeMs: 300 });

    const fresh = await screen.findByTestId("live-tile-fresh");
    // Fresh is trusted without a check, dead manifest or not.
    expect(fresh).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByTestId("live-tile-oldok")).toBeInTheDocument());
    expect(screen.queryByTestId("live-tile-stale")).toBeNull();
    expect(screen.queryByTestId("live-tile-olddead")).toBeNull();
    expect(screen.getByTestId("live-facet-live")).toHaveTextContent("Live 2");

    // The venue's web page is not a picture: when it fails, the channel's art stands in.
    const poster = fresh.querySelector("img") as HTMLImageElement;
    expect(poster.src).toBe("https://www.venue.example/joe-martin");
    fireEvent.error(poster);
    const art = within(fresh).getByTestId("live-art-fresh");
    expect(art.querySelector("img")?.getAttribute("src")).toBe("https://img/tunestr.jpg");
  });

  // When every stream the words matched is stale or unrecorded, the tab must
  // say so — never a blank page under a count of eleven.
  it("the Live tab says when nothing matched is live, upcoming or replayable", async () => {
    const now = Math.floor(Date.now() / 1000);
    setUrlTab("live");
    render(<SearchResults query="joe martin" pov="nosfabrica" />);
    const stale = { ...ev("stale", 30311, "e".repeat(64), "", [["d", "stale"], ["title", "Joe Martin - Live from Barnoldswick"], ["status", "live"], ["streaming", "https://rec.dead/x.m3u8"]]), created_at: now - 900 * 86_400 };
    const gone = { ...ev("gone", 30311, "e".repeat(64), "", [["d", "gone"], ["title", "Nostrville"], ["status", "ended"]]), created_at: now - 300 * 86_400 };
    emit({ hits: [stale, gone].map((event) => ({ event, author: author(event.pubkey, "tunestr"), rank: null })), eose: true, timeMs: 300 });
    const empty = await screen.findByTestId("live-empty");
    expect(empty).toHaveTextContent(/nothing live/i);
    expect(empty).toHaveTextContent(/2 past streams/i);
    expect(screen.queryByTestId("live-facets")).toBeNull();
    expect(screen.queryByTestId("container-no-results")).toBeNull();
  });

  // Benjamin: musicians like Ainsley Costello should have their songs show up
  // as playable through search. Kind 31337 is the native track (Wavlake,
  // Stemstr, Tunestr — 8.6k on the relay), but the kind is also abused for
  // game state and ad-skip data, so a track is only a track when it has a
  // title and something to play.
  it("the Music tab plays native tracks in place and drops the kind's junk", async () => {
    setUrlTab("music");
    render(<SearchResults query="jazz" pov="nosfabrica" />);
    const main = [...allStreams].reverse()[0];
    expect(main.params.tab).toBe("music");

    const nova = "d".repeat(64);
    const track = ev("t1", 31337, nova, "", [
      ["d", "old-carbon"],
      ["title", "Old Carbon"],
      ["artist", "NOVA"],
      ["media", "https://renaissancemachine.ai/music/2026-08-05-old-carbon.mp3"],
      ["image", "https://renaissancemachine.ai/music/old-carbon.jpg"],
      ["duration", "214"],
      ["t", "jazz"],
    ]);
    const junk = ev("t2", 31337, "e".repeat(64), '{"players":[{"id":"p1","name":"Dylan"}]}', [["d", "TOMB-7703"]]);
    emit({ hits: [{ event: track, author: author(nova, "NOVA"), rank: null }, { event: junk, author: null, rank: null }], eose: true, timeMs: 150 });

    const card = await screen.findByTestId("track-card-t1");
    expect(card).toHaveTextContent("Old Carbon");
    expect(card).toHaveTextContent("NOVA");
    // The cover is the play button — the same inline player the profile page uses.
    expect(within(card).getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
    // Rows, not boxes: a list of songs reads like Spotify's, hairlines between rows.
    expect(card.className).not.toMatch(/border|rounded-2xl|px-2/);
    expect(within(card).getByTestId("embedded-track").className).not.toMatch(/\bborder\b/);
    expect(card.parentElement?.className).toMatch(/divide-y/);
    expect(screen.queryByTestId("track-card-t2")).toBeNull();
    expect(screen.queryByText(/TOMB-7703/)).toBeNull();
  });

  // Browse led with "QA storage fixture qa41" and "Test Blossom" — Fanfares'
  // QA bot and blob tests publish the kind. Not songs anyone searched for.
  it("the Music tab drops QA and test publications", async () => {
    setUrlTab("music");
    render(<SearchResults query="" pov="nosfabrica" />);
    const qa = ev("qa1", 31337, "5".repeat(64), "", [["d", "qa41"], ["title", "QA storage fixture qa41 #2"], ["artist", "ff-qa-creator"], ["t", "fanfares-qa"], ["media", "https://blossom.test/qa41.mp3"]]);
    const song = ev("s1", 31337, "6".repeat(64), "", [["d", "ten"], ["title", "Ten Bottles"], ["artist", "NOVA"], ["t", "ambient-folk"], ["media", "https://renaissancemachine.ai/music/ten.mp3"]]);
    emit({ hits: [qa, song].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })), eose: true, timeMs: 90 });
    await screen.findByTestId("track-card-s1");
    expect(screen.queryByTestId("track-card-qa1")).toBeNull();
  });

  // Benjamin: "should it feel like a Spotify?" Before any words, Spotify shows
  // a home, not a list. Ours leads with what people are paying for — Wavlake's
  // top tracks by sats this week, as cover tiles — with genre chips that re-ask
  // the chart, and the newest native tracks below as the queue.
  it("the Music tab, before any words, is a discovery front: Trending tiles, genre chips, New on Nostr rows", async () => {
    wavlakeTrendingMock.mockResolvedValue([
      wavlakeSong("c1", "Carnival (Live recording)", "Sara Jade", { sats: 7777 }),
      wavlakeSong("i1", "Ikigai", "Aaron Koenig", { sats: 15000 }),
    ]);
    setUrlTab("music");
    render(<SearchResults query="" pov="nosfabrica" />);
    const song = ev("s1", 31337, "6".repeat(64), "", [["d", "ten"], ["title", "Ten Bottles"], ["artist", "NOVA"], ["t", "ambient-folk"], ["media", "https://renaissancemachine.ai/music/ten.mp3"]]);
    emit({ hits: [{ event: song, author: author(song.pubkey, "NOVA"), rank: null }], eose: true, timeMs: 90 });

    const trending = await screen.findByTestId("music-trending");
    expect(trending).toHaveTextContent("Trending on Wavlake");
    const tile = within(trending).getByTestId("music-tile-wavlake:c1");
    expect(tile).toHaveTextContent("Carnival (Live recording)");
    expect(tile).toHaveTextContent("Sara Jade");
    expect(tile).toHaveTextContent("7.8k sats");
    expect(within(tile).getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect((tile.querySelector("img") as HTMLImageElement).src).toBe("https://img/c1.jpg");
    expect(wavlakeTrendingMock.mock.calls[0]?.[0]?.genre).toBeUndefined();

    const fresh = screen.getByTestId("music-new");
    expect(fresh).toHaveTextContent("New on Nostr");
    expect(within(fresh).getByTestId("track-card-s1")).toHaveTextContent("Ten Bottles");

    // A genre chip re-asks the chart for that genre.
    const rock = screen.getByTestId("music-genre-rock");
    fireEvent.click(rock);
    await vi.waitFor(() => expect(wavlakeTrendingMock).toHaveBeenLastCalledWith({ genre: "rock" }));
    expect(rock).toHaveAttribute("aria-pressed", "true");
  });

  // With words, Spotify's anatomy: the artist as the Top result when a name
  // matches, Songs as rows from both sources, Artists as faces with their
  // trust rings, Albums as Wavlake tiles — and the results' own genres as chips.
  it("with words, Music groups results: Top result, Songs, Artists with rings, Albums, genre chips", async () => {
    wavlakeCatalogueMock.mockResolvedValue({
      // Live decoy: Wavlake led "nova" with Freddy Donovan — the letters inside a word.
      artists: [
        { id: "fr3d", name: "Freddy Donovan", url: "https://wavlake.com/freddy-donovan", artistNpub: "" },
        { id: "a1", name: "NOVA Sound System", url: "https://wavlake.com/nova-sound-system", artworkUrl: "https://img/nova.jpg", artistNpub: "" },
      ],
      albums: [{ id: "al1", title: "Deep Space", artist: "NOVA Sound System", artworkUrl: "https://img/deep.jpg", url: "https://wavlake.com/album/al1" }],
      songs: [wavlakeSong("w1", "Orbit", "NOVA Sound System")],
    });
    setUrlTab("music");
    render(<SearchResults query="nova" pov="nosfabrica" />);
    const nova = "d".repeat(64);
    const mk = (id: string, title: string, genre: string) =>
      ev(id, 31337, nova, "", [["d", id], ["title", title], ["artist", "NOVA"], ["t", genre], ["media", `https://renaissancemachine.ai/music/${id}.mp3`], ["image", `https://renaissancemachine.ai/music/${id}.jpg`]]);
    const hits = [mk("g1", "Old Carbon", "jazz"), mk("g2", "Duende", "jazz"), mk("g3", "Fulgurite", "post-rock")].map((event) => ({ event, author: author(nova, "NOVA"), rank: null }));
    emit({ hits, eose: true, timeMs: 150 });

    const top = await screen.findByTestId("music-top-result");
    expect(top).toHaveAttribute("data-kind", "artist");
    // The person on Nostr wins at equal strength: "NOVA" IS the words; the catalogue's NOVA Sound System only starts with them.
    expect(top).toHaveTextContent("NOVA");
    expect(top).toHaveTextContent("3 songs");
    expect(top).not.toHaveTextContent("Freddy Donovan");
    expect(top).not.toHaveTextContent("NOVA Sound System");
    expect(within(top).getByTestId("music-top-play")).toHaveAttribute("aria-label", "Play");

    const songs = screen.getByTestId("music-songs");
    expect(songs).toHaveTextContent("Songs");
    expect(songs).toHaveTextContent("4");
    within(songs).getByTestId("track-card-g1");
    within(songs).getByTestId("wavlake-song-wavlake:w1");
    within(songs).getByTestId("music-play-all");

    const artists = screen.getByTestId("music-artists");
    const face = within(artists).getByTestId(`music-artist-${nova.slice(0, 8)}`);
    expect(face).toHaveTextContent("NOVA");
    expect(face).toHaveTextContent("3 songs");
    // Search wears no trust rings (the team: "the blue circle thing… doesn't need to be there").
    expect(face.querySelector('[class*="shadow-[0_0_0"]')).toBeNull();
    const remote = within(artists).getByTestId("music-artist-wavlake-a1");
    expect(remote).toHaveAttribute("href", "https://wavlake.com/nova-sound-system");
    expect(remote).toHaveTextContent("Wavlake");

    const albums = screen.getByTestId("music-albums");
    expect(within(albums).getByTestId("music-album-al1")).toHaveTextContent("Deep Space");

    // Genre chips: only genres two or more tracks share; a chip narrows the songs.
    expect(screen.getByTestId("music-genre-jazz")).toHaveTextContent("Jazz");
    expect(screen.queryByTestId("music-genre-post-rock")).toBeNull();
    fireEvent.click(screen.getByTestId("music-genre-jazz"));
    expect(screen.queryByTestId("track-card-g3")).toBeNull();
    expect(screen.getByTestId("track-card-g1")).toBeInTheDocument();
  });

  // One Play starts the list from the top and a slim bar says what is playing
  // wherever the page has scrolled to; Next moves down the list.
  it("Play starts the queue and the now-playing bar follows it", async () => {
    setUrlTab("music");
    // The bar is mounted once at the app shell; here it sits beside the results.
    render(<><SearchResults query="nova" pov="nosfabrica" /><NowPlayingBar /></>);
    const nova = "d".repeat(64);
    const mk = (id: string, title: string) =>
      ev(id, 31337, nova, "", [["d", id], ["title", title], ["artist", "NOVA"], ["media", `https://renaissancemachine.ai/music/${id}.mp3`], ["image", `https://renaissancemachine.ai/music/${id}.jpg`]]);
    emit({ hits: [mk("q1", "Old Carbon"), mk("q2", "Duende")].map((event) => ({ event, author: author(nova, "NOVA"), rank: null })), eose: true, timeMs: 150 });
    await screen.findByTestId("track-card-q1");
    expect(screen.queryByTestId("now-playing-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("music-play-all"));
    const bar = await screen.findByTestId("now-playing-bar");
    expect(within(bar).getByTestId("now-playing-title")).toHaveTextContent("Old Carbon");
    // The bar wears the artwork — a soft wash of the cover behind the words — and names what is next.
    expect((within(bar).getByTestId("now-playing-backdrop") as HTMLImageElement).src).toBe("https://renaissancemachine.ai/music/q1.jpg");
    expect(within(bar).getByTestId("now-playing-up-next")).toHaveTextContent("Duende");
    fireEvent.click(within(bar).getByTestId("now-playing-next"));
    await vi.waitFor(() => expect(within(bar).getByTestId("now-playing-title")).toHaveTextContent("Duende"));
    // Last in the queue: nothing is next.
    expect(within(bar).queryByTestId("now-playing-up-next")).toBeNull();
  });

  // Ainsley Costello publishes no native tracks; her music is on Wavlake. The
  // Music tab asks Wavlake with the same words and plays what it finds,
  // labelled as Wavlake's — so the tab is never "Nothing found" for an artist
  // whose songs are one API away.
  it("the Music tab plays Wavlake's songs for the words, labelled, when Nostr has none", async () => {
    wavlakeCatalogueMock.mockResolvedValue({
      artists: [],
      albums: [],
      songs: [{ id: "wavlake:04cead49", title: "Two Ships", artist: "Ainsley Costello", cover: "https://img/two-ships.jpg", audio: "https://cdn/two-ships.mp3", durationSec: 217, url: "https://wavlake.com/track/04cead49", source: "wavlake", artistNpub: "" }],
    });
    setUrlTab("music");
    render(<SearchResults query="Ainsley Costello" pov="nosfabrica" />);
    emit({ hits: [], eose: true, timeMs: 90 });

    const card = await screen.findByTestId("wavlake-song-wavlake:04cead49");
    expect(wavlakeCatalogueMock).toHaveBeenCalledWith("Ainsley Costello");
    expect(card).toHaveTextContent("Two Ships");
    expect(card).toHaveTextContent("Ainsley Costello");
    expect(card).toHaveTextContent("Wavlake");
    expect(within(card).getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
    expect(card.className).not.toMatch(/border|rounded-2xl|px-2/);
    expect(screen.queryByTestId("container-no-results")).toBeNull();
    // The count counts what is shown, whichever source it came from.
    expect(screen.getByTestId("text-search-stats")).toHaveTextContent("About 1 result");
  });

  // Benjamin's Shop: NIP-99 listings as photo-led cards, priced as published,
  // ranked by trust in the seller; sold and priceless never render; the
  // listings' own categories are the facets.
  it("the Shop tab shows sellable listings as priced cards and lets a category chip narrow them", async () => {
    setUrlTab("shop");
    render(<SearchResults query="maglia" pov="nosfabrica" />);
    expect([...allStreams].reverse()[0].params.tab).toBe("shop");

    const seller = "9".repeat(64);
    const listing = (id: string, title: string, tags: string[][]) =>
      ({ event: ev(id, 30402, seller, `${title} — come nuova`, [["d", id], ["title", title], ...tags]), author: author(seller, "Barattolo"), rank: null });
    emit({
      hits: [
        listing("l1", "Maglia in kashmir donna", [["price", "23550", "sats"], ["image", "https://img/1.jpg"], ["location", "Gubbio (PG)"], ["t", "abbigliamento"], ["t", "kashmir"], ["r", "https://barattolo.app/l/l1"]]),
        listing("l2", "Maglia mezza stagione", [["price", "14100", "sats"], ["image", "https://img/2.jpg"], ["t", "abbigliamento"]]),
        listing("sold", "Maglia venduta", [["price", "9000", "sats"], ["status", "sold"], ["t", "abbigliamento"]]),
        listing("nop", "Regalo senza prezzo", [["image", "https://img/3.jpg"]]),
      ],
      eose: true,
      timeMs: 130,
    });

    const card = await screen.findByTestId("listing-card-l1");
    expect(card).toHaveTextContent("Maglia in kashmir donna");
    expect(card).toHaveTextContent("23,550 sats");
    expect(card).toHaveTextContent("Gubbio (PG)");
    expect(card).toHaveTextContent("Barattolo");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://img/1.jpg");
    // The seller's own page is the way out, in the corner.
    const open = within(card).getByTestId("listing-open-l1");
    expect(open.getAttribute("href")).toBe("https://barattolo.app/l/l1");
    // Over a photo the corner is the shop's favicon alone in a small pill;
    // the words wait on hover. Text over busy photography was unreadable.
    expect(open.textContent?.trim()).toBe("");
    expect(open.getAttribute("title")).toBe("Visit shop");
    expect(open.getAttribute("aria-label")).toBe("Visit shop");
    expect(within(open).getByTestId("favicon")).toBeInTheDocument();
    expect(screen.getByTestId("listing-card-l2")).toBeInTheDocument();
    expect(screen.queryByTestId("listing-card-sold")).toBeNull();
    expect(screen.queryByTestId("listing-card-nop")).toBeNull();
    expect(screen.getByTestId("text-search-stats")).toHaveTextContent("About 2 results");

    // Categories from the listings' own tags, counted; one tap narrows.
    const facets = screen.getByTestId("shop-facets");
    expect(within(facets).getByTestId("shop-facet-abbigliamento")).toHaveTextContent("2");
    fireEvent.click(within(facets).getByTestId("shop-facet-kashmir"));
    expect(screen.getByTestId("listing-card-l1")).toBeInTheDocument();
    expect(screen.queryByTestId("listing-card-l2")).toBeNull();
  });

  it("collapses recurring events on the Events tab behind a +N chip", async () => {
    setUrlTab("events");
    render(<SearchResults query="liverpool" pov="nosfabrica" />);
    const orange = "b".repeat(64);
    const nowSec = Math.floor(Date.now() / 1000);
    const mk = (id: string, title: string, days: number) =>
      ({ event: ev(id, 31923, orange, "", [["d", id], ["title", title], ["start", String(nowSec + days * 86_400)]]), author: author(orange, "club"), rank: null });
    emit({
      hits: [mk("m1", "Bitcoin Liverpool Meet", 7), mk("m2", "Bitcoin Liverpool Meetup", 37), mk("m3", "Bitcoin Liverpool Meetup", 67)],
      eose: true,
      timeMs: 200,
    });
    await screen.findByTestId("cluster-expand-m1");
    expect(screen.getAllByTestId(/^event-card-/)).toHaveLength(1);
    expect(screen.getByTestId("cluster-expand-m1")).toHaveTextContent("+2 more like this");
  });

  it("renders a git repo with name and description", async () => {
    setUrlTab("code");
    render(<SearchResults query="relay" pov="nosfabrica" />);
    const repo = ev("r1", 30617, "f".repeat(64), "", [
      ["d", "vespa-relay"],
      ["name", "vespa-relay"],
      ["description", "Search relay over Vespa"],
    ]);
    emit({ hits: [{ event: repo, author: author(repo.pubkey, "frank"), rank: null }], eose: true, timeMs: 200 });
    expect(await screen.findByText("vespa-relay")).toBeInTheDocument();
    expect(screen.getByText("Search relay over Vespa")).toBeInTheDocument();
    const card = screen.getByTestId("repo-card-r1");
    // A repo announcement is labeled and closes on the enterprise footer.
    expect(card).toHaveTextContent("Repo");
    expect(card).toHaveTextContent("Maintained by");
  });

  it("the card's top-right corner holds exactly one affordance", async () => {
    setUrlTab("repos");
    render(<SearchResults query="ngit" pov="nosfabrica" />);
    // A repo announcement has an external "Open repo" link — the glyph steps
    // aside so the two never overlap. A patch has no external link — the
    // glyph keeps the corner.
    const repo = ev("ov1", 30617, "f".repeat(64), "", [["d", "ngit"], ["name", "ngit"], ["web", "https://gitworkshop.dev/ngit"]]);
    const patch = ev("ov2", 1617, "a".repeat(64), "", [["subject", "fix: thing"], ["a", "30617:" + "f".repeat(64) + ":ngit"]]);
    emit({
      hits: [repo, patch].map((event) => ({ event, author: author(event.pubkey, "dan"), rank: null })),
      eose: true,
      timeMs: 200,
    });
    // Every card now connects to its git host — a patch through its parent
    // repo's a-tag — so the branded link owns the corner on both and the
    // decorative glyph never doubles up with it.
    const repoCard = await screen.findByTestId("repo-card-ov1");
    expect(within(repoCard).getByTestId("repo-open-ov1")).toBeInTheDocument();
    expect(within(repoCard).queryByTestId("repo-glyph-ov1")).toBeNull();
    const patchCard = screen.getByTestId("repo-card-ov2");
    const patchLink = within(patchCard).getByTestId("repo-open-ov2");
    expect(patchLink.getAttribute("href")).toMatch(/^https:\/\/gitworkshop\.dev\/naddr1/);
    expect(within(patchCard).queryByTestId("repo-glyph-ov2")).toBeNull();
  });

  it("the git link wears the destination's brand — GitHub for a GitHub repo", async () => {
    setUrlTab("repos");
    render(<SearchResults query="amethyst" pov="nosfabrica" />);
    const gh = ev("br1", 30617, "f".repeat(64), "", [
      ["d", "amethyst"], ["name", "amethyst"],
      ["web", "https://github.com/vitorpamplona/amethyst"],
    ]);
    // Only a clone URL, but on a browsable forge — link there, not gitworkshop.
    const cb = ev("br2", 30617, "e".repeat(64), "", [
      ["d", "forgejo-thing"], ["name", "forgejo-thing"],
      ["clone", "https://codeberg.org/someone/forgejo-thing.git"],
    ]);
    // A relay-only clone isn't a web page — gitworkshop renders the repo.
    const ngit = ev("br3", 30617, "d".repeat(64), "", [
      ["d", "ngit"], ["name", "ngit"],
      ["clone", "https://relay.ngit.dev/npub1abc/ngit"],
    ]);
    emit({
      hits: [gh, cb, ngit].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })),
      eose: true,
      timeMs: 200,
    });
    const ghLink = await screen.findByTestId("repo-open-br1");
    expect(ghLink).toHaveTextContent("GitHub");
    expect(ghLink.getAttribute("href")).toBe("https://github.com/vitorpamplona/amethyst");
    const cbLink = screen.getByTestId("repo-open-br2");
    expect(cbLink).toHaveTextContent("Codeberg");
    expect(cbLink.getAttribute("href")).toBe("https://codeberg.org/someone/forgejo-thing");
    const ngitLink = screen.getByTestId("repo-open-br3");
    expect(ngitLink).toHaveTextContent("gitworkshop");
    expect(ngitLink.getAttribute("href")).toMatch(/^https:\/\/gitworkshop\.dev\/naddr1/);
  });

  it("an npub-subdomain host collapses to the site people would recognize", async () => {
    setUrlTab("repos");
    render(<SearchResults query="site" pov="nosfabrica" />);
    const npub = "npub1wav4fae3gyfy3xj298kxj2mj8phavz7vavps34przq02j7w902qq902923";
    const site = ev("ns1", 30617, "f".repeat(64), "", [
      ["d", "my-site"], ["name", "my-site"],
      ["web", `https://${npub}.nsite.lol/`],
    ]);
    emit({ hits: [{ event: site, author: author(site.pubkey, "x"), rank: null }], eose: true, timeMs: 200 });
    const link = await screen.findByTestId("repo-open-ns1");
    expect(link).toHaveTextContent("nsite.lol");
    expect(link.textContent).not.toContain("npub1");
  });

  // What became of it: the newest status event per issue or patch, as a chip,
  // and a State strip to narrow the tab to open issues or merged patches.
  it("issues and patches wear their state, and the State strip narrows to one", async () => {
    setUrlTab("repos");
    const issue = ev("i1", 1621, "1".repeat(64), "crashes on start", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "crashes on start"]]);
    const merged = ev("p1", 1617, "2".repeat(64), "fix: startup crash", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "fix: startup crash"]]);
    const fresh = ev("p2", 1617, "3".repeat(64), "feat: dark mode", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "feat: dark mode"]]);
    const repo = ev("r1", 30617, "9".repeat(64), "", [["d", "armada"], ["name", "armada"]]);
    gitStatusesMock.mockResolvedValue(new Map([[issue.id, { kind: 1632, at: 200 }], [merged.id, { kind: 1631, at: 150 }]]));
    render(<SearchResults query="armada" pov="nosfabrica" />);
    emit({ hits: [repo, issue, merged, fresh].map((e) => ({ event: e, author: author(e.pubkey, "dev"), rank: null })), eose: true, timeMs: 200 });

    expect(await screen.findByTestId("git-state-i1")).toHaveTextContent("Closed");
    expect(screen.getByTestId("git-state-p1")).toHaveTextContent("Merged");
    expect(screen.getByTestId("git-state-p2")).toHaveTextContent("Open"); // no status event yet
    expect(screen.queryByTestId("git-state-r1")).toBeNull(); // a repo has no state
    expect(gitStatusesMock).toHaveBeenCalledWith(expect.arrayContaining([issue.id, merged.id, fresh.id]));

    const strip = screen.getByTestId("repo-state-facets");
    expect(within(strip).getByTestId("repo-state-merged")).toHaveTextContent("Merged 1");
    expect(within(strip).getByTestId("repo-state-closed")).toHaveTextContent("Closed 1");
    fireEvent.click(within(strip).getByTestId("repo-state-merged"));
    expect(screen.getByTestId("repo-card-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("repo-card-i1")).toBeNull();
    expect(screen.queryByTestId("repo-card-r1")).toBeNull();
    fireEvent.click(within(strip).getByTestId("repo-state-all"));
    expect(screen.getByTestId("repo-card-r1")).toBeInTheDocument();
  });

  it("issues wear their labels, and the strip narrows by label after state", async () => {
    setUrlTab("repos");
    const bug = ev("i1", 1621, "1".repeat(64), "crashes on start", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "crashes on start"], ["t", "bug"], ["t", "android"]]);
    const wish = ev("i2", 1621, "2".repeat(64), "dark mode please", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "dark mode please"], ["t", "enhancement"]]);
    const plain = ev("i3", 1621, "3".repeat(64), "question", [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "question"]]);
    render(<SearchResults query="armada" pov="nosfabrica" />);
    emit({ hits: [bug, wish, plain].map((e) => ({ event: e, author: author(e.pubkey, "dev"), rank: null })), eose: true, timeMs: 200 });

    const card = await screen.findByTestId("repo-card-i1");
    const labels = within(card).getByTestId("git-labels-i1");
    expect(labels).toHaveTextContent("bug");
    expect(labels).toHaveTextContent("android");
    expect(within(screen.getByTestId("repo-card-i3")).queryByTestId("git-labels-i3")).toBeNull();

    const strip = screen.getByTestId("repo-state-facets");
    expect(within(strip).getByTestId("repo-label-bug")).toHaveTextContent("bug 1");
    expect(within(strip).getByTestId("repo-label-enhancement")).toHaveTextContent("enhancement 1");
    fireEvent.click(within(strip).getByTestId("repo-label-enhancement"));
    expect(screen.getByTestId("repo-card-i2")).toBeInTheDocument();
    expect(screen.queryByTestId("repo-card-i1")).toBeNull();
    expect(screen.queryByTestId("repo-card-i3")).toBeNull();
  });

  it("issues show how much conversation they have, and people's issues come before agents' — marked", async () => {
    setUrlTab("repos");
    const byAgent = ev("i1", 1621, "1".repeat(64), "add ngit pr edit API", [["a", "30617:" + "9".repeat(64) + ":ngit"], ["subject", "add ngit pr edit API"], ["buzz-origin-agent", "PM"]]);
    const byPerson = ev("i2", 1621, "2".repeat(64), "crash on start", [["a", "30617:" + "9".repeat(64) + ":ngit"], ["subject", "crash on start"]]);
    const byBot = ev("i3", 1621, "3".repeat(64), "add tests", [["a", "30617:" + "9".repeat(64) + ":ngit"], ["subject", "add tests"]]);
    gitCommentsMock.mockResolvedValue(new Map([[byPerson.id, 3]]));
    render(<SearchResults query="ngit" pov="nosfabrica" />);
    emit({
      hits: [
        { event: byBot, author: { ...author(byBot.pubkey, "Yuki (Personal Agent)"), bot: true }, rank: null },
        { event: byAgent, author: author(byAgent.pubkey, "dev"), rank: null },
        { event: byPerson, author: author(byPerson.pubkey, "dev"), rank: null },
      ],
      eose: true,
      timeMs: 200,
    });

    const person = await screen.findByTestId("repo-card-i2");
    expect(within(person).getByTestId("git-comments-i2")).toHaveTextContent("3 comments");
    expect(within(screen.getByTestId("repo-card-i1")).queryByTestId("git-comments-i1")).toBeNull();
    const order = [...document.querySelectorAll('[data-testid^="repo-card-"]')].map((c) => c.getAttribute("data-testid"));
    expect(order).toEqual(["repo-card-i2", "repo-card-i3", "repo-card-i1"]);
    expect(within(screen.getByTestId("repo-card-i3")).getByTestId("git-agent-i3").getAttribute("title")).toMatch(/Yuki/);
    const mark = within(screen.getByTestId("repo-card-i1")).getByTestId("git-agent-i1");
    expect(mark).toHaveTextContent("agent");
    expect(mark.getAttribute("title")).toMatch(/PM/);
    expect(within(person).queryByTestId("git-agent-i2")).toBeNull();
  });

  // NIP-34's newer kind 1618 is a pull request — most agent-filed work rides
  // it. It is a git item like a patch: typed, stated, counted.
  it("a pull request (kind 1618) is typed PR and carries its state", async () => {
    setUrlTab("repos");
    const pr = ev("pr1", 1618, "1".repeat(64), "Prove warm coverage", [["a", "30617:" + "9".repeat(64) + ":gitworkshop"], ["subject", "Prove warm coverage"]]);
    gitStatusesMock.mockResolvedValue(new Map([[pr.id, { kind: 1631, at: 9 }]]));
    render(<SearchResults query="gitworkshop" pov="nosfabrica" />);
    emit({ hits: [{ event: pr, author: author(pr.pubkey, "dev"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("repo-card-pr1");
    expect(card).toHaveTextContent("PR");
    expect(within(card).getByTestId("git-state-pr1")).toHaveTextContent("Merged");
    expect(gitStatusesMock).toHaveBeenCalledWith([pr.id]);
  });

  // NIP-34 marks a codebase by its earliest unique commit; two announcements
  // that share it are the same project — an original and a fork. The most
  // trusted maintainer's card leads; the forks fold behind "N forks".
  it("repos sharing an earliest commit fold under the most-trusted maintainer's card, forks one tap away and named", async () => {
    setUrlTab("repos");
    const euc = "e".repeat(40);
    const orig = ev("r1", 30617, "1".repeat(64), "", [["d", "pyramid"], ["name", "pyramid"], ["r", euc, "euc"]]);
    const fork = ev("r2", 30617, "2".repeat(64), "", [["d", "pyramid"], ["name", "gittr-pyramid"], ["r", euc, "euc"]]);
    const other = ev("r3", 30617, "3".repeat(64), "", [["d", "ngit"], ["name", "ngit"], ["r", "f".repeat(40), "euc"]]);
    scoreOfMock.mockImplementation((pk) => (pk.startsWith("1") ? 0.9 : 0.3));
    try {
      render(<SearchResults query="pyramid" pov="nosfabrica" />);
      // The fork arrives first from the relay; trust, not arrival, picks the lead.
      emit({ hits: [fork, orig, other].map((e) => ({ event: e, author: author(e.pubkey, "dev"), rank: null })), eose: true, timeMs: 200 });
      await screen.findByTestId("repo-card-r1");
      expect(screen.queryByTestId("repo-card-r2")).toBeNull();
      expect(screen.getByTestId("repo-card-r3")).toBeInTheDocument();
      const chip = screen.getByTestId("cluster-expand-r1");
      expect(chip).toHaveTextContent("1 fork");
      fireEvent.click(chip);
      const forkCard = await screen.findByTestId("repo-card-r2");
      expect(within(forkCard).getByTestId("repo-fork-of-r2")).toHaveTextContent("fork of pyramid");
      expect(screen.queryByTestId("cluster-expand-r1")).toBeNull();
    } finally {
      scoreOfMock.mockImplementation(() => 0.85);
    }
  });

  it("a patch without a subject tag is titled from its own text, never 'Untitled' or its d-tag", async () => {
    setUrlTab("repos");
    const body = ["commit 000c2b0b9fdbc529e89ffbedb24ecaee04bcc0db", "Author: randymcmillan <r@x>", "Date:   Fri Sep 4 11:35:43 2026 -0400", "", "    chore: bump swiss for Go 1.27 support", "", "diff --git a/go.mod b/go.mod", "+x"].join("\n");
    const patch = ev("pt1", 1617, "1".repeat(64), body, [["d", "."], ["a", "30617:" + "9".repeat(64) + ":kubo"], ["commit", "000c2b0b9fdbc529e89ffbedb24ecaee04bcc0db"]]);
    render(<SearchResults query="kubo" pov="nosfabrica" />);
    emit({ hits: [{ event: patch, author: author(patch.pubkey, "randy"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("repo-card-pt1");
    expect(card).toHaveTextContent("chore: bump swiss for Go 1.27 support");
    expect(card).not.toHaveTextContent("Untitled");
    // The summary is the commit message, not the title again and not git's headers.
    expect((card.textContent?.match(/chore: bump swiss/g) ?? []).length).toBe(1);
    expect(card).not.toHaveTextContent("Author: randymcmillan");
  });

  it("a repo announcement shows its issue and patch counts, who contributed, and when it was last touched", async () => {
    setUrlTab("repos");
    const now = Math.floor(Date.now() / 1000);
    repoCountsMock.mockResolvedValue({ issues: 12, patches: 3, contributors: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)], lastAt: now - 3 * 3600 });
    render(<SearchResults query="relay" pov="nosfabrica" />);
    const repo = ev("rc1", 30617, "f".repeat(64), "", [["d", "ngit"], ["name", "ngit"]]);
    emit({ hits: [{ event: repo, author: author(repo.pubkey, "dan"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("repo-card-rc1");
    expect(repoCountsMock).toHaveBeenCalledWith("30617:" + "f".repeat(64) + ":ngit");
    expect(await within(card).findByText(/12 issues/)).toBeInTheDocument();
    expect(within(card).getByText(/3 patches/)).toBeInTheDocument();
    // Who stands behind it: a count and up to three ringed faces.
    const who = within(card).getByTestId("repo-contributors-rc1");
    expect(who).toHaveTextContent("4 contributors");
    expect(who.querySelectorAll('[data-testid^="repo-contributor-face-"]')).toHaveLength(3);
    // And whether it is alive.
    expect(within(card).getByTestId("repo-active-rc1")).toHaveTextContent(/active 3h ago/);
  });

  it("labels patches and issues and shows the repo they belong to", async () => {
    setUrlTab("repos");
    render(<SearchResults query="amethyst" pov="nosfabrica" />);
    const patch = ev("pt1", 1617, "a".repeat(64), "narrows the FileProvider root", [
      ["subject", "fix: narrow FileProvider external root"],
      ["a", "30617:" + "f".repeat(64) + ":amethyst"],
    ]);
    const issue = ev("is1", 1621, "b".repeat(64), "crash on launch", [
      ["subject", "Critical: DMs fail in private groups"],
      ["a", "30617:" + "f".repeat(64) + ":amethyst"],
    ]);
    emit({
      hits: [patch, issue].map((event) => ({ event, author: author(event.pubkey, "dev"), rank: null })),
      eose: true,
      timeMs: 200,
    });
    const patchCard = await screen.findByTestId("repo-card-pt1");
    expect(patchCard).toHaveTextContent("Patch");
    expect(patchCard).toHaveTextContent("amethyst"); // the repo it targets
    expect(patchCard).toHaveTextContent("By"); // contributor kicker, not "Maintained by"
    expect(screen.getByTestId("repo-card-is1")).toHaveTextContent("Issue");
  });

  it("renders a list with its title and item count", async () => {
    setUrlTab("lists");
    render(<SearchResults query="follows" pov="nosfabrica" />);
    const list = ev("li1", 30003, "9".repeat(64), "", [
      ["d", "reading"],
      ["title", "Reading List"],
      ["e", "1".repeat(64)],
      ["e", "2".repeat(64)],
      ["a", "30023:abc:x"],
    ]);
    emit({ hits: [{ event: list, author: author(list.pubkey, "gail"), rank: null }], eose: true, timeMs: 200 });
    expect(await screen.findByText("Reading List")).toBeInTheDocument();
    expect(screen.getByTestId("list-count-li1")).toHaveTextContent("3");
  });

  it("the Apps tab facets by platform with one tap", async () => {
    setUrlTab("apps");
    render(<SearchResults query="" pov="nosfabrica" />);
    const app = (id: string, name: string, fs: string[]) =>
      ev(id, 32267, id.repeat(32).slice(0, 64), "", [["d", id], ["name", name], ...fs.map((f) => ["f", f])]);
    emit({
      hits: [
        app("a1", "Amethyst", ["android-arm64-v8a"]),
        app("a2", "Damus", ["ios-arm64"]),
        app("a3", "Flotilla", ["web"]),
      ].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })),
      eose: true,
      timeMs: 90,
    });
    await screen.findByText("Amethyst");
    // Only platforms actually present, with counts.
    const androidChip = screen.getByTestId("app-facet-android");
    expect(androidChip).toHaveTextContent("Android");
    expect(screen.queryByTestId("app-facet-macos")).toBeNull();

    fireEvent.click(androidChip);
    expect(screen.getByText("Amethyst")).toBeInTheDocument();
    expect(screen.queryByText("Damus")).toBeNull();
    expect(screen.queryByText("Flotilla")).toBeNull();

    // All brings everything back.
    fireEvent.click(screen.getByTestId("app-facet-all"));
    expect(screen.getByText("Damus")).toBeInTheDocument();
  });

  it("category chips join the platform facets and stack with them", async () => {
    setUrlTab("apps");
    render(<SearchResults query="" pov="nosfabrica" />);
    const app = (id: string, name: string, fs: string[], ts: string[]) =>
      ev(id, 32267, id.repeat(32).slice(0, 64), "", [
        ["d", id], ["name", name],
        ...fs.map((f) => ["f", f]),
        ...ts.map((t) => ["t", t]),
      ]);
    emit({
      hits: [
        app("c1", "Amethyst", ["android-arm64"], ["nostr-client", "social", "android"]),
        app("c2", "Damus", ["ios-arm64"], ["nostr-client"]),
        app("c3", "Blockdoku", ["android-arm64"], ["games"]),
      ].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })),
      eose: true,
      timeMs: 90,
    });
    await screen.findByText("Amethyst");

    // Categories with counts, best first; a t-tag that just restates a
    // platform word never becomes a category chip.
    expect(screen.getByTestId("app-cat-facet-nostr-client")).toHaveTextContent("2");
    expect(screen.queryByTestId("app-cat-facet-android")).toBeNull();

    fireEvent.click(screen.getByTestId("app-cat-facet-nostr-client"));
    expect(screen.getByText("Amethyst")).toBeInTheDocument();
    expect(screen.getByText("Damus")).toBeInTheDocument();
    expect(screen.queryByText("Blockdoku")).toBeNull();

    // Facets stack: nostr-client AND Android leaves only Amethyst.
    fireEvent.click(screen.getByTestId("app-facet-android"));
    expect(screen.getByText("Amethyst")).toBeInTheDocument();
    expect(screen.queryByText("Damus")).toBeNull();
  });

  it("license chips complete the facet set and stack with the rest", async () => {
    setUrlTab("apps");
    render(<SearchResults query="" pov="nosfabrica" />);
    const app = (id: string, name: string, license?: string) =>
      ev(id, 32267, id.repeat(32).slice(0, 64), "", [
        ["d", id], ["name", name], ["f", "android-arm64"],
        ...(license ? [["license", license]] : []),
      ]);
    emit({
      hits: [
        app("l1", "Amethyst", "MIT"),
        app("l2", "Damus", "MIT"),
        app("l3", "Nucube", "CC-BY-NC-ND-4.0"),
        app("l4", "Mystery"),
      ].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })),
      eose: true,
      timeMs: 90,
    });
    await screen.findByText("Amethyst");
    expect(screen.getByTestId("app-lic-facet-mit")).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("app-lic-facet-mit"));
    expect(screen.getByText("Damus")).toBeInTheDocument();
    expect(screen.queryByText("Nucube")).toBeNull();
    expect(screen.queryByText("Mystery")).toBeNull();
  });

  it("lists earn their place: untitled and empty junk hides, people-packs lead", async () => {
    setUrlTab("lists");
    render(<SearchResults query="" pov="nosfabrica" />);
    const untitled = ev("junk1", 30003, "a".repeat(64), "", [["e", "x".repeat(64)]]);
    const empty = ev("junk2", 30003, "b".repeat(64), "", [["title", "My bookmarks"]]);
    const bookmarks = ev("bm1", 30003, "c".repeat(64), "", [["title", "Reading List"], ["e", "y".repeat(64)]]);
    const pack = ev("fs1", 30000, "d".repeat(64), "", [["title", "Verified Human"], ["p", "1".repeat(64)]]);
    emit({
      hits: [untitled, empty, bookmarks, pack].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })),
      eose: true,
      timeMs: 100,
    });
    // Junk gone…
    await screen.findByText("Verified Human");
    expect(screen.queryByTestId("list-card-junk1")).toBeNull();
    expect(screen.queryByTestId("list-card-junk2")).toBeNull();
    // …and the people-pack outranks the bookmark list despite arriving after.
    const cards = screen.getAllByTestId(/^list-card-/);
    expect(cards[0].getAttribute("data-testid")).toBe("list-card-fs1");
    expect(cards[1].getAttribute("data-testid")).toBe("list-card-bm1");
  });

  // The team: "This is bad, right? We have multiple lists of the same tag" —
  // ten "Nostr devs" packs at 39% overlap. One row per title: the most
  // trusted curator's list carries the fold, the chip says how many, the
  // count says how many people all of them add up to, and the faces are the
  // ones most lists agree on. The chip opens the individual lists.
  it("folds same-title follow packs into one row with the union, and the chip opens them", async () => {
    setUrlTab("lists");
    render(<SearchResults query="nostr devs" pov="nosfabrica" />);
    const A = "1".repeat(64), B = "2".repeat(64), C = "3".repeat(64), D = "4".repeat(64), E = "5".repeat(64);
    profileMapMock.set(A, { name: "alice" });
    const pack = (id: string, pk: string, title: string, members: string[]) => ev(id, 30000, pk, "", [["d", id], ["title", title], ...members.map((m) => ["p", m])]);
    const hits = [
      { event: pack("g1", "a".repeat(64), "Nostr devs", [A, B, C]), author: { ...author("a".repeat(64), "curator one"), wotRank: 0.5 }, rank: null },
      { event: pack("g2", "b".repeat(64), "#nostr-devs", [A, B, D]), author: { ...author("b".repeat(64), "curator two"), wotRank: 0.9 }, rank: null },
      { event: pack("g3", "c".repeat(64), "Nostr Dev", [A, E]), author: { ...author("c".repeat(64), "curator three"), wotRank: 0.7 }, rank: null },
      { event: pack("o1", "d".repeat(64), "Bitcoin news", [A, B]), author: { ...author("d".repeat(64), "someone"), wotRank: 0.8 }, rank: null },
    ];
    emit({ hits, eose: true, timeMs: 120 });
    const primary = await screen.findByTestId("list-card-g2");
    expect(screen.queryByTestId("list-card-g1")).toBeNull();
    expect(screen.queryByTestId("list-card-g3")).toBeNull();
    expect(within(primary).getByTestId("list-count-g2")).toHaveTextContent("3 lists · 5 people");
    // The faces most lists agree on lead: alice is in all three.
    const faces = within(primary).getByTestId("list-members-g2");
    expect(faces.textContent).toMatch(/^alice/);
    expect(screen.getByTestId("list-card-o1")).toBeInTheDocument();
    const chip = screen.getByTestId("cluster-expand-g2");
    expect(chip).toHaveTextContent("3 lists");
    fireEvent.click(chip);
    expect(screen.getByTestId("list-card-g3")).toBeInTheDocument();
    expect(screen.getByTestId("list-card-g1")).toBeInTheDocument();
    expect(within(screen.getByTestId("list-card-g1")).getByTestId("list-count-g1")).toHaveTextContent("3 members");
  });

  it("fresh cards say how real-time they are, not just a date", async () => {
    setUrlTab("lists");
    render(<SearchResults query="" pov="nosfabrica" />);
    const fresh = {
      ...ev("fr1", 30000, "a".repeat(64), "", [["title", "Fresh Pack"], ["p", "1".repeat(64)]]),
      created_at: Math.floor(Date.now() / 1000) - 120,
    } as NostrEvent;
    const old = {
      ...ev("old1", 30003, "b".repeat(64), "", [["title", "Old Bookmarks"], ["e", "x".repeat(64)]]),
      created_at: Math.floor(Date.now() / 1000) - 86400 * 90,
    } as NostrEvent;
    emit({ hits: [fresh, old].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })), eose: true, timeMs: 90 });
    await screen.findByText("Fresh Pack");
    expect(screen.getByTestId("list-card-fr1")).toHaveTextContent("2m ago");
    // Beyond a month, a date reads better than "90d ago".
    expect(screen.getByTestId("list-card-old1")).toHaveTextContent(/[A-Z][a-z]{2} \d/);
  });

  it("a Brainstorm follow set shows its members as named faces", async () => {
    setUrlTab("lists");
    profileMapMock.set("1".repeat(64), { name: "david" });
    render(<SearchResults query="verified human" pov="nosfabrica" />);
    const followSet = ev("fs1", 30000, "f".repeat(64), "", [
      ["d", "tl-pin-verified-human"],
      ["title", "Verified Human"],
      ["description", "A Pinned-tag list from Brainstorm."],
      ["p", "1".repeat(64)],
      ["p", "2".repeat(64)],
      ["p", "3".repeat(64)],
    ]);
    emit({ hits: [{ event: followSet, author: author(followSet.pubkey, "exporter"), rank: null }], eose: true, timeMs: 150 });

    expect(await screen.findByText("Verified Human")).toBeInTheDocument();
    // Members, not generic "items".
    expect(screen.getByTestId("list-count-fs1")).toHaveTextContent("3 members");
    // Search wears no trust rings, face piles included.
    const pile = screen.getByTestId("list-members-fs1");
    const ringed = [...pile.querySelectorAll("span")].filter((el) => el.className.includes("shadow-[0_0_0"));
    expect(ringed.length).toBe(0);
    // Faces carry NAMES, staging-style — an anonymous circle sells nothing.
    expect(await screen.findByText("david")).toBeInTheDocument();
  });

  it("renders media with a thumbnail from imeta", async () => {
    setUrlTab("media");
    render(<SearchResults query="sunset" pov="nosfabrica" />);
    const pic = ev("m1", 20, "8".repeat(64), "sunset over the lake", [
      ["imeta", "url https://img.example/sunset.jpg", "m image/jpeg"],
    ]);
    emit({ hits: [{ event: pic, author: author(pic.pubkey, "hank"), rank: null }], eose: true, timeMs: 200 });
    const img = (await screen.findByTestId("media-thumb-m1")) as HTMLImageElement;
    expect(img.src).toContain("img.example/sunset.jpg");
    expect(screen.getByText(/sunset over the lake/)).toBeInTheDocument();
  });

  // A partner's own mark, by their rules: Divine's logotype in place of the
  // bare host, Dark Green on light and Green on dark, the name always "Divine".
  // Benjamin, over "via cdn.midjourney.com": a CDN hostname tells a reader
  // nothing, so the byline exists only for a brand people recognise.
  it("a Divine video's byline carries the Divine wordmark; an unbranded host gets no byline at all", async () => {
    setUrlTab("media");
    render(<SearchResults query="dance" pov="nosfabrica" />);
    const divine = ev("dv1", 34236, "8".repeat(64), "late night dance", [["d", "dv1"], ["title", "late night dance"], ["imeta", "url https://media.divine.video/clips/abc.mp4", "m video/mp4", "image https://media.divine.video/clips/abc.jpg"]]);
    const other = ev("bl1", 21, "9".repeat(64), "another clip", [["d", "bl1"], ["title", "another clip"], ["imeta", "url https://blossom.primal.net/xyz.mp4", "m video/mp4"]]);
    emit({ hits: [{ event: divine, author: author(divine.pubkey, "dancer"), rank: null }, { event: other, author: author(other.pubkey, "someone"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-dv1");
    const mark = within(card).getByRole("img", { name: "Divine" });
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(card).not.toHaveTextContent("media.divine.video");
    expect(card).toHaveTextContent(/via/);
    const plain = screen.getByTestId("media-card-bl1");
    expect(plain).not.toHaveTextContent(/via/);
    expect(plain).not.toHaveTextContent("blossom.primal.net");
  });

  // Divine publishes each clip's soundtrack as its own kind-1063 file
  // ("m audio/wav", allow_audio_reuse, an `a` back to the 34236 video) so
  // other creators can reuse the sound. Benjamin, over one of them: "why does
  // this show divine, video media - but its audio?" It is audio — and it
  // duplicates a video that is already in the results, so it stays out.
  it("a Divine sound-reuse file stays out of the Media tab; its video stays in", async () => {
    setUrlTab("media");
    render(<SearchResults query="oh no" pov="nosfabrica" />);
    const pk = "8".repeat(64);
    const video = ev("dvid", 34236, pk, "Oh No!!", [["d", "e4d2"], ["title", "Oh No!!"], ["imeta", "url https://media.divine.video/clips/e4d2.mp4", "m video/mp4"]]);
    const sound = ev("dsnd", 1063, pk, "Oh No!!", [
      ["url", "https://media.divine.video/1bb23d.wav"],
      ["m", "audio/wav"],
      ["duration", "6.324"],
      ["title", "Oh No!!"],
      ["allow_audio_reuse", "true"],
      ["a", `34236:${pk}:e4d2`, "wss://relay.divine.video"],
    ]);
    const song = ev("indie", 1063, "9".repeat(64), "a whole song", [["url", "https://cdn.example/song.mp3"], ["m", "audio/mpeg"]]);
    emit({ hits: [video, sound, song].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })), eose: true, timeMs: 90 });
    await screen.findByTestId("media-card-dvid");
    await screen.findByTestId("media-card-indie");
    expect(screen.queryByTestId("media-card-dsnd")).toBeNull();
  });

  // Benjamin, over "Rabbit Hole Recap": their videos never reached the Media
  // tab. Probed: the account has 254 notes and zero events of any media kind;
  // 22 of its last 40 notes carry a video. On Nostr, most media is a note with
  // a file attached — so the Media tab asks for notes too and keeps the ones
  // that carry something to look at.
  it("the Media tab also shows notes that carry a video or picture, and not the text-only ones", async () => {
    setUrlTab("media");
    render(<SearchResults query="Rabbit Hole Recap" pov="nosfabrica" />);
    const notesStream = [...allStreams].reverse().find((c) => c.params.tab === "notes");
    expect(notesStream).toBeTruthy();

    // The media-kinds stream answers with nothing…
    emit({ hits: [], eose: true, timeMs: 120 });
    // …the notes stream with one episode video and one plain reply.
    const rhr = "7".repeat(64);
    const episode = ev("ep395", 1, rhr, "RHR 395: STAY HUMBLE AND STACK SATS https://blossom.primal.net/abc.mp4", [
      ["imeta", "url https://blossom.primal.net/abc.mp4", "m video/mp4", "image https://blossom.primal.net/abc.jpg"],
    ]);
    const plain = ev("reply1", 1, "8".repeat(64), "great episode as always");
    notesStream!.cb({
      hits: [{ event: episode, author: author(rhr, "RABBIT HOLE RECAP"), rank: null }, { event: plain, author: author(plain.pubkey, "fan"), rank: null }],
      eose: true,
      timeMs: 140,
    });

    const card = await screen.findByTestId("media-card-ep395");
    expect(card.querySelector("video")).not.toBeNull();
    expect(screen.queryByTestId("media-card-reply1")).toBeNull();
    expect(screen.queryByText(/great episode as always/)).toBeNull();
    expect(screen.queryByTestId("container-no-results")).toBeNull();
  });

  // Their own videos don't say "Rabbit Hole Recap" in the text — they're
  // episode posts. When the query IS a person, the Media tab leads with the
  // media that person published, the way a channel's videos lead on Google.
  it("when the query is a person, the Media tab leads with that person's own media", async () => {
    const RHR = "b".repeat(64);
    suggestMock.mockResolvedValueOnce([
      { pubkey: RHR, npub: "npub1rhr", name: "RABBIT HOLE RECAP", about: "a weekly news show", nip05: "rhr@primal.net", wotRank: 0.9, wotFollowers: 7400 },
    ]);
    recentByKindsMock.mockResolvedValue([
      ev("ep396", 1, RHR, "RHR 396 https://blossom.primal.net/396.mp4", [["imeta", "url https://blossom.primal.net/396.mp4", "m video/mp4"]]),
      ev("plain", 1, RHR, "new episode drops Friday"),
    ]);
    setUrlTab("media");
    render(<SearchResults query="Rabbit Hole Recap" pov="nosfabrica" />);
    // Neither the media kinds nor the notes mention the show by name.
    emit({ hits: [], eose: true, timeMs: 100 });
    [...allStreams].reverse().find((c) => c.params.tab === "notes")!.cb({ hits: [], eose: true, timeMs: 110, error: null });

    const group = await screen.findByTestId("media-from-person");
    expect(group).toHaveTextContent(/From RABBIT HOLE RECAP/);
    expect(recentByKindsMock).toHaveBeenCalledWith(RHR, expect.arrayContaining([1]), expect.any(Number));
    expect(within(group).getByTestId("media-card-ep396").querySelector("video")).not.toBeNull();
    expect(screen.queryByTestId("media-card-plain")).toBeNull();
    expect(screen.queryByTestId("container-no-results")).toBeNull();
  });

  it("a video result IS a playable video, its raw URL hidden behind a host label", async () => {
    setUrlTab("media");
    render(<SearchResults query="clip" pov="nosfabrica" />);
    const vid = ev("sv1", 22, "8".repeat(64), "street clip https://media.divine.video/abc123.mp4", [
      ["imeta", "url https://media.divine.video/abc123.mp4", "m video/mp4"],
    ]);
    emit({ hits: [{ event: vid, author: author(vid.pubkey, "hank"), rank: null }], eose: true, timeMs: 200 });

    const card = await screen.findByTestId("media-card-sv1");
    // The feed's click-to-play video player, not a 64px thumb.
    expect(card.querySelector("video")).not.toBeNull();
    // The caption drops the URL; a quiet source label says where it lives —
    // for a Divine host, Divine's own wordmark rather than the domain.
    expect(card.textContent).not.toContain("https://media.divine.video/abc123.mp4");
    expect(within(card).getByRole("img", { name: "Divine" })).toBeInTheDocument();
    expect(card).toHaveTextContent("street clip");
  });

  it("a caption's nostr mention renders as the person, not a raw URI", async () => {
    setUrlTab("media");
    const friend = "7".repeat(64);
    profileMapMock.set(friend, { name: "bartholin" });
    const { nip19 } = await import("nostr-tools");
    const npub = nip19.npubEncode(friend);
    render(<SearchResults query="gator" pov="nosfabrica" />);
    const vid = ev("nm1", 22, "8".repeat(64), `nostr:${npub} look at this`, [
      ["imeta", "url https://media.example/gator.mp4", "m video/mp4"],
    ]);
    emit({ hits: [{ event: vid, author: author(vid.pubkey, "hank"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-nm1");
    const chip = card.querySelector('[data-testid="mention-chip"]');
    expect(chip).not.toBeNull();
    await vi.waitFor(() => expect(chip!).toHaveTextContent("@bartholin"));
    expect(card.textContent).not.toContain("nostr:npub");
  });

  it("the Media tab shows media — APKs and other file blobs stay out", async () => {
    setUrlTab("media");
    render(<SearchResults query="" pov="nosfabrica" />);
    const apk = ev("apk1", 1063, "5".repeat(64), "cooking.zap.app@3.2.2", [
      ["url", "https://cdn.zapstore.dev/abc.apk"],
      ["m", "application/vnd.android.package-archive"],
    ]);
    const photo = ev("ph1", 1063, "6".repeat(64), "sunset", [
      ["url", "https://cdn.example/sunset.jpg"],
      ["m", "image/jpeg"],
    ]);
    emit({ hits: [apk, photo].map((event) => ({ event, author: author(event.pubkey, "x"), rank: null })), eose: true, timeMs: 90 });
    await screen.findByTestId("media-card-ph1");
    expect(screen.queryByTestId("media-card-apk1")).toBeNull();
  });

  it("an audio result gets the real track player", async () => {
    setUrlTab("media");
    render(<SearchResults query="remix" pov="nosfabrica" />);
    const track = ev("au1", 1222, "9".repeat(64), "Dilemma (Breezy Dance Remix) https://media.divine.video/song.mp4", [
      ["imeta", "url https://media.divine.video/song.mp4", "m audio/mp4"],
    ]);
    emit({ hits: [{ event: track, author: author(track.pubkey, "breezy"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-au1");
    expect(card.querySelector('[data-testid="embedded-track"]')).not.toBeNull();
    // The track's source pill follows the byline rule: the brand's name, never the raw host.
    expect(card).toHaveTextContent("Divine");
    expect(card).not.toHaveTextContent(/media\.divine\.video/i);
  });

  it("an audio result from an unbranded host carries no source pill", async () => {
    setUrlTab("media");
    render(<SearchResults query="demo" pov="nosfabrica" />);
    const track = ev("au2", 1222, "9".repeat(64), "demo take", [["imeta", "url https://blossom.band/take.mp3", "m audio/mpeg"]]);
    emit({ hits: [{ event: track, author: author(track.pubkey, "someone"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-au2");
    expect(card.querySelector('[data-testid="embedded-track"]')).not.toBeNull();
    expect(card).not.toHaveTextContent("blossom.band");
  });

  it("a video with a poster image in imeta shows the poster, not an icon", async () => {
    setUrlTab("media");
    render(<SearchResults query="talk" pov="nosfabrica" />);
    const vid = ev("v1", 21, "8".repeat(64), "conference talk", [
      ["imeta", "url https://cdn.example/talk.mp4", "m video/mp4", "image https://cdn.example/talk-poster.jpg"],
    ]);
    emit({ hits: [{ event: vid, author: author(vid.pubkey, "hank"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-v1");
    expect(card.querySelector("video")?.getAttribute("poster")).toContain("talk-poster.jpg");
  });

  it("a bare video URL still gets a real first-frame thumb via <video>", async () => {
    setUrlTab("media");
    render(<SearchResults query="clip" pov="nosfabrica" />);
    const vid = ev("v2", 22, "8".repeat(64), "street clip", [
      ["imeta", "url https://cdn.example/clip.mp4", "m video/mp4"],
    ]);
    emit({ hits: [{ event: vid, author: author(vid.pubkey, "hank"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("media-card-v2");
    const video = card.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toContain("clip.mp4");
    // metadata-only fetch until the viewer engages.
    expect(video.getAttribute("preload")).toBe("metadata");
  });

  it("in browse, the trust and follower sorts are unavailable — a link carrying one falls back to newest, and the panel says why", async () => {
    window.history.replaceState({}, "", "/?t=notes&f=sort%3Arank");
    render(<SearchResults query="sort:rank" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
    await vi.waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    const [q] = mainStreamCalls().at(-1)!;
    expect(String(q)).toMatch(/sort:recent/);
    expect(String(q)).not.toMatch(/sort:rank/);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    const sort = screen.getByTestId("filter-sort") as HTMLSelectElement;
    expect(sort).toHaveValue("recent");
    const option = (v: string) => [...sort.querySelectorAll("option")].find((o) => o.value === v)!;
    expect(option("rank").disabled).toBe(true);
    expect(option("followers").disabled).toBe(true);
    expect(option("recent").disabled).toBe(false);
    expect(screen.getByTestId("filter-sort-hint")).toHaveTextContent(/need a search term/i);
  });

  it("with words, every sort is offered and honoured", async () => {
    render(<SearchResults query="bitcoin sort:rank" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
    await vi.waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    expect(String(mainStreamCalls().at(-1)![0])).toMatch(/sort:rank/);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    const sort = screen.getByTestId("filter-sort") as HTMLSelectElement;
    expect(sort).toHaveValue("rank");
    expect([...sort.querySelectorAll("option")].every((o) => !o.disabled)).toBe(true);
    expect(screen.queryByTestId("filter-sort-hint")).toBeNull();
  });

  it("Filters offers a visitor one line to sign in for their own perspective; a member sees none", () => {
    render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    const line = screen.getByTestId("filters-signin");
    expect(line).toHaveTextContent("Sign in to rank through your own network");
    expect(within(line).getByRole("link").getAttribute("href")).toMatch(/^\/login/);
    cleanup();
    render(<SearchResults query="bitcoin" pov="nosfabrica" userPubkey={"a".repeat(64)} onQueryRewrite={vi.fn()} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    expect(screen.queryByTestId("filters-signin")).toBeNull();
  });

  it("filters write visible syntax into the query via onQueryRewrite", async () => {
    const rewrite = vi.fn();
    render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={rewrite} />);

    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    fireEvent.change(screen.getByTestId("filter-sort"), { target: { value: "recent" } });
    expect(rewrite).toHaveBeenLastCalledWith("bitcoin sort:recent");

    fireEvent.change(screen.getByTestId("filter-date"), { target: { value: "custom" } });
    fireEvent.change(screen.getByTestId("filter-since"), { target: { value: "2026-01-01" } });
    expect(rewrite).toHaveBeenLastCalledWith("bitcoin since:2026-01-01");

    fireEvent.click(screen.getByTestId("filter-spam"));
    expect(rewrite).toHaveBeenLastCalledWith("bitcoin include:spam");
  });

  // Benjamin's UX review: nobody types an npub or a 0–100 number. People are
  // picked by NAME; the trust floor speaks the user's own tier ladder.
  it("Rank as… is a people picker — type a name, pick a face, never see hex", async () => {
    const rewrite = vi.fn();
    const hex = "7".repeat(64);
    suggestMock.mockResolvedValue([
      { pubkey: hex, npub: "npub1fiatjaf", name: "fiatjaf", picture: "https://img.example/f.jpg", wotRank: 0.9, wotFollowers: 10 },
    ]);
    render(<SearchResults query="jack" pov="nosfabrica" onQueryRewrite={rewrite} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));

    fireEvent.change(screen.getByTestId("filter-rank-as"), { target: { value: "fia" } });
    const option = await screen.findByTestId(`rank-as-option-${hex.slice(0, 8)}`);
    expect(option).toHaveTextContent("fiatjaf");
    fireEvent.click(option);

    expect(rewrite).toHaveBeenLastCalledWith(`jack observer:${hex}`);
  });

  it("a chosen observer shows as the person, and clears with one click", async () => {
    const rewrite = vi.fn();
    const hex = "7".repeat(64);
    render(
      <SearchResults query={`jack observer:${hex}`} pov="nosfabrica" onQueryRewrite={rewrite} />,
    );
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    // Selected state: a person chip (name resolves when known; npub-short
    // degrade otherwise), not a hex input.
    const chip = screen.getByTestId("rank-as-selected");
    expect(chip.textContent).not.toContain(hex);
    fireEvent.click(screen.getByTestId("rank-as-clear"));
    expect(rewrite).toHaveBeenLastCalledWith("jack");
  });

  // Probed 2026-09-03: the relay ignores filter:rank and has no hops token, and
  // sort:text orders exactly like include:spam. Benjamin: show only filters
  // that are real. So the panel drops those, and the two that people still
  // want — Verified only, and how far to cast the net — are done on the client.
  describe("filters that are real", () => {
    it("offers no relay filter the relay ignores", () => {
      render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      expect(screen.queryByTestId("filter-min-tier")).toBeNull();
      const sorts = [...(screen.getByTestId("filter-sort") as HTMLSelectElement).options].map((o) => o.value);
      expect(sorts).toEqual(["", "recent", "rank", "followers"]);
    });

    it("Verified only is a client toggle that writes trust:verified and hides unrated authors", async () => {
      const rewrite = vi.fn();
      setUrlTab("people");
      const RATED = "1".repeat(64);
      const UNRATED = "2".repeat(64);
      scoreOfMock.mockImplementation((pk) => (pk === UNRATED ? null : 0.85));
      const { rerender } = render(<SearchResults query="jack" pov="nosfabrica" onQueryRewrite={rewrite} />);
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      fireEvent.click(screen.getByTestId("filter-verified"));
      expect(rewrite).toHaveBeenLastCalledWith("jack trust:verified");
      // The page honours the token itself — the relay never sees it.
      rerender(<SearchResults query="jack trust:verified" pov="nosfabrica" onQueryRewrite={rewrite} />);
      emit({
        hits: [
          { event: person("p0", RATED, "rated"), author: author(RATED, "rated"), rank: null },
          { event: person("p1", UNRATED, "unrated"), author: author(UNRATED, "unrated"), rank: null },
        ],
        eose: true,
        timeMs: 100,
      });
      await screen.findByTestId("result-profile-0");
      expect(screen.getByTestId("result-profile-0")).toHaveTextContent("rated");
      expect(screen.queryByTestId("result-profile-1")).toBeNull();
      // Off the wire, and the relay is asked for a deeper page to filter from.
      const main = mainStreamCalls().at(-1)!;
      expect(main[0]).toBe("jack trust:verified");
      expect((main[1] as { limit?: number }).limit).toBeGreaterThanOrEqual(200);
    });

    it("dates are presets — one tap for the past week — with Custom revealing the pickers", () => {
      const rewrite = vi.fn();
      render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={rewrite} />);
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      expect(screen.queryByTestId("filter-since")).toBeNull();
      const preset = screen.getByTestId("filter-date") as HTMLSelectElement;
      expect([...preset.options].map((o) => o.value)).toEqual(["any", "day", "week", "month", "year", "custom"]);
      fireEvent.change(preset, { target: { value: "week" } });
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const ymd = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(weekAgo.getDate()).padStart(2, "0")}`;
      expect(rewrite).toHaveBeenLastCalledWith(`bitcoin since:${ymd}`);
      fireEvent.change(preset, { target: { value: "custom" } });
      expect(screen.getByTestId("filter-since")).toBeInTheDocument();
      expect(screen.getByTestId("filter-until")).toBeInTheDocument();
    });

    // Benjamin's slider: "Trust distance" — how far the search casts its net.
    // The relay can't; the viewer's own follow graph can. Signed out there is
    // no "you" to measure from, so the control isn't there.
    it("reach — People you follow · Friends of friends · Everyone — only for a signed-in viewer", async () => {
      const rewrite = vi.fn();
      render(<SearchResults query="jack" pov="nosfabrica" onQueryRewrite={rewrite} />);
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      expect(screen.queryByTestId("filter-reach")).toBeNull();
      cleanup();
      render(<SearchResults query="jack" pov="nosfabrica" userPubkey={"e".repeat(64)} onQueryRewrite={rewrite} />);
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      const reach = screen.getByTestId("filter-reach");
      expect(reach).toHaveTextContent("People you follow");
      expect(reach).toHaveTextContent("Friends of friends");
      expect(reach).toHaveTextContent("Everyone");
      fireEvent.click(screen.getByTestId("filter-reach-follows"));
      expect(rewrite).toHaveBeenLastCalledWith("jack reach:follows");
    });

    it("reach:follows keeps only people you follow", async () => {
      setUrlTab("people");
      const ME = "e".repeat(64);
      const FOLLOWED = "1".repeat(64);
      const STRANGER = "2".repeat(64);
      reachMock.mockReturnValue({ direct: new Set([FOLLOWED]), friends: new Set([FOLLOWED]), ready: true });
      render(<SearchResults query="jack reach:follows" pov="nosfabrica" userPubkey={ME} onQueryRewrite={vi.fn()} />);
      emit({
        hits: [
          { event: person("p0", STRANGER, "stranger"), author: author(STRANGER, "stranger"), rank: null },
          { event: person("p1", FOLLOWED, "friend"), author: author(FOLLOWED, "friend"), rank: null },
        ],
        eose: true,
        timeMs: 100,
      });
      await screen.findByTestId("result-profile-0");
      expect(screen.getByTestId("result-profile-0")).toHaveTextContent("friend");
      expect(screen.queryByText("stranger")).toBeNull();
      expect(reachMock).toHaveBeenCalledWith(ME);
    });

    // With the tokens gone from the box, the Filters button carries the count.
    it("the Filters button shows how many filters are on", () => {
      render(<SearchResults query="btc sort:rank trust:verified" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
      expect(screen.getByTestId("search-filters-toggle")).toHaveTextContent("Filters");
      expect(screen.getByTestId("filters-active-count")).toHaveTextContent("2");
      cleanup();
      render(<SearchResults query="btc" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
      expect(screen.queryByTestId("filters-active-count")).toBeNull();
    });

    it("the panel reads current filter state back from the query", () => {
      render(
        <SearchResults query="btc sort:rank include:spam trust:verified reach:friends" pov="nosfabrica" userPubkey={"e".repeat(64)} onQueryRewrite={vi.fn()} />,
      );
      fireEvent.click(screen.getByTestId("search-filters-toggle"));
      expect((screen.getByTestId("filter-sort") as HTMLSelectElement).value).toBe("rank");
      expect((screen.getByTestId("filter-spam") as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId("filter-verified") as HTMLInputElement).checked).toBe(true);
      expect(screen.getByTestId("filter-reach-friends").getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("raises a knowledge panel when a person matches the query strongly", async () => {
    suggestMock.mockResolvedValueOnce([
      {
        pubkey: "b".repeat(64),
        npub: "npub1panel",
        name: "alice",
        about: "chief bitcoiner",
        nip05: "alice@example.com",
        wotRank: 0.9,
        wotFollowers: 1234,
      },
    ]);
    render(<SearchResults query="alice" pov="nosfabrica" />);
    const panel = await screen.findByTestId("search-knowledge-panel");
    expect(panel).toHaveTextContent("alice");
    expect(panel).toHaveTextContent("chief bitcoiner");
    // The deep-dive CTA links to the full profile.
    expect(screen.getByTestId("knowledge-panel-profile").getAttribute("href")).toBe("/p/npub1panel");
  });

  it("keeps quiet when the top person is only a weak match", async () => {
    setUrlTab("notes");
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1x", name: "completely different", wotRank: null, wotFollowers: null },
    ]);
    render(<SearchResults query="alice" pov="nosfabrica" />);
    emit({ hits: [], eose: true, timeMs: 50 });
    await screen.findByTestId("container-no-results");
    expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
  });

  it("never probes for a panel when the query carries syntax", () => {
    render(<SearchResults query="alice from:npub1abc" pov="nosfabrica" />);
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("shows the relay's refusal reason when the stream errors", async () => {
    setUrlTab("notes");
    render(<SearchResults query="jack" pov="nosfabrica" />);
    emit({ error: "auth-required: name a lens" });
    expect(await screen.findByTestId("search-error")).toHaveTextContent("auth-required");
  });

  it("says so plainly when a search finds nothing", async () => {
    setUrlTab("notes");
    render(<SearchResults query="zzz" pov="nosfabrica" />);
    emit({ hits: [], eose: true, timeMs: 100 });
    expect(await screen.findByTestId("container-no-results")).toBeInTheDocument();
  });
});
