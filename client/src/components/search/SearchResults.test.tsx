// @vitest-environment jsdom
/**
 * The results half of the Google-anatomy search page: owns the stream
 * lifecycle (a query/tab/POV change cancels and restarts), the vertical tabs,
 * and per-kind result rendering. The seam (services/search) is mocked — its
 * own suite covers the wire; these tests cover what a searcher sees.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot } from "@/services/search";

const streamMock = vi.fn();
const cancelMock = vi.fn();
const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
// Every stream registered, with its callback. The KnowledgePanel's topic
// probe (#query) rides the same mock — tests target the MAIN stream.
let allStreams: { query: string; cb: (s: SearchSnapshot) => void }[] = [];
const mainStreamCalls = () => streamMock.mock.calls.filter(([q]) => !String(q).startsWith("#"));

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (...args: unknown[]) => {
      allStreams.push({ query: args[0] as string, cb: args[2] as (s: SearchSnapshot) => void });
      streamMock(args[0], args[1]);
      return cancelMock;
    },
    suggestProfiles: (...args: unknown[]) => suggestMock(...(args as [])),
  };
});

// The relay expresses rank as ORDER only — per-author scores come from the
// shared house-influence cache. Faked here so cards can prove they use it.
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.85);
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
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
  // The most recent MAIN stream (the panel's #topic probe is not it).
  const main = [...allStreams].reverse().find((c) => !c.query.startsWith("#"))!;
  main.cb({ hits: [], eose: false, timeMs: null, error: null, ...partial });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(screen.getAllByText("Android")).toHaveLength(1);
    // Get it → the app's own site.
    expect(screen.getByTestId("app-get-app1").getAttribute("href")).toBe("https://poster.place");
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
