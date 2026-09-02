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
let lastOnSnapshot: ((s: SearchSnapshot) => void) | null = null;

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (...args: unknown[]) => {
      lastOnSnapshot = args[2] as (s: SearchSnapshot) => void;
      streamMock(args[0], args[1]);
      return cancelMock;
    },
    suggestProfiles: (...args: unknown[]) => suggestMock(...(args as [])),
  };
});

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
  lastOnSnapshot!({ hits: [], eose: false, timeMs: null, error: null, ...partial });
}

beforeEach(() => {
  vi.clearAllMocks();
  lastOnSnapshot = null;
  window.history.replaceState({}, "", "/?q=jack");
});

describe("SearchResults", () => {
  it("streams people into profile cards, skeleton first, count line at EOSE", async () => {
    render(<SearchResults query="jack" pov="nosfabrica" />);

    // The stream starts for the default tab with the submitted query.
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(streamMock.mock.calls[0][0]).toBe("jack");
    expect(streamMock.mock.calls[0][1]).toMatchObject({ tab: "everything", pov: "nosfabrica" });

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
    render(<SearchResults query="jack" pov="nosfabrica" />);
    expect(streamMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("search-tab-notes"));
    expect(cancelMock).toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(streamMock.mock.calls[1][1]).toMatchObject({ tab: "notes" });
    // The tab lands in the URL so results deep-link.
    expect(new URLSearchParams(window.location.search).get("t")).toBe("notes");
  });

  it("renders all eight verticals as tabs", () => {
    render(<SearchResults query="jack" pov="nosfabrica" />);
    for (const t of ["everything", "people", "notes", "articles", "media", "code", "live", "lists"]) {
      expect(screen.getByTestId(`search-tab-${t}`)).toBeInTheDocument();
    }
  });

  it("renders note hits as note cards with the hydrated author shown", async () => {
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
    render(<SearchResults query="mining" pov="nosfabrica" />);
    const article = ev("a1", 30023, "d".repeat(64), "long form body", [
      ["d", "my-article"],
      ["title", "The State of Mining"],
    ]);
    emit({ hits: [{ event: article, author: author(article.pubkey, "dave"), rank: null }], eose: true, timeMs: 300 });
    expect(await screen.findByText("The State of Mining")).toBeInTheDocument();
  });

  it("renders a live event with its status pill and title", async () => {
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

  it("renders a git repo with name and description", async () => {
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

  it("Rank as… accepts an npub and writes the hex observer", async () => {
    const rewrite = vi.fn();
    render(<SearchResults query="jack" pov="nosfabrica" onQueryRewrite={rewrite} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));

    // An npub in the field → its hex form on the wire.
    const { nip19 } = await import("nostr-tools");
    const hex = "7".repeat(64);
    const npub = nip19.npubEncode(hex);
    const input = screen.getByTestId("filter-rank-as");
    fireEvent.change(input, { target: { value: npub } });
    fireEvent.click(screen.getByTestId("filter-rank-as-apply"));
    expect(rewrite).toHaveBeenLastCalledWith(`jack observer:${hex}`);
  });

  it("the panel reads current filter state back from the query", () => {
    render(<SearchResults query="btc sort:rank include:spam" pov="nosfabrica" onQueryRewrite={vi.fn()} />);
    fireEvent.click(screen.getByTestId("search-filters-toggle"));
    expect((screen.getByTestId("filter-sort") as HTMLSelectElement).value).toBe("rank");
    expect((screen.getByTestId("filter-spam") as HTMLInputElement).checked).toBe(true);
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
    render(<SearchResults query="jack" pov="nosfabrica" />);
    emit({ error: "auth-required: name a lens" });
    expect(await screen.findByTestId("search-error")).toHaveTextContent("auth-required");
  });

  it("says so plainly when a search finds nothing", async () => {
    render(<SearchResults query="zzz" pov="nosfabrica" />);
    emit({ hits: [], eose: true, timeMs: 100 });
    expect(await screen.findByTestId("container-no-results")).toBeInTheDocument();
  });
});
