// @vitest-environment jsdom
/**
 * One panel slot, two panel types: a strong PERSON match wins it; otherwise
 * a query with real hashtag activity earns the TOPIC panel — the entity
 * card for "liverpool" the way jack gets his.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { nip19, type NostrEvent } from "nostr-tools";
import type { SearchSnapshot, SearchParams } from "@/services/search";

const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
const nipPageMock = vi.fn<() => Promise<NostrEvent | null>>(() => Promise.resolve(null));
const personSetsMock = vi.fn<() => Promise<{ title: string; exporters: number }[]>>(() => Promise.resolve([]));
let streamCalls: { query: string; params: SearchParams; emit: (s: Partial<SearchSnapshot>) => void }[] = [];

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    suggestProfiles: () => suggestMock(),
    fetchNipPage: (...args: unknown[]) => nipPageMock(...(args as [])),
    fetchPersonSets: (...args: unknown[]) => personSetsMock(...(args as [])),
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
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.7);
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
}));
type Endorsements = import("@/services/endorsements").AppEndorsements;
const endorsementsMock = vi.fn<(address: string | null, opts: unknown) => Endorsements | null>(() => null);
vi.mock("@/hooks/useAppEndorsements", () => ({
  useAppEndorsements: (address: string | null, opts: unknown) => endorsementsMock(address, opts),
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
let followsMock = new Set<string>();
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: followsMock, ready: true, signedIn: followsMock.size > 0 }),
}));
// Follower faces hydrate through fetchProfileMap — stubbed so jsdom never
// touches relays; tests seed names per case.
const profileMapMock = new Map<string, { name?: string; picture?: string }>();
const findWavlakeArtistMock = vi.fn<(args: { name?: string | null; pubkey?: string | null }) => Promise<import("@/lib/wavlake").WavlakeArtist | null>>(() => Promise.resolve(null));
const wavlakeArtistTracksMock = vi.fn<(id: string, limit?: number) => Promise<import("@/lib/wavlake").WavlakeSong[]>>(() => Promise.resolve([]));
vi.mock("@/lib/wavlake", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wavlake")>()),
  findWavlakeArtist: (args: { name?: string | null; pubkey?: string | null }) => findWavlakeArtistMock(args),
  wavlakeArtistTracks: (id: string, limit?: number) => wavlakeArtistTracksMock(id, limit),
}));
const recentByKindsMock = vi.fn<(pubkey: string, kinds: number[], limit: number) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
const liveStreamsMock = vi.fn<(pubkey: string) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(profileMapMock)),
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number) => recentByKindsMock(pubkey, kinds, limit),
  fetchLiveStreams: (pubkey: string) => liveStreamsMock(pubkey),
}));

// The zap flow is the public profile's — faked to a marker so the panel can
// prove it hands over the right recipient.
const zapModalMock = vi.fn();
vi.mock("@/components/ZapModal", () => ({
  ZapModal: (props: { open: boolean; lud16: string; recipientPubkey: string; displayName: string }) => {
    zapModalMock(props);
    return props.open ? <div data-testid="zap-modal">{props.lud16}</div> : null;
  },
}));

import { KnowledgePanel } from "./KnowledgePanel";

function noteHit(id: string, pubkey: string, name: string, created_at: number, tags: string[][] = []) {
  return {
    event: { id, kind: 1, pubkey, tags, content: "x", created_at, sig: "s" } as NostrEvent,
    author: { pubkey, npub: `npub1${name}`, name, wotRank: null, wotFollowers: null },
    rank: null,
  };
}

const NOW = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  nipPageMock.mockResolvedValue(null);
  personSetsMock.mockResolvedValue([]);
  endorsementsMock.mockReturnValue(null);
  personEndorsementsMock.mockReturnValue(null);
  flagsMock.mockImplementation(() => false);
  scoreOfMock.mockImplementation(() => 0.7);
  followsMock = new Set();
  profileMapMock.clear();
  streamCalls = [];
  recentByKindsMock.mockResolvedValue([]);
  liveStreamsMock.mockResolvedValue([]);
  findWavlakeArtistMock.mockResolvedValue(null);
  wavlakeArtistTracksMock.mockResolvedValue([]);
});

// Trust reviews in the panel, Google's knowledge-panel way: an identity chip
// beside the name when trusted accounts confirmed who this is (the words on
// hover — identity is a claim, and "this mf is a fake" was filed as one), the
// most trusted vouch quoted, and the way to the full list on the person page.
describe("the person panel's trust reviews", () => {
  const DAVID = "b".repeat(64);
  const BEN = "c".repeat(64);
  const STRANGER = "d".repeat(64);
  const david = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: DAVID, npub: "npub1david", name: "david", wotRank: 0.9, wotFollowers: 42 }]);
  const signals = (vouches: { id: string; pubkey: string; type: "vouch" | "identity"; text: string; at: number }[]) => ({
    followedBy: [], total: null, vouches,
  });

  it("confirms identity only from trusted reviewers, with their words in reach", async () => {
    david();
    personEndorsementsMock.mockReturnValue(signals([
      { id: "v1", pubkey: BEN, type: "identity", text: "✅ This account is the real david.", at: 200 },
      { id: "v2", pubkey: STRANGER, type: "identity", text: "this mf is a fake", at: 300 },
    ]));
    profileMapMock.set(BEN, { name: "benjamin" });
    // useAuthorScores is faked at 0.7 for everyone — so STRANGER is "verified"
    // too; make them the outsider through the follows-free, score-null route.
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    const chip = await screen.findByTestId("person-identity");
    await vi.waitFor(() => expect(chip.getAttribute("title")).toContain("benjamin"));
    expect(chip).toHaveTextContent("Identity confirmed");
    expect(chip.getAttribute("title")).toContain("This account is the real david.");
  });

  // The panel says how many reviews and from whom, in plain words — the same
  // line the person page collapses to — and that line is the way there. No
  // face (the Followed-by line has them), no quote, no reviewer name.
  it("sums the reviews in plain words and links to the full list", async () => {
    david();
    personEndorsementsMock.mockReturnValue(signals([
      { id: "v1", pubkey: BEN, type: "vouch", text: "This user created www.relayop.xyz - a solution for the next phase of the internet.", at: 200 },
    ]));
    profileMapMock.set(BEN, { name: "benjamin" });
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    const link = await screen.findByTestId("person-reviews-link");
    expect(link).toHaveTextContent("1 review from a verified account");
    expect(link.getAttribute("href")).toBe("/p/npub1david#trust-reviews");
    expect(link.textContent).not.toContain("benjamin");
    expect(link.textContent).not.toContain("relayop");
    expect(screen.queryByTestId("person-vouch-quote")).toBeNull();
  });

  it("no vouches, no chip, no quote, no link", async () => {
    david();
    personEndorsementsMock.mockReturnValue(signals([]));
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("person-identity")).toBeNull();
    expect(screen.queryByTestId("person-vouch-quote")).toBeNull();
    expect(screen.queryByTestId("person-reviews-link")).toBeNull();
  });
});

// A person's endorsements are their followers — the Google shared-endorsement
// beat under the name: the most trusted faces that follow them, and how many
// verified accounts do in all. And the one honest negative: a chip when the
// network has FLAGGED the account, never a raw report count for everyone.
describe("the person panel's endorsements", () => {
  const DAVID = "b".repeat(64);
  const ALICE = "c".repeat(64);
  const BOB = "d".repeat(64);
  const david = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: DAVID, npub: "npub1david", name: "david", wotRank: 0.9, wotFollowers: 42 }]);

  it("shows who follows them, ringed, with the verified total", async () => {
    david();
    personEndorsementsMock.mockReturnValue({ followedBy: [{ pubkey: ALICE, score01: 0.9 }, { pubkey: BOB, score01: 0.4 }], total: 1234 });
    profileMapMock.set(ALICE, { name: "alice" });
    profileMapMock.set(BOB, { name: "bob" });
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    const line = await screen.findByTestId("person-followed-by");
    await vi.waitFor(() => expect(line).toHaveTextContent("Followed by alice, bob & 1.2k verified accounts"));
    expect(line.querySelector('[class*="shadow-[0_0_0"]')).not.toBeNull();
    expect(personEndorsementsMock).toHaveBeenCalledWith(DAVID, false);
    // Where the line leads: the full followers list.
    expect(line.closest("a")?.getAttribute("href")).toBe("/p/npub1david/followers");
  });

  it("speaks as the viewer under My perspective", async () => {
    david();
    personEndorsementsMock.mockReturnValue({ followedBy: [{ pubkey: ALICE, score01: 0.9 }], total: 12 });
    render(<KnowledgePanel query="david" pov="mywot" userPubkey={"e".repeat(64)} />);
    const line = await screen.findByTestId("person-followed-by");
    expect(line).toHaveTextContent("accounts you trust");
    expect(personEndorsementsMock).toHaveBeenCalledWith(DAVID, true);
  });

  it("flags an account the network has flagged — and only then", async () => {
    david();
    flagsMock.mockImplementation((pk) => pk === DAVID);
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    const chip = await screen.findByTestId("person-flagged");
    expect(chip).toHaveTextContent("Flagged by the network");
  });

  // The identity rows sit right under the name: the NIP-05 handle, and — new,
  // Benjamin's ask — the lightning address, so "who is this and how do I pay
  // them" reads in one glance, like the person card.
  it("shows the lightning address under the name", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: DAVID, npub: "npub1david", name: "david", nip05: "david@bitcoinpark.com", lud16: "david@getalby.com", wotRank: 0.9, wotFollowers: 42 },
    ]);
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    const panel = await screen.findByTestId("search-knowledge-panel");
    expect(screen.getByTestId("person-lightning")).toHaveTextContent("david@getalby.com");
    // Identity first, then social proof.
    const text = panel.textContent ?? "";
    expect(text.indexOf("david@bitcoinpark.com")).toBeLessThan(text.indexOf("david@getalby.com"));
  });

  // Benjamin: tapping the address should send a zap, the public profile's flow.
  it("tapping the lightning address opens the zap flow for this person, not their profile", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: DAVID, npub: "npub1david", name: "david", lud16: "david@getalby.com", wotRank: 0.9, wotFollowers: 42 },
    ]);
    window.history.replaceState({}, "", "/?q=david");
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("zap-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("person-lightning"));
    expect(screen.getByTestId("zap-modal")).toHaveTextContent("david@getalby.com");
    expect(zapModalMock).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, recipientPubkey: DAVID, displayName: "david" }));
    // The panel's own click-through did not fire.
    expect(window.location.pathname).toBe("/");
  });

  it("no flag, no chip; no followers, no line", async () => {
    david();
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("person-flagged")).toBeNull();
    expect(screen.queryByTestId("person-followed-by")).toBeNull();
  });
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
    // One action per panel: the title IS the link to the feed. No button
    // beneath, and no grey sub-headings over blocks that explain themselves.
    expect(screen.getByTestId("topic-panel-feed")).toHaveTextContent("#liverpool");
    expect(within(panel).queryByText(/Open the #/)).toBeNull();
    expect(within(panel).queryByText("Voices on it")).toBeNull();
    expect(within(panel).queryByText("Related topics")).toBeNull();
    expect(within(panel).queryByText("Upcoming events")).toBeNull();
  });

  it("on a phone the panel folds to one row — name and a line — until tapped", async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    try {
      suggestMock.mockResolvedValueOnce([{ pubkey: "9".repeat(64), npub: "npub1barattolo", name: "Barattolo", wotRank: 0.8, wotFollowers: 300 }]);
      render(<KnowledgePanel query="Barattolo" pov="nosfabrica" />);
      const strip = await screen.findByTestId("panel-strip");
      expect(strip).toHaveTextContent("Barattolo");
      expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
      fireEvent.click(strip);
      expect(await screen.findByTestId("search-knowledge-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("panel-strip")).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });

  // Benjamin: "when users type in a search that pulls in an event, those
  // events should be shown under here like a Google events feel — make it
  // feel real and relevant, not forced. For example chicago." Google's
  // knowledge panel lists a few upcoming events with date tiles. Ours does
  // the same from the Events vertical: upcoming only, soonest first, three
  // at most, a link to the rest — and nothing at all when nothing is coming up.
  it("lists up to three upcoming events for the topic, soonest first, with a way to the rest", async () => {
    render(<KnowledgePanel query="chicago" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.some((c) => c.params.tab === "events")).toBe(true));
    const eventsProbe = streamCalls.find((c) => c.params.tab === "events")!;
    expect(eventsProbe.query).toBe("chicago sort:recent");
    // Topic probe answers first so the topic panel takes the slot.
    streamCalls[0].emit({
      hits: [noteHit("t1", "1".repeat(64), "bot", NOW - 100), noteHit("t2", "2".repeat(64), "w", NOW - 200), noteHit("t3", "3".repeat(64), "m", NOW - 300)],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    const DAY = 86_400;
    const cal = (id: string, title: string, start: number) =>
      ({ event: { id, kind: 31923, pubkey: "c".repeat(64), created_at: NOW - 1000, content: "", sig: "", tags: [["d", id], ["title", title], ["start", String(start)], ["location", "200 N La Salle St, Chicago, IL, United States"], ...(id === "ev-soon" ? [["image", "https://img/soon.jpg"]] : [])] } as NostrEvent, author: null, rank: null });
    eventsProbe.emit({
      hits: [
        cal("ev-far", "Chicago Bitcoin Conference", NOW + 40 * DAY),
        cal("ev-past", "Chicago Meetup (July)", NOW - 30 * DAY),
        cal("ev-soon", "Chicago Bitcoin Meetup", NOW + 2 * DAY),
        cal("ev-mid", "Nostr Chicago Social", NOW + 9 * DAY),
        cal("ev-later", "Lightning Chicago Hack Night", NOW + 20 * DAY),
      ],
      eose: true,
      timeMs: 120,
    });
    const block = await screen.findByTestId("topic-events");
    const rows = [...block.querySelectorAll('[data-testid^="topic-event-"]')].map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["topic-event-ev-soon", "topic-event-ev-mid", "topic-event-ev-later"]);
    expect(block).not.toHaveTextContent("July");
    const soon = screen.getByTestId("topic-event-ev-soon");
    expect(soon).toHaveTextContent("Chicago Bitcoin Meetup");
    // Luma's row: the time and the town, not the postal address; the cover as a square.
    expect(soon).toHaveTextContent(/\d{1,2}:\d{2}|All day/);
    expect(soon).toHaveTextContent("Chicago, IL");
    expect(soon).not.toHaveTextContent("La Salle");
    expect(within(soon).getByTestId("cover-topic-event-ev-soon").getAttribute("src")).toBe("https://img/soon.jpg");
    expect(soon.getAttribute("href")).toMatch(/^\/e\//);
    expect(screen.getByTestId("topic-events-more").getAttribute("href")).toBe("/?q=chicago&t=events");
  });

  it("stays silent about events when none are coming up", async () => {
    render(<KnowledgePanel query="chicago" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.some((c) => c.params.tab === "events")).toBe(true));
    streamCalls[0].emit({
      hits: [noteHit("t1", "1".repeat(64), "bot", NOW - 100), noteHit("t2", "2".repeat(64), "w", NOW - 200), noteHit("t3", "3".repeat(64), "m", NOW - 300)],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    streamCalls.find((c) => c.params.tab === "events")!.emit({
      hits: [{ event: { id: "old", kind: 31923, pubkey: "c".repeat(64), created_at: NOW - 1000, content: "", sig: "", tags: [["d", "old"], ["title", "Chicago Meetup"], ["start", String(NOW - 86_400)]] } as NostrEvent, author: null, rank: null }],
      eose: true,
      timeMs: 120,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("topic-events")).toBeNull();
  });

  it("summarizes the topic's activity: note count and voice count", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "1".repeat(64), "kop", NOW - 3000),
        noteHit("t4", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });
    const panel = await screen.findByTestId("search-topic-panel");
    // 4 notes from 3 distinct voices.
    expect(screen.getByTestId("topic-activity")).toHaveTextContent("4 recent notes");
    expect(screen.getByTestId("topic-activity")).toHaveTextContent("3 voices");
    expect(panel).toHaveTextContent("Active today");
  });

  it("voices are named rows linking to their profiles", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    const voice = screen.getByTestId(`topic-voice-${"1".repeat(64)}`);
    expect(voice).toHaveTextContent("kop");
    expect(voice.getAttribute("href")).toBe("/p/npub1kop");
    // The trust-tier ring rides every avatar in the app — voices included
    // (useAuthorScores is mocked to 0.7 → a ringed tier).
    const ringed = voice.querySelector('[class*="shadow-[0_0_0"]');
    expect(ringed).not.toBeNull();
  });

  it("suggests related topics from tags that ride along on the notes", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100, [["t", "liverpool"], ["t", "PremierLeague"]]),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000, [["t", "liverpool"], ["t", "premierleague"], ["t", "ynwa"]]),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000, [["t", "liverpool"], ["t", "onceonly"]]),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    // premierleague rides on two notes → suggested; the searched tag itself
    // and one-off tags stay out.
    const rel = screen.getByTestId("topic-related-premierleague");
    expect(rel).toHaveTextContent("#premierleague");
    expect(rel.getAttribute("href")).toBe("/?q=%23premierleague");
    expect(screen.queryByTestId("topic-related-liverpool")).toBeNull();
    expect(screen.queryByTestId("topic-related-onceonly")).toBeNull();
  });

  it("same-named bot accounts collapse to one voice row", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "GazetaRSS", NOW - 2000),
        noteHit("t3", "3".repeat(64), "GazetaRSS", NOW - 3000),
        noteHit("t4", "4".repeat(64), "GazetaRSS", NOW - 4000),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    expect(screen.getAllByText("GazetaRSS")).toHaveLength(1);
  });

  it("a query matching an app adds an Apps module to the rail", async () => {
    render(<KnowledgePanel query="amethyst" pov="nosfabrica" />);
    await vi.waitFor(() =>
      expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true),
    );
    const appsCall = streamCalls.find((c) => c.params.tab === "apps")!;
    const listing = {
      id: "ap1",
      kind: 32267,
      pubkey: "9".repeat(64),
      tags: [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"], ["summary", "The all-in-one Nostr client"], ["icon", "https://cdn.zapstore.dev/a.png"]],
      content: "",
      created_at: NOW - 500,
      sig: "s",
    } as NostrEvent;
    const offTopic = {
      ...listing, id: "ap2",
      tags: [["d", "net.primal"], ["name", "Primal"], ["summary", "Feeds"]],
    } as NostrEvent;
    appsCall.emit({
      hits: [
        { event: listing, author: null, rank: null },
        { event: offTopic, author: null, rank: null },
      ],
      eose: true,
      timeMs: 90,
    });
    const panel = await screen.findByTestId("search-apps-panel");
    expect(panel).toHaveTextContent("Amethyst");
    // Fuzzy strays whose NAME doesn't match the query stay out.
    expect(panel).not.toHaveTextContent("Primal");
    expect(screen.getByTestId("apps-panel-app-ap1").getAttribute("href")).toMatch(/^\/e\//);
    // The deep link into the full Apps vertical.
    expect(screen.getByTestId("apps-panel-more").getAttribute("href")).toBe("/?q=amethyst&t=apps");
  });

  // Benjamin: no review copy on search surfaces — the rail row is icon,
  // name, summary. Reviews live on the app page.
  it("app rows carry no review count", async () => {
    endorsementsMock.mockReturnValue({ address: "x", reviews: [], reviewCount: 14, zaps: [], zapCount: 101, collectionCount: 46 });
    render(<KnowledgePanel query="amethyst" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true));
    streamCalls.find((c) => c.params.tab === "apps")!.emit({
      hits: [{
        event: { id: "ap1", kind: 32267, pubkey: "9".repeat(64), tags: [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"]], content: "", created_at: NOW, sig: "s" } as NostrEvent,
        author: null, rank: null,
      }],
      eose: true, timeMs: 90,
    });
    await screen.findByTestId("apps-panel-app-ap1");
    expect(screen.queryByTestId("apps-panel-meta-ap1")).toBeNull();
    expect(endorsementsMock).not.toHaveBeenCalled();
  });

  it("no name-matching app, no Apps module", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() =>
      expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true),
    );
    const appsCall = streamCalls.find((c) => c.params.tab === "apps")!;
    appsCall.emit({
      hits: [{
        event: { id: "ap3", kind: 32267, pubkey: "9".repeat(64), tags: [["name", "SoccerStats"]], content: "", created_at: NOW, sig: "s" } as NostrEvent,
        author: null, rank: null,
      }],
      eose: true,
      timeMs: 80,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-apps-panel")).toBeNull();
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

  it("a NIP-shaped query gets the spec card, not a person hunt", async () => {
    nipPageMock.mockResolvedValue({
      id: "e".repeat(64),
      kind: 30818,
      pubkey: "f".repeat(64),
      tags: [["d", "nip-46"], ["title", "Nostr Connect"]],
      content: "# NIP-46\n\nNostr Connect lets a client talk to a remote signer over relays.",
      created_at: 1_710_000_000,
      sig: "s",
    } as NostrEvent);
    render(<KnowledgePanel query="nip-46" pov="nosfabrica" />);
    const panel = await screen.findByTestId("search-nip-panel");
    // Asked for both spellings the wiki uses.
    expect(nipPageMock).toHaveBeenCalledWith(["nip-46"]);
    expect(panel).toHaveTextContent("NIP-46");
    expect(panel).toHaveTextContent("Nostr Connect");
    expect(panel).toHaveTextContent(/remote signer/);
    expect(screen.getByTestId("nip-panel-read").getAttribute("href")).toMatch(/^\/(e|a)\//);
    // A spec lookup is not a person or topic hunt.
    expect(suggestMock).not.toHaveBeenCalled();
    expect(streamCalls).toHaveLength(0);
  });

  it("'nip 5' pads and tries both wiki spellings", async () => {
    render(<KnowledgePanel query="nip 5" pov="nosfabrica" />);
    await vi.waitFor(() => expect(nipPageMock).toHaveBeenCalled());
    expect(nipPageMock).toHaveBeenCalledWith(["nip-5", "nip-05"]);
  });

  it("a person's follow-set memberships badge their panel with exporter counts", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1david", name: "david", wotRank: 0.9, wotFollowers: 42 },
    ]);
    const P1 = "1".repeat(64);
    const P2 = "2".repeat(64);
    const P3 = "3".repeat(64);
    // The badge opens the list of the publisher the network trusts most.
    scoreOfMock.mockImplementation((pk) => ({ [P1]: 0.3, [P2]: 0.9, [P3]: null })[pk] ?? 0.7);
    personSetsMock.mockResolvedValue([
      { title: "Verified Human", exporters: 3, exporterPubkeys: [P1, P2, P3], sets: [{ id: "a".repeat(64), pubkey: P1 }, { id: "b".repeat(64), pubkey: P2 }, { id: "c".repeat(64), pubkey: P3 }] },
      { title: "AOS 2026 Participant", exporters: 2, exporterPubkeys: [P1, P2], sets: [{ id: "d".repeat(64), pubkey: P1 }, { id: "e".repeat(64), pubkey: P2 }] },
      // One account's private list name — not a credential, whoever they are.
      // Benjamin's "Plebs · 1" catch.
      { title: "Plebs", exporters: 1, exporterPubkeys: ["9".repeat(64)], sets: [{ id: "f".repeat(64), pubkey: "9".repeat(64) }] },
    ]);
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    // Asked about THIS person.
    await vi.waitFor(() => expect(personSetsMock).toHaveBeenCalledWith("b".repeat(64)));
    const badge = await screen.findByTestId("person-set-Verified Human");
    expect(badge).toHaveTextContent("Verified Human");
    expect(badge).toHaveTextContent("3");
    // Two publishers agreeing stays; one publisher's list goes.
    expect(screen.getByTestId("person-set-AOS 2026 Participant")).toHaveTextContent("2");
    expect(screen.queryByTestId("person-set-Plebs")).toBeNull();
    // And the badges say what they are.
    expect(screen.getByTestId("person-sets")).toHaveTextContent("Listed in");
    // Each badge opens a specific list's page — the one from the publisher the
    // network trusts most (P2 at 0.9) — not a search.
    const href = badge.closest("a")?.getAttribute("href") ?? "";
    expect(href).toMatch(/^\/e\/nevent1/);
    const decoded = nip19.decode(href.slice("/e/".length));
    expect(decoded.type).toBe("nevent");
    expect((decoded.data as { id: string; author?: string }).id).toBe("b".repeat(64));
  });

  // Google's knowledge panel is one big click-through to the entity, with
  // the links inside it keeping their own targets. Ours: the panel opens the
  // public profile; badges, followed-by, reviews and the CTA go where they say.
  it("the panel itself opens the public profile, except on its inner links", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1david", name: "david", about: "epileptologist", wotRank: 0.9, wotFollowers: 42 },
    ]);
    const onOpen = vi.fn();
    render(<KnowledgePanel query="david" pov="nosfabrica" onOpen={onOpen} />);
    const panel = await screen.findByTestId("search-knowledge-panel");
    fireEvent.click(screen.getByText("epileptologist"));
    expect(window.location.pathname).toBe("/p/npub1david");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(panel.getAttribute("role")).toBe("link");
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

// Benjamin: musicians' songs should be findable and playable through search.
// Google's panel for an artist carries a Songs row; ours carries the person's
// native tracks (kind 31337), playable in place, with the profile for the rest.
describe("the person panel's music", () => {
  const NOVA = "e".repeat(64);
  const nova = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: NOVA, npub: "npub1nova", name: "NOVA", wotRank: 0.8, wotFollowers: 12 }]);
  const track = (id: string, title: string): NostrEvent =>
    ({ id, kind: 31337, pubkey: NOVA, created_at: NOW - 100, sig: "s", content: "", tags: [["d", id], ["title", title], ["artist", "NOVA"], ["media", `https://renaissancemachine.ai/music/${id}.mp3`]] }) as NostrEvent;

  it("plays the person's latest tracks in the panel and points at the profile for the rest", async () => {
    nova();
    recentByKindsMock.mockResolvedValue([
      track("t1", "Old Carbon"),
      track("t2", "Duende"),
      { id: "junk", kind: 31337, pubkey: NOVA, created_at: NOW - 50, sig: "s", content: "tester", tags: [["d", "x"]] } as NostrEvent,
    ]);
    render(<KnowledgePanel query="nova" pov="nosfabrica" />);

    const music = await screen.findByTestId("person-music");
    expect(recentByKindsMock).toHaveBeenCalledWith(NOVA, [31337], expect.any(Number));
    expect(music).toHaveTextContent("Old Carbon");
    expect(music).toHaveTextContent("Duende");
    expect(within(music).getAllByTestId("track-play")).toHaveLength(2);
    expect(music).not.toHaveTextContent("tester");
    expect(within(music).getByTestId("person-music-more").getAttribute("href")).toBe("/p/npub1nova");
  });

  it("has no music row for someone who publishes none", async () => {
    nova();
    render(<KnowledgePanel query="nova" pov="nosfabrica" />);
    await screen.findByTestId("knowledge-panel-profile");
    await vi.waitFor(() => expect(recentByKindsMock).toHaveBeenCalled());
    expect(screen.queryByTestId("person-music")).toBeNull();
  });
});

describe("the person panel's music, from Wavlake", () => {
  const AINSLEY = "8".repeat(64);
  const ainsley = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: AINSLEY, npub: "npub1ainsley", name: "ainsleycostello", displayName: "Ainsley Costello", wotRank: 0.9, wotFollowers: 4700 }]);

  it("plays the artist's Wavlake songs when they publish no native tracks, and points at Wavlake for the rest", async () => {
    ainsley();
    findWavlakeArtistMock.mockResolvedValue({ id: "3dac722c", name: "Ainsley Costello", url: "https://wavlake.com/ainsley-costello", artistNpub: "" });
    wavlakeArtistTracksMock.mockResolvedValue([
      { id: "wavlake:04cead49", title: "Two Ships", artist: "Ainsley Costello", audio: "https://cdn/two-ships.mp3", durationSec: 217, url: "https://wavlake.com/track/04cead49", source: "wavlake", artistNpub: "" },
    ]);
    render(<KnowledgePanel query="Ainsley Costello" pov="nosfabrica" />);

    const music = await screen.findByTestId("person-music");
    // Looked up as the person — key first, name second.
    expect(findWavlakeArtistMock).toHaveBeenCalledWith({ name: "Ainsley Costello", pubkey: AINSLEY });
    expect(music).toHaveTextContent("Two Ships");
    expect(music).toHaveTextContent("Wavlake");
    expect(within(music).getByTestId("track-play")).toBeInTheDocument();
    const more = within(music).getByTestId("person-music-more");
    expect(more.getAttribute("href")).toBe("https://wavlake.com/ainsley-costello");
    expect(more.getAttribute("target")).toBe("_blank");
  });

  it("prefers the person's own native tracks over Wavlake's when they have both", async () => {
    ainsley();
    recentByKindsMock.mockResolvedValue([
      { id: "n1", kind: 31337, pubkey: AINSLEY, created_at: NOW - 10, sig: "s", content: "", tags: [["d", "n1"], ["title", "Native Song"], ["media", "https://cdn/native.mp3"]] } as NostrEvent,
    ]);
    findWavlakeArtistMock.mockResolvedValue({ id: "3dac722c", name: "Ainsley Costello", url: "https://wavlake.com/ainsley-costello", artistNpub: "" });
    render(<KnowledgePanel query="Ainsley Costello" pov="nosfabrica" />);
    const music = await screen.findByTestId("person-music");
    expect(music).toHaveTextContent("Native Song");
    expect(music).not.toHaveTextContent("Wavlake");
    expect(within(music).getByTestId("person-music-more").getAttribute("href")).toBe("/p/npub1ainsley");
  });
});

// The lightbox is where a panel video plays full-size; spy on its opener.
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/share/Lightbox")>()),
  useLightbox: () => openLightboxMock,
}));
// Fountain's page for a podcast link in one of their notes.
const fountainItemFetchMock = vi.fn<(url: string) => Promise<import("@/lib/fountain").FountainItem | null>>(() => Promise.resolve(null));
vi.mock("@/lib/fountain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fountain")>()),
  fetchFountainItem: (url: string) => fountainItemFetchMock(url),
}));

// Benjamin, over TheGrinder (who streams most nights): when someone is live,
// the panel should lead with the stream, thumbnail and all, playable there.
describe("the person panel's live stream", () => {
  const GRINDER = "6".repeat(64);
  const SHOSHO = "f".repeat(64);
  const grinder = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: GRINDER, npub: "npub1grinder", name: "TheGrinder", wotRank: 0.9, wotFollowers: 3900 }]);
  const stream = (id: string, status: string, over: Partial<{ streaming: string; created: number; starts: number; viewers: string }> = {}): NostrEvent =>
    ({
      id,
      kind: 30311,
      pubkey: SHOSHO, // Shosho hosts it; TheGrinder is the host in a p tag
      created_at: over.created ?? NOW - 600,
      sig: "s",
      content: "",
      tags: [
        ["d", id],
        ["title", "Just another Wednesday… 🔞"],
        ["image", "https://i.nostr.build/Vb6byoSaEEJbqqbs.png"],
        ["status", status],
        ["starts", String(over.starts ?? NOW - 3600)],
        ...(over.streaming ? [["streaming", over.streaming]] : []),
        ...(over.viewers ? [["current_participants", over.viewers]] : []),
        ["p", GRINDER, "", "host"],
      ],
    }) as NostrEvent;

  it("leads with the live stream — thumbnail, LIVE, viewers — and plays it in place", async () => {
    grinder();
    liveStreamsMock.mockResolvedValue([
      stream("old", "ended", { created: NOW - 86_400 }),
      stream("now", "live", { streaming: "https://www.twitch.tv/thegrinder", viewers: "42" }),
    ]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);

    const live = await screen.findByTestId("person-live");
    expect(liveStreamsMock).toHaveBeenCalledWith(GRINDER);
    expect(live).toHaveTextContent(/LIVE/i);
    expect(live).toHaveTextContent("Just another Wednesday");
    expect(live).toHaveTextContent(/42 watching/);
    expect(live.querySelector("img")?.getAttribute("src")).toBe("https://i.nostr.build/Vb6byoSaEEJbqqbs.png");
    // The stream leads the panel: everything below the name comes after it.
    const cta = screen.getByTestId("knowledge-panel-profile");
    expect(live.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(live).getByRole("button", { name: /play/i }));
    expect(within(live).getByTestId("person-live-embed").getAttribute("src")).toContain("player.twitch.tv");
    expect(within(live).getByTestId("person-live-open").getAttribute("href")).toMatch(/^\/e\//);
  });

  it("a raw HLS stream starts in our player on the one tap, with no second play button", async () => {
    grinder();
    liveStreamsMock.mockResolvedValue([stream("now", "live", { streaming: "https://shosho.live/hls/thegrinder/index.m3u8", viewers: "19" })]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);
    const live = await screen.findByTestId("person-live");

    fireEvent.click(within(live).getByRole("button", { name: /play live stream/i }));

    // The panel's tap was the intent; the player must not ask again — and it
    // sits inside the card's frame, so it draws none of its own.
    const player = within(live).getByTestId("live-player");
    expect(within(live).queryByTestId("live-play")).toBeNull();
    expect(player.className).not.toMatch(/border|rounded-2xl/);
  });

  // Benjamin, over Joe Martin's dead "Streamed 1mo ago" line: search must never
  // advertise a stream nobody can watch. An ended stream earns a line only
  // when it left a recording — and then it plays here, like a live one.
  it("an ended stream with a recording is a replay that plays in place", async () => {
    grinder();
    liveStreamsMock.mockResolvedValue([
      { ...stream("old", "ended", { created: NOW - 86_400 }), tags: [...stream("old", "ended").tags, ["recording", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]] },
    ]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);

    const replay = await screen.findByTestId("person-live-replay");
    expect(replay).toHaveTextContent(/Replay/i);
    expect(replay).toHaveTextContent("Just another Wednesday");
    expect(replay).toHaveTextContent(/Streamed/);
    expect(replay.querySelector("img")?.getAttribute("src")).toBe("https://i.nostr.build/Vb6byoSaEEJbqqbs.png");

    fireEvent.click(within(replay).getByRole("button", { name: /play/i }));
    expect(within(replay).getByTestId("person-live-embed").getAttribute("src")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(screen.queryByTestId("person-live")).toBeNull();
  });

  it("a replay whose recording no longer answers is not advertised either", async () => {
    grinder();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    liveStreamsMock.mockResolvedValue([
      { ...stream("old", "ended", { created: NOW - 86_400 }), tags: [...stream("old", "ended").tags, ["recording", "https://data.zap.stream/recording/2dbb68f0.m3u8"]] },
    ]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);
    await screen.findByTestId("knowledge-panel-profile");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("person-live-replay")).toBeNull();
  });

  it("a replay whose recording answers is advertised and plays through our player", async () => {
    grinder();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    liveStreamsMock.mockResolvedValue([
      { ...stream("old", "ended", { created: NOW - 86_400 }), tags: [...stream("old", "ended").tags, ["recording", "https://customer-51tz.cloudflarestream.com/abc/manifest/video.m3u8"]] },
    ]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);
    const replay = await screen.findByTestId("person-live-replay");
    fireEvent.click(within(replay).getByRole("button", { name: /play/i }));
    expect(within(replay).getByTestId("live-player")).toBeInTheDocument();
  });

  it("an ended stream with no recording is not advertised at all", async () => {
    grinder();
    liveStreamsMock.mockResolvedValue([stream("old", "ended", { created: NOW - 86_400 })]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);
    await screen.findByTestId("knowledge-panel-profile");
    await vi.waitFor(() => expect(liveStreamsMock).toHaveBeenCalled());
    expect(screen.queryByTestId("person-live")).toBeNull();
    expect(screen.queryByTestId("person-live-replay")).toBeNull();
    expect(screen.queryByTestId("person-live-last")).toBeNull();
  });

  it("a planned stream is announced with its start", async () => {
    grinder();
    liveStreamsMock.mockResolvedValue([stream("next", "planned", { starts: NOW + 2 * 3600, created: NOW - 60 })]);
    render(<KnowledgePanel query="TheGrinder" pov="nosfabrica" />);

    const next = await screen.findByTestId("person-live-upcoming");
    expect(next).toHaveTextContent(/Streams/);
    expect(next).toHaveTextContent("Just another Wednesday");
    expect(next.getAttribute("href")).toMatch(/^\/e\//);
  });
});

// Benjamin, over Rabbit Hole Recap: the panel should carry their latest
// videos and podcasts the way it carries a live stream — real content, newest
// first, playable here, Google's panel for a channel.
describe("the person panel's latest media", () => {
  const RHR = "b".repeat(64);
  const rhr = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: RHR, npub: "npub1rhr", name: "RABBIT HOLE RECAP", wotRank: 0.9, wotFollowers: 7400 }]);
  const video = (id: string, n: number, age: number): NostrEvent =>
    ({ id, kind: 1, pubkey: RHR, created_at: NOW - age, sig: "s", content: `RHR ${n}: EPISODE TITLE WITH nostr:nprofile1qqsabc AND nostr:nprofile1qqsdef https://blossom.primal.net/${id}.mp4`, tags: [["imeta", `url https://blossom.primal.net/${id}.mp4`, "m video/mp4", `image https://blossom.primal.net/${id}.jpg`]] }) as NostrEvent;

  it("lists the newest three videos with poster, clean title and age, and plays one in the lightbox", async () => {
    rhr();
    recentByKindsMock.mockImplementation(async (_pk, kinds) =>
      kinds.includes(1) ? [video("ep418", 418, 30 * 86_400), video("ep421", 421, 86_400), video("ep420", 420, 7 * 86_400), video("ep419", 419, 14 * 86_400), { id: "txt", kind: 1, pubkey: RHR, created_at: NOW - 10, sig: "s", content: "new episode Friday", tags: [] } as NostrEvent] : [],
    );
    render(<KnowledgePanel query="Rabbit Hole Recap" pov="nosfabrica" />);

    const latest = await screen.findByTestId("person-media");
    const rows = within(latest).getAllByTestId(/^person-media-item-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["person-media-item-ep421", "person-media-item-ep420", "person-media-item-ep419"]);
    // The title is the words, not the URLs or the raw nostr: references.
    expect(rows[0]).toHaveTextContent("RHR 421: EPISODE TITLE");
    expect(rows[0]).not.toHaveTextContent(/TITLE WITH/);
    expect(rows[0]).not.toHaveTextContent(/nprofile1|https?:/);
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe("https://blossom.primal.net/ep421.jpg");
    expect(rows[0]).toHaveTextContent(/Video/);
    expect(latest).not.toHaveTextContent("new episode Friday");

    fireEvent.click(within(rows[0]).getByRole("button", { name: /play/i }));
    expect(openLightboxMock).toHaveBeenCalledWith(
      [{ url: "https://blossom.primal.net/ep421.mp4", kind: "video", poster: "https://blossom.primal.net/ep421.jpg" }],
      0,
      expect.objectContaining({ author: expect.objectContaining({ name: "RABBIT HOLE RECAP" }) }),
    );
  });

  it("a note linking a Fountain episode is a podcast row with its artwork, playable here", async () => {
    rhr();
    recentByKindsMock.mockImplementation(async (_pk, kinds) =>
      kinds.includes(1) ? [{ id: "pod1", kind: 1, pubkey: RHR, created_at: NOW - 3600, sig: "s", content: "New pod is up https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3", tags: [] } as NostrEvent] : [],
    );
    fountainItemFetchMock.mockResolvedValue({ kind: "episode", id: "T0iRUdk8nBSfUEPLLcJ3", show: "Rabbit Hole Recap", title: "RHR 422: The Pod", description: null, image: "https://img/pod.jpg", audio: "https://cdn/pod.mp3", url: "https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3" });
    render(<KnowledgePanel query="Rabbit Hole Recap" pov="nosfabrica" />);

    const row = await screen.findByTestId("person-media-item-pod1");
    expect(row).toHaveTextContent("RHR 422: The Pod");
    expect(row).toHaveTextContent(/Podcast/);
    expect(row.querySelector("img")?.getAttribute("src")).toBe("https://img/pod.jpg");
    expect(within(row).getByRole("button", { name: /play/i })).toBeInTheDocument();
  });
});

// A seller's panel sells: their three newest listings for sale, photo, title
// and price, each opening the listing; "All" goes to their profile.
describe("the person panel's Selling row", () => {
  const SELLER = "9".repeat(64);
  const seller = () =>
    suggestMock.mockResolvedValueOnce([{ pubkey: SELLER, npub: "npub1barattolo", name: "Barattolo", wotRank: 0.8, wotFollowers: 300 }]);
  const listing = (id: string, title: string, age: number, extra: string[][] = []): NostrEvent =>
    ({ id, kind: 30402, pubkey: SELLER, created_at: NOW - age, sig: "s", content: title, tags: [["d", id], ["title", title], ["price", "14100", "sats"], ["image", `https://img/${id}.jpg`], ...extra] }) as NostrEvent;

  it("lists the three newest listings for sale with photo, title and price, and links to the seller's profile for the rest", async () => {
    seller();
    recentByKindsMock.mockImplementation(async (_pk, kinds) =>
      kinds.includes(30402)
        ? [listing("l4", "Maglia quattro", 4 * 86_400), listing("l1", "Maglia uno", 86_400), listing("sold", "Venduta", 3600, [["status", "sold"]]), listing("l2", "Maglia due", 2 * 86_400), listing("l3", "Maglia tre", 3 * 86_400)]
        : [],
    );
    render(<KnowledgePanel query="Barattolo" pov="nosfabrica" />);

    const selling = await screen.findByTestId("person-selling");
    const rows = within(selling).getAllByTestId(/^person-selling-item-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["person-selling-item-l1", "person-selling-item-l2", "person-selling-item-l3"]);
    expect(rows[0]).toHaveTextContent("Maglia uno");
    expect(rows[0]).toHaveTextContent("14,100 sats");
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe("https://img/l1.jpg");
    expect(rows[0].getAttribute("href")).toMatch(/^\/e\//);
    expect(selling).not.toHaveTextContent("Venduta");
    expect(within(selling).getByTestId("person-selling-more").getAttribute("href")).toBe("/p/npub1barattolo/selling");
  });

  it("shows one row for a product published in several sizes, saying how many options", async () => {
    seller();
    const shirt = (size: string, age: number): NostrEvent =>
      ({ id: `shirt-${size}`, kind: 30402, pubkey: SELLER, created_at: NOW - age, sig: "s", content: "", tags: [["d", `shirt-${size}`], ["title", `SOUND COFFEE T-SHIRT — ${size} / PEPPER`], ["price", "35", "USD"], ["image", "https://img/shirt.jpg"]] }) as NostrEvent;
    recentByKindsMock.mockImplementation(async (_pk, kinds) =>
      kinds.includes(30402) ? [shirt("XXL", 3600), shirt("XL", 7200), shirt("SMALL", 9000), listing("bag", "SOUND COFFEE", 86_400)] : [],
    );
    render(<KnowledgePanel query="Barattolo" pov="nosfabrica" />);
    const selling = await screen.findByTestId("person-selling");
    const rows = within(selling).getAllByTestId(/^person-selling-item-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("SOUND COFFEE T-SHIRT");
    expect(rows[0]).not.toHaveTextContent("XXL");
    expect(rows[0]).toHaveTextContent("3 options");
    expect(rows[1]).toHaveTextContent("SOUND COFFEE");
  });

  it("has no Selling row for someone with nothing for sale", async () => {
    seller();
    render(<KnowledgePanel query="Barattolo" pov="nosfabrica" />);
    await screen.findByTestId("knowledge-panel-profile");
    await vi.waitFor(() => expect(recentByKindsMock).toHaveBeenCalled());
    expect(screen.queryByTestId("person-selling")).toBeNull();
  });
});
