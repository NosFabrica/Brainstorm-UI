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
  };
});
const repoCountsMock = vi.fn<() => Promise<{ issues: number; patches: number }>>(() =>
  Promise.resolve({ issues: 0, patches: 0 }),
);

// Member piles hydrate through fetchProfileMap — stubbed so jsdom never
// touches relays; tests seed profiles into this map per case.
const profileMapMock = new Map<string, { name?: string; picture?: string }>();
vi.mock("@/services/nostr", () => ({
  // The person panel asks for the person's tracks and streams; nobody here has any.
  fetchRecentByKinds: () => Promise.resolve([]),
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
const wavlakeSearchMock = vi.fn<(term: string) => Promise<import("@/lib/wavlake").WavlakeSong[]>>(() => Promise.resolve([]));
vi.mock("@/lib/wavlake", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wavlake")>()),
  searchWavlakeTracks: (term: string) => wavlakeSearchMock(term),
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
  // The most recent MAIN stream (the panel's probes are not it).
  const main = [...allStreams].reverse().find((c) => !isPanelProbe(c.query, c.params))!;
  main.cb({ hits: [], eose: false, timeMs: null, error: null, ...partial });
}

beforeEach(() => {
  vi.clearAllMocks();
  profileMapMock.clear();
  repoCountsMock.mockResolvedValue({ issues: 0, patches: 0 });
  endorsementsMock.mockReturnValue(null);
  followsMock = new Set();
  personEndorsementsMock.mockReturnValue(null);
  flagsMock.mockImplementation(() => false);
  reachMock.mockReturnValue({ direct: new Set(), friends: new Set(), ready: true });
  scoreOfMock.mockImplementation(() => 0.85);
  allStreams = [];
  window.history.replaceState({}, "", "/?q=jack");
});

const setUrlTab = (t: string | null) =>
  window.history.replaceState({}, "", t ? `/?q=jack&t=${t}` : "/?q=jack");

describe("SearchResults", () => {
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

    const live = ev("l1", 30311, "e".repeat(64), "", [["d", "s"], ["title", "NoGood Radio"], ["status", "live"]]);
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
      // The card reads as an event: a date tile, the title, when, where.
      const tonight = screen.getByTestId("event-card-e-tonight");
      expect(within(tonight).getByTestId("event-date-tile")).toBeInTheDocument();
      expect(tonight).toHaveTextContent("Bitcoin Liverpool Meetup");
      expect(tonight).toHaveTextContent(/Today|Tomorrow|In \d+ hours/);
      expect(tonight).toHaveTextContent("Liverpool, UK");
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
    const live = ev("l1", 30311, "e".repeat(64), "", [
      ["d", "stream-1"],
      ["title", "Nostr Dev Call"],
      ["status", "live"],
    ]);
    emit({ hits: [{ event: live, author: author(live.pubkey, "erin"), rank: null }], eose: true, timeMs: 200 });
    expect(await screen.findByText("Nostr Dev Call")).toBeInTheDocument();
    expect(screen.getByTestId("live-status-l1")).toHaveTextContent(/live/i);
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
    // One frame, not two: the row draws its own border, the card adds none.
    expect(card.className).not.toMatch(/border|rounded-2xl|px-2/);
    expect(within(card).getByTestId("embedded-track").className).toMatch(/border/);
    expect(screen.queryByTestId("track-card-t2")).toBeNull();
    expect(screen.queryByText(/TOMB-7703/)).toBeNull();
  });

  // Ainsley Costello publishes no native tracks; her music is on Wavlake. The
  // Music tab asks Wavlake with the same words and plays what it finds,
  // labelled as Wavlake's — so the tab is never "Nothing found" for an artist
  // whose songs are one API away.
  it("the Music tab plays Wavlake's songs for the words, labelled, when Nostr has none", async () => {
    wavlakeSearchMock.mockResolvedValue([
      { id: "wavlake:04cead49", title: "Two Ships", artist: "Ainsley Costello", cover: "https://img/two-ships.jpg", audio: "https://cdn/two-ships.mp3", durationSec: 217, url: "https://wavlake.com/track/04cead49", source: "wavlake", artistNpub: "" },
    ]);
    setUrlTab("music");
    render(<SearchResults query="Ainsley Costello" pov="nosfabrica" />);
    emit({ hits: [], eose: true, timeMs: 90 });

    const card = await screen.findByTestId("wavlake-song-wavlake:04cead49");
    expect(wavlakeSearchMock).toHaveBeenCalledWith("Ainsley Costello");
    expect(card).toHaveTextContent("Two Ships");
    expect(card).toHaveTextContent("Ainsley Costello");
    expect(card).toHaveTextContent("Wavlake");
    expect(within(card).getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
    expect(card.className).not.toMatch(/border|rounded-2xl|px-2/);
    expect(screen.queryByTestId("container-no-results")).toBeNull();
    // The count counts what is shown, whichever source it came from.
    expect(screen.getByTestId("text-search-stats")).toHaveTextContent("About 1 result");
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

  it("a repo announcement shows its issue and patch counts", async () => {
    setUrlTab("repos");
    repoCountsMock.mockResolvedValue({ issues: 12, patches: 3 });
    render(<SearchResults query="relay" pov="nosfabrica" />);
    const repo = ev("rc1", 30617, "f".repeat(64), "", [["d", "ngit"], ["name", "ngit"]]);
    emit({ hits: [{ event: repo, author: author(repo.pubkey, "dan"), rank: null }], eose: true, timeMs: 200 });
    const card = await screen.findByTestId("repo-card-rc1");
    expect(repoCountsMock).toHaveBeenCalledWith("30617:" + "f".repeat(64) + ":ngit");
    expect(await within(card).findByText(/12 issues/)).toBeInTheDocument();
    expect(within(card).getByText(/3 patches/)).toBeInTheDocument();
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

  it("a Brainstorm follow set shows its members as trust-ringed faces", async () => {
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
    // The face pile wears the app's tier rings (scores from the shared cache).
    const pile = screen.getByTestId("list-members-fs1");
    const ringed = [...pile.querySelectorAll("span")].filter((el) => el.className.includes("shadow-[0_0_0"));
    expect(ringed.length).toBe(3);
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
    // The caption drops the URL; a quiet host label says where it lives.
    expect(card.textContent).not.toContain("https://media.divine.video/abc123.mp4");
    expect(card).toHaveTextContent("media.divine.video");
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
