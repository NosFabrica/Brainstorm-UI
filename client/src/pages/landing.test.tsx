// @vitest-environment jsdom
/**
 * Browse is a tab with no words (?t=notes). Its filters must work like any
 * search's — Google's tools work for everyone, signed in or not — and live
 * in the URL so Back, reload and a shared link keep them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SearchSnapshot } from "@/services/search";
import { nip19 } from "nostr-tools";
import { getRecentItems } from "@/lib/recentSearches";

const streamMock = vi.fn();
// People the typeahead offers; a test that needs a dropdown seeds one.
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
let allStreams: { query: string; params: { tab?: string; limit?: number }; cb: (s: SearchSnapshot) => void }[] = [];
const isPanelProbe = (q: string, p?: { tab?: string; limit?: number }) =>
  q.startsWith("#") || (p?.tab === "apps" && p?.limit === 6) || (p?.tab === "events" && p?.limit === 60);
const mainStreamCalls = () => streamMock.mock.calls.filter(([q, p]) => !isPanelProbe(String(q), p as { tab?: string; limit?: number }));
vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (...args: unknown[]) => {
      allStreams.push({ query: args[0] as string, params: args[1] as { tab?: string; limit?: number }, cb: args[2] as (s: SearchSnapshot) => void });
      streamMock(args[0], args[1]);
      return () => {};
    },
    suggestProfiles: (...args: unknown[]) => suggestMock(...args),
    fetchRepoCounts: async () => ({ issues: 0, patches: 0 }),
  };
});
// Profiles a test wants the page to know, by pubkey.
const knownProfiles = new Map<string, { name?: string; display_name?: string; picture?: string }>();
vi.mock("@/services/nostr", () => ({
  fetchProfile: async () => null,
  fetchRecentByKinds: async () => [],
  fetchLiveStreams: async () => [],
  fetchProfileMap: async (pks: string[]) => new Map(pks.filter((pk) => knownProfiles.has(pk)).map((pk) => [pk, knownProfiles.get(pk)!])),
  fetchEventsByIds: async () => [],
  fetchAddressableEvents: async () => new Map(),
}));
vi.mock("@/services/api", () => ({ apiClient: new Proxy({}, { get: () => async () => null }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.85 }));
vi.mock("@/hooks/useAppEndorsements", () => ({ useAppEndorsements: () => null }));
vi.mock("@/hooks/useMyFollows", () => ({ useMyFollows: () => ({ follows: new Set<string>(), ready: true, signedIn: false }) }));
vi.mock("@/hooks/usePersonEndorsements", () => ({ usePersonEndorsements: () => null }));
vi.mock("@/hooks/useAuthorFlags", () => ({ useAuthorFlags: () => () => false }));
vi.mock("@/hooks/useNetworkReach", () => ({ useNetworkReach: () => ({ direct: new Set(), friends: new Set(), ready: true }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));
vi.mock("@/lib/wavlake", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/wavlake")>()), searchWavlakeTracks: async () => [], searchWavlake: async () => ({ artists: [], albums: [], songs: [] }), fetchWavlakeTrending: async () => [] }));
vi.mock("@/components/feed/HomeFeed", () => ({ HomeFeed: () => null }));
vi.mock("@/components/FinishSetupBanner", () => ({ FinishSetupBanner: () => null }));
vi.mock("@/components/AccountCards", () => ({ AccountCards: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

import Landing from "./landing";

const fParam = () => new URLSearchParams(window.location.search).get("f");

describe("browsing a vertical with filters, signed out", () => {
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    window.history.replaceState({}, "", "/?t=notes");
  });

  it("a filter re-runs the browse with it, keeps showing it, and lands in the URL", async () => {
    render(<Landing />);
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    const before = mainStreamCalls().length;
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    fireEvent.click(screen.getByTestId("filters-advanced-toggle"));
    fireEvent.click(screen.getByTestId("filter-spam"));
    await waitFor(() => expect(fParam()).toBe("include:spam"));
    expect(new URLSearchParams(window.location.search).get("t")).toBe("notes");
    expect(screen.getByTestId("filter-spam")).toBeChecked();
    expect(screen.getByTestId("filters-active-count")).toHaveTextContent("1");
    // The browse re-ran for the same tab with the token on the wire.
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(before));
    expect((mainStreamCalls().at(-1)![1] as { tab?: string }).tab).toBe("notes");
    // The words stay empty: browsing, not searching for a token.
    expect(screen.getByTestId("form-home-search").querySelector("input")).toHaveValue("");
  });

  it("a shared browse link restores its filter", async () => {
    window.history.replaceState({}, "", "/?t=notes&f=include%3Aspam");
    render(<Landing />);
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    // Advanced opens itself when one of its controls is set by the link.
    expect(screen.getByTestId("filter-spam")).toBeChecked();
    expect(screen.getByTestId("filters-active-count")).toHaveTextContent("1");
  });

  it("clearing the last filter returns to the plain browse link", async () => {
    window.history.replaceState({}, "", "/?t=notes&f=include%3Aspam");
    render(<Landing />);
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    fireEvent.click(screen.getByTestId("filter-spam"));
    await waitFor(() => expect(fParam()).toBeNull());
    expect(window.location.search).toBe("?t=notes");
    expect(screen.queryByTestId("filters-active-count")).toBeNull();
  });
});

// Benjamin, over the panel's related topics (#texas, #restaurants…): "nothing
// happens when users click on these". They are in-app links to /?q=…, which
// change the URL without a popstate; the results must follow the URL anyway.
describe("an in-app link to another search", () => {
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    window.history.replaceState({}, "", "/?q=austin");
  });

  it("re-runs the search for the words in the new URL", async () => {
    render(<Landing />);
    await waitFor(() => expect(mainStreamCalls().some(([q]) => q === "austin")).toBe(true));
    // What a wouter <Link href="/?q=liverpool"> does.
    window.history.pushState({}, "", "/?q=liverpool");
    await waitFor(() => expect(mainStreamCalls().some(([q]) => q === "liverpool")).toBe(true));
    expect((screen.getByTestId("input-home-search") as HTMLInputElement).value).toBe("liverpool");
  });
});

// A search scoped to one person — the public profile's "View all" — shows the
// person in the box, never the raw from:npub… token (Benjamin, 2026-09-05:
// "we should never show the raw scope"). Words typed beside the chip search
// within their posts; the chip's X drops the scope.
describe("a search scoped to a person shows them in the box, never the raw key", () => {
  const JOE = "e".repeat(64);
  const npub = nip19.npubEncode(JOE);
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    knownProfiles.set(JOE, { display_name: "Joe Martin", picture: "https://img/joe.jpg" });
    window.history.replaceState({}, "", `/?q=from%3A${npub}&t=music`);
  });

  it("the box shows the person as a chip with empty words, and the wire gets the scope", async () => {
    render(<Landing />);
    const chip = await screen.findByTestId("search-scope-chip");
    await waitFor(() => expect(chip).toHaveTextContent("Joe Martin"));
    expect((screen.getByTestId("input-home-search") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("form-home-search")).not.toHaveTextContent("npub1");
    // The Music tab adds its own newest-first order after the scope.
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub}`))).toBe(true));
  });

  it("words typed beside the chip search within that person's posts", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    const input = screen.getByTestId("input-home-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alone in " } });
    expect(input.value).toBe("alone in "); // the space survives — the words are typed, not re-derived
    fireEvent.change(input, { target: { value: "alone in valentine" } });
    fireEvent.submit(screen.getByTestId("form-home-search"));
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub} alone in valentine`))).toBe(true));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${npub} alone in valentine`);
    expect(input.value).toBe("alone in valentine");
    expect(screen.getByTestId("search-scope-chip")).toHaveTextContent("Joe Martin");
  });

  it("Enter in the box runs the scoped words, without relying on the form's implicit submit", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    const input = screen.getByTestId("input-home-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "checkmate" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub} checkmate`))).toBe(true));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${npub} checkmate`);
  });

  it("the chip's X drops the scope and leaves an empty box", async () => {
    render(<Landing />);
    fireEvent.click(await screen.findByTestId("search-scope-remove"));
    expect(screen.queryByTestId("search-scope-chip")).toBeNull();
    expect((screen.getByTestId("input-home-search") as HTMLInputElement).value).toBe("");
    expect(new URLSearchParams(window.location.search).get("q")).toBeNull();
  });

  it("a scoped search never lands in recents as a raw key", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    expect(getRecentItems().some((r) => r.type === "query" && r.q.includes("from:"))).toBe(false);
  });
});

// The scoped box says what typing does ON THIS TAB, with the person's name
// (Facebook: "Search Sam's profile"; YouTube's channel search) and — since the
// user just tapped "search" — the cursor is already in it (X's profile search).
describe("the scoped box names the tab and the person, and is ready to type", () => {
  const JOE = "e".repeat(64);
  const npub = nip19.npubEncode(JOE);
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    suggestMock.mockReset();
    suggestMock.mockResolvedValue([]);
    knownProfiles.set(JOE, { display_name: "Joe Martin", picture: "https://img/joe.jpg" });
    window.history.replaceState({}, "", `/?q=from%3A${npub}&t=music`);
  });

  it("the empty box names the tab's things and the person, and follows a tab change", async () => {
    render(<Landing />);
    await waitFor(() => expect(screen.getByTestId("text-scope-placeholder")).toHaveTextContent("Search Joe Martin's music"));
    fireEvent.click(screen.getByTestId("search-tab-notes"));
    await waitFor(() => expect(screen.getByTestId("text-scope-placeholder")).toHaveTextContent("Search Joe Martin's notes"));
    fireEvent.click(screen.getByTestId("search-tab-everything"));
    await waitFor(() => expect(screen.getByTestId("text-scope-placeholder")).toHaveTextContent("Search everything from Joe Martin"));
    expect(screen.getByTestId("form-home-search")).not.toHaveTextContent("npub1");
  });

  it("arriving scoped, the cursor is already in the box", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("input-home-search")));
  });

  it("the typeahead's footer names the person, never the key", async () => {
    const GAL = "f".repeat(64);
    suggestMock.mockResolvedValue([{ pubkey: GAL, npub: nip19.npubEncode(GAL), name: "Guitar Gal", wotRank: null, wotFollowers: null }]);
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    fireEvent.change(screen.getByTestId("input-home-search"), { target: { value: "guitar" } });
    const footer = await screen.findByTestId("home-suggestion-see-all", {}, { timeout: 3000 });
    await waitFor(() => expect(footer).toHaveTextContent('See all results for "guitar" from Joe Martin'));
    expect(footer).not.toHaveTextContent("npub1");
  });
});

// Once a search has run, the box, the mark and the account sit in a band
// pinned to the top of the page. It was painted at all times and only as wide
// as the results column, so at the top of a dark page it read as a flat
// rectangle laid over the aurora, with visible left and right edges
// (Benjamin, 2026-09-09: "it doesn't blend in well to start the page"). The
// band is see-through until the reader scrolls under it, like every other
// header in the app.
describe("the search band as the page scrolls", () => {
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    window.history.replaceState({}, "", "/?q=austin");
  });

  it("is see-through at the top of the page and frosts once the reader scrolls under it", () => {
    render(<Landing />);
    const backdrop = screen.getByTestId("search-band-backdrop");
    expect(backdrop).toHaveAttribute("data-frosted", "false");

    Object.defineProperty(window, "scrollY", { value: 240, configurable: true });
    fireEvent.scroll(window);
    expect(backdrop).toHaveAttribute("data-frosted", "true");

    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    fireEvent.scroll(window);
    expect(backdrop).toHaveAttribute("data-frosted", "false");
  });
});

