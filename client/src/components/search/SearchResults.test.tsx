// @vitest-environment jsdom
/**
 * The results half of the Google-anatomy search page: owns the stream
 * lifecycle (a query/tab/POV change cancels and restarts), the vertical tabs,
 * and per-kind result rendering. The seam (services/search) is mocked — its
 * own suite covers the wire; these tests cover what a searcher sees.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot } from "@/services/search";

const streamMock = vi.fn();
const cancelMock = vi.fn();
const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
// Every stream registered, with its callback. The KnowledgePanel's probes
// (the #query topic probe and the limit-6 apps probe) ride the same mock —
// tests target the MAIN stream.
const isPanelProbe = (q: string, p?: { tab?: string; limit?: number }) =>
  q.startsWith("#") || (p?.tab === "apps" && p?.limit === 6);
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
  fetchProfileMap: vi.fn(() => Promise.resolve(profileMapMock)),
}));

// The relay expresses rank as ORDER only — per-author scores come from the
// shared house-influence cache. Faked here so cards can prove they use it.
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.85);
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

  it("renders all nine verticals as tabs — Apps and Repos, no Code & git", () => {
    render(<SearchResults query="jack" pov="nosfabrica" />);
    for (const t of ["everything", "people", "notes", "articles", "media", "apps", "repos", "live", "lists"]) {
      expect(screen.getByTestId(`search-tab-${t}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("search-tab-code")).toBeNull();
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
    const getIt = screen.getByTestId(/^app-get-/);
    expect(getIt.getAttribute("href")).toMatch(/^https:\/\/zapstore\.dev\/apps\/naddr1/);
    expect(getIt.querySelector("img")?.getAttribute("src")).toContain("zapstore.dev");
  });

  // Google's "shared endorsements", on Nostr: what the network said about an
  // app, attached to its card — the faces of trusted reviewers, the numbers
  // (reviews, zaps, curated collections), and one quote from the most trusted
  // voice. Nostr has no star rating (probed: 0 of 845 app comments carry one),
  // so the tier ring is the star and WHO said it decides what gets quoted.
  describe("app card endorsements", () => {
    const VITOR = "1".repeat(64);
    const FAN = "2".repeat(64);
    const listing = () =>
      ev("app1", 32267, "9".repeat(64), "", [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"], ["summary", "The all-in-one Nostr client"]]);
    const review = (id: string, pubkey: string, text: string, at: number) => ({ id, pubkey, text, at, version: "1.13.1", k: "32267", kind: 1111 });
    const withSignals = (): Endorsements => ({
      address: "32267:" + "9".repeat(64) + ":com.vitorpamplona.amethyst",
      reviews: [review("r1", FAN, "Perfect APP! Thanks!", 200), review("r2", VITOR, "love Amethyst. is my daily driver", 100)],
      reviewCount: 14,
      zaps: [],
      zapCount: 101,
      collectionCount: 46,
    });

    it("attaches trusted faces, the numbers, and the most trusted reviewer's words", async () => {
      setUrlTab("apps");
      endorsementsMock.mockReturnValue(withSignals());
      // Vitor is verified (0.85 default); the fan is unrated — so Vitor leads
      // and Vitor is quoted, although the fan's review is newer.
      scoreOfMock.mockImplementation((pk) => (pk === FAN ? null : 0.85));
      profileMapMock.set(VITOR, { name: "vitor" });
      render(<SearchResults query="amethyst" pov="nosfabrica" />);
      const app = listing();
      emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });

      const line = await screen.findByTestId("app-endorsements-app1");
      await within(line).findByText(/Reviewed by vitor & 13 others/);
      expect(line).toHaveTextContent("101");
      expect(line).toHaveTextContent("in 46 collections");
      // A results card wants faces and numbers, not a page of zaps.
      expect(endorsementsMock).toHaveBeenCalledWith("32267:" + "9".repeat(64) + ":com.vitorpamplona.amethyst", {
        publisher: "9".repeat(64),
        reviewLimit: 8,
        zapLimit: 0,
      });
      // Faces wear tier rings, trusted first.
      const faces = [...line.querySelectorAll("[data-face]")];
      expect(faces[0].getAttribute("data-face")).toBe(VITOR);
      expect(faces.some((el) => el.className.includes("shadow-[0_0_0"))).toBe(true);
      // The quote is the first sentence of the trusted review.
      expect(screen.getByTestId("app-endorsement-quote-app1")).toHaveTextContent("love Amethyst.");
      expect(screen.getByTestId("app-endorsement-quote-app1")).toHaveTextContent("vitor");
    });

    it("never quotes someone outside the web of trust", async () => {
      setUrlTab("apps");
      const e = withSignals();
      e.reviews = [review("r1", FAN, "Perfect APP! Thanks!", 200)];
      endorsementsMock.mockReturnValue(e);
      scoreOfMock.mockImplementation(() => null);
      render(<SearchResults query="amethyst" pov="nosfabrica" />);
      const app = listing();
      emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });
      const line = await screen.findByTestId("app-endorsements-app1");
      expect(line).toHaveTextContent("in 46 collections");
      expect(screen.queryByTestId("app-endorsement-quote-app1")).toBeNull();
    });

    // Live on the Amethyst card: the top verified review was "👍". An emoji is
    // an endorsement, not a quote — the next trusted voice with words speaks.
    it("quotes the most trusted voice that wrote words, skipping a bare emoji", async () => {
      setUrlTab("apps");
      const e = withSignals();
      e.reviews = [review("r1", VITOR, "👍", 300), review("r2", FAN, "love Amethyst. is my daily driver", 200)];
      endorsementsMock.mockReturnValue(e);
      scoreOfMock.mockImplementation(() => 0.85);
      profileMapMock.set(VITOR, { name: "capybara" });
      profileMapMock.set(FAN, { name: "fan\r\n\r\n" });
      render(<SearchResults query="amethyst" pov="nosfabrica" />);
      const app = listing();
      emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });
      const quote = await screen.findByTestId("app-endorsement-quote-app1");
      expect(quote).toHaveTextContent("love Amethyst.");
      expect(quote).toHaveTextContent("— fan");
      expect(quote.textContent).not.toMatch(/\r|\n/);
    });

    it("someone you follow leads even when the score says otherwise", async () => {
      setUrlTab("apps");
      endorsementsMock.mockReturnValue(withSignals());
      scoreOfMock.mockImplementation((pk) => (pk === FAN ? null : 0.85));
      followsMock = new Set([FAN]);
      profileMapMock.set(FAN, { name: "fan" });
      render(<SearchResults query="amethyst" pov="nosfabrica" />);
      const app = listing();
      emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });
      const line = await screen.findByTestId("app-endorsements-app1");
      await within(line).findByText(/Reviewed by fan/);
      expect(screen.getByTestId("app-endorsement-quote-app1")).toHaveTextContent("Perfect APP! Thanks!");
    });

    it("stays silent when the network has said nothing", async () => {
      setUrlTab("apps");
      endorsementsMock.mockReturnValue({ address: "x", reviews: [], reviewCount: 0, zaps: [], zapCount: 0, collectionCount: 0 });
      render(<SearchResults query="amethyst" pov="nosfabrica" />);
      const app = listing();
      emit({ hits: [{ event: app, author: author(app.pubkey, "Amethyst"), rank: null }], eose: true, timeMs: 200 });
      await screen.findByTestId("app-card-app1");
      expect(screen.queryByTestId("app-endorsements-app1")).toBeNull();
    });
  });

  // People's endorsements on the results page: the flagged chip wherever the
  // network has flagged someone (it rides the overview the ring already
  // fetched — free), and the "Followed by …" line on the first three cards
  // only — one server call each is a price for the top of the page, not for
  // a hundred hits.
  describe("person card endorsements", () => {
    const people = ["1", "2", "3", "4"].map((c) => c.repeat(64));
    const seed = () => {
      setUrlTab("people");
      render(<SearchResults query="jack" pov="nosfabrica" />);
      emit({
        hits: people.map((pk, i) => ({ event: person(`p${i}`, pk, `name${i}`), author: author(pk, `name${i}`), rank: null })),
        eose: true,
        timeMs: 100,
      });
    };

    it("flags a flagged account on any card", async () => {
      flagsMock.mockImplementation((pk) => pk === people[3]);
      seed();
      await screen.findByTestId("result-profile-3");
      expect(screen.getByTestId("person-flagged-3")).toHaveTextContent("Flagged by the network");
      expect(screen.queryByTestId("person-flagged-0")).toBeNull();
    });

    it("shows who follows the top three, and asks nothing for the rest", async () => {
      personEndorsementsMock.mockImplementation((pk) => (pk ? { followedBy: [{ pubkey: "9".repeat(64), score01: 0.7 }], total: 500 } : null));
      seed();
      await screen.findByTestId("result-profile-3");
      expect(screen.getByTestId("person-followed-by-0")).toHaveTextContent("Followed by 500 verified accounts");
      expect(screen.getByTestId("person-followed-by-2")).toBeInTheDocument();
      expect(screen.queryByTestId("person-followed-by-3")).toBeNull();
      const asked = personEndorsementsMock.mock.calls.map((c) => c[0]).filter(Boolean);
      expect(asked).not.toContain(people[3]);
    });
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

  it("collapses recurring events on the Live tab behind a +N chip", async () => {
    setUrlTab("live");
    render(<SearchResults query="liverpool" pov="nosfabrica" />);
    const orange = "6".repeat(64);
    const mk = (id: string, title: string) =>
      ({ event: ev(id, 31923, orange, "", [["d", id], ["title", title]]), author: author(orange, "club"), rank: null });
    emit({
      hits: [mk("m1", "Bitcoin Liverpool Meet"), mk("m2", "Bitcoin Liverpool Meetup"), mk("m3", "Bitcoin Liverpool Meetup")],
      eose: true,
      timeMs: 200,
    });
    await screen.findByTestId("container-search-results");
    expect(screen.getAllByTestId(/^live-card-/)).toHaveLength(1);

    fireEvent.click(screen.getByTestId(/^cluster-expand-/));
    expect(screen.getAllByTestId(/^live-card-/)).toHaveLength(3);
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

  it("the trust floor speaks the user's tier ladder, not raw numbers", () => {
    const rewrite = vi.fn();
    render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={rewrite} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));

    const select = screen.getByTestId("filter-min-tier") as HTMLSelectElement;
    // Default (Simple) ladder: Anyone / Verified only — the user's setting.
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toContain("Anyone");
    expect(labels.some((l) => /Verified/.test(l ?? ""))).toBe(true);

    fireEvent.change(select, { target: { value: "2" } });
    expect(rewrite).toHaveBeenLastCalledWith("bitcoin filter:rank:gte:2");
  });

  it("the detailed ladder setting unlocks the full rung list", () => {
    localStorage.setItem("brainstorm_tier_granularity:anon", "detailed");
    render(<SearchResults query="bitcoin" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    const labels = [...(screen.getByTestId("filter-min-tier") as HTMLSelectElement).options].map(
      (o) => o.textContent,
    );
    expect(labels.some((l) => /Highly verified/.test(l ?? ""))).toBe(true);
    expect(labels.some((l) => /Neutral/.test(l ?? ""))).toBe(true);
  });

  it("the panel reads current filter state back from the query", () => {
    render(
      <SearchResults query="btc sort:rank include:spam filter:rank:gte:2" pov="nosfabrica" onQueryRewrite={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    expect((screen.getByTestId("filter-sort") as HTMLSelectElement).value).toBe("rank");
    expect((screen.getByTestId("filter-spam") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("filter-min-tier") as HTMLSelectElement).value).toBe("2");
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
