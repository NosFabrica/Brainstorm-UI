// @vitest-environment jsdom
/**
 * Browse is a tab with no words (?t=notes). Its filters must work like any
 * search's — Google's tools work for everyone, signed in or not — and live
 * in the URL so Back, reload and a shared link keep them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // The page asks for hits now (it seeds the People section with them); the
    // fixtures are still people, so wrap each in the kind-0 it arrived as.
    suggestProfileHits: async (...args: unknown[]) => {
      const people = (await suggestMock(...args)) as { pubkey: string }[];
      return (people ?? []).map((author) => ({
        event: { id: `k0-${author.pubkey}`, kind: 0, pubkey: author.pubkey, tags: [], content: "{}", created_at: 1, sig: "s" },
        author,
        rank: null,
      }));
    },
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
// The faces the box's pills draw. The real one asks the search relay under `include:spam` and
// the person's own write relays at once; here it answers from the same map as everything else.
vi.mock("@/services/searchFaces", () => ({
  fetchPillProfiles: async (pks: string[]) =>
    new Map(
      pks
        .filter((pk) => knownProfiles.has(pk))
        .map((pk) => {
          const p = knownProfiles.get(pk)!;
          return [pk, { pubkey: pk, npub: "", displayName: p.display_name, name: p.name, picture: p.picture, wotRank: null, wotFollowers: null }];
        }),
    ),
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
    // The words stay empty: browsing, not searching for a token — and the panel's token
    // rides the URL's `f`, never the box.
    expect(boxValue()).toBe("");
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
/**
 * Type into the box. It is a contenteditable now (the grammar's tokens draw as pills there),
 * so a value set plus an `input` is one keystroke — `fireEvent.change` means nothing to it.
 */
function typeInBox(text: string): HTMLElement & { value: string } {
  const box = screen.getByTestId("input-home-search") as HTMLElement & { value: string };
  box.value = text;
  fireEvent.input(box);
  return box;
}
const boxValue = () => (screen.getByTestId("input-home-search") as HTMLElement & { value: string }).value;

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
    expect(boxValue()).toBe("liverpool");
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
    // The VALUE is the grammar — the key is in it. What is DRAWN is the person.
    expect(boxValue()).toBe(`from:${npub}`);
    expect(screen.getByTestId("form-home-search")).not.toHaveTextContent("npub1");
    // The Music tab adds its own newest-first order after the scope.
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub}`))).toBe(true));
  });

  it("words typed beside the chip search within that person's posts", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    typeInBox(`from:${npub} alone in `);
    expect(boxValue()).toBe(`from:${npub} alone in `); // the trailing space survives
    typeInBox(`from:${npub} alone in valentine`);
    fireEvent.submit(screen.getByTestId("form-home-search"));
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub} alone in valentine`))).toBe(true));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${npub} alone in valentine`);
    expect(boxValue()).toBe(`from:${npub} alone in valentine`);
    expect(screen.getByTestId("search-scope-chip")).toHaveTextContent("Joe Martin");
    // Still the person, never the key.
    expect(screen.getByTestId("form-home-search")).not.toHaveTextContent("npub1");
  });

  it("Enter in the box runs the scoped words, without relying on the form's implicit submit", async () => {
    render(<Landing />);
    await screen.findByTestId("search-scope-chip");
    const box = typeInBox(`from:${npub} checkmate`);
    // A soft keyboard's action key and a desktop Return both arrive as an inserted break.
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent(box, new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
    await waitFor(() => expect(mainStreamCalls().some(([q]) => String(q).startsWith(`from:${npub} checkmate`))).toBe(true));
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${npub} checkmate`);
  });

  it("the chip's X drops the scope and leaves an empty box", async () => {
    render(<Landing />);
    // The pill re-paints in place when the profile lands, so the × is re-made — take it
    // after the name has settled, not before.
    await waitFor(() => expect(screen.getByTestId("search-scope-chip")).toHaveTextContent("Joe Martin"));
    fireEvent.mouseDown(screen.getByTestId("search-scope-remove"));
    await waitFor(() => expect(screen.queryByTestId("search-scope-chip")).toBeNull());
    expect(boxValue()).toBe("");
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
    typeInBox(`from:${npub} guitar`);
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

// One hashtag and nothing else is a topic; anything more is a search carrying a tag filter.
// `handleSearch` had its own copy of the rule that squashed the whole query into one slug, so
// the combined grammar was unreachable from this box however well the parser understood it.
describe("a # query that is more than one tag", () => {
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    window.history.replaceState({}, "", "/");
  });

  it("searches rather than leaving for a squashed topic page", async () => {
    render(<Landing />);
    typeInBox("#nostr bitcoin");
    fireEvent.submit(screen.getByTestId("form-home-search"));
    // `mainStreamCalls` filters `#`-leading queries as knowledge-panel probes, which is what
    // this query looks like to it — so read every stream the page opened.
    await waitFor(() => expect(streamMock.mock.calls.some(([q]) => q === "#nostr bitcoin")).toBe(true));
    expect(window.location.pathname).toBe("/");
  });

  it("one tag alone is still the topic page", async () => {
    render(<Landing />);
    typeInBox("#nostr");
    fireEvent.submit(screen.getByTestId("form-home-search"));
    await waitFor(() => expect(window.location.pathname).toBe("/t/nostr"));
  });

  // A filter is not a search anybody would want offered back to them in a list.
  it("a wordless filter query stays out of recent searches", async () => {
    render(<Landing />);
    typeInBox("since:2026-01-02");
    fireEvent.submit(screen.getByTestId("form-home-search"));
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    expect(getRecentItems().some((r) => r.type === "query" && r.q.includes("since:"))).toBe(false);
  });
});

describe("typing in the home search", () => {
  const typeSlowly = (word: string) => {
    for (let i = 1; i <= word.length; i++) {
      typeInBox(word.slice(0, i));
      act(() => { vi.advanceTimersByTime(200); });
    }
  };
  const signalOf = (call: number) => (suggestMock.mock.calls[call][2] as { signal?: AbortSignal } | undefined)?.signal;

  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    suggestMock.mockReset();
    suggestMock.mockImplementation(() => new Promise(() => {}));
    window.history.replaceState({}, "", "/");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for suggestions once, for the whole word, when typing pauses", () => {
    render(<Landing />);
    typeSlowly("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(suggestMock.mock.calls[0][0]).toBe("vitor");
  });

  it("cancels a suggestion request that's under way when the next key lands", () => {
    render(<Landing />);
    typeInBox("vito");
    act(() => { vi.advanceTimersByTime(400); });
    expect(signalOf(0)?.aborted).toBe(false);
    typeInBox("vitor");
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the page goes away", () => {
    const { unmount } = render(<Landing />);
    typeInBox("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  const dropdownShowing = () =>
    !!(screen.queryByTestId("home-suggestions-loading") || screen.queryByTestId("home-suggestion-0"));

  it("sends nothing when the dropdown is closed during the pause, and it stays closed", () => {
    render(<Landing />);
    const input = typeInBox("vitor");
    fireEvent.keyDown(input, { key: "Escape" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdownShowing()).toBe(false);
  });

  it("cancels a request when the dropdown closes, and its partial answer doesn't reopen it", async () => {
    suggestMock.mockImplementation((...args: unknown[]) => new Promise((resolve) => {
      (args[2] as { signal: AbortSignal }).signal.addEventListener("abort", () =>
        resolve([{ pubkey: "c".repeat(64), npub: "npub1partial", name: "partial" }]));
    }));
    render(<Landing />);
    const input = typeInBox("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.keyDown(input, { key: "Escape" });
    await act(async () => {});
    expect(signalOf(0)?.aborted).toBe(true);
    expect(dropdownShowing()).toBe(false);
  });

  // `doi:` listed people called "doi"; `doi:10.1000` listed whoever had commented on it.
  it("asks for nobody while a filter is typed, and still does for a from: or observer: name", () => {
    render(<Landing />);
    for (const q of ["doi:", "doi:10.1000", "sort:rec", "label:en", "from:", "observer:", "jack kind:20"]) {
      typeSlowly(q);
      act(() => { vi.advanceTimersByTime(400); });
    }
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdownShowing()).toBe(false);
    typeSlowly("from:ja");
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("ja");
    typeSlowly("observer:vi");
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("vi");
  });

  it("searches right away on Enter, without waiting for the pause", () => {
    render(<Landing />);
    typeInBox("vitor");
    act(() => { fireEvent.submit(screen.getByTestId("form-home-search")); });
    expect(mainStreamCalls().some(([q]) => q === "vitor")).toBe(true);
  });
});

// Benjamin (2026-09-23): Shop replaces Articles in the Browse row too — the
// row is the tab set for keyword-less browsing, and Shop earned the tab strip.
describe("the Browse row under the box", () => {
  it("offers Shop where Articles was, after Media", async () => {
    window.history.replaceState({}, "", "/");
    render(<Landing />);
    const input = screen.getByTestId("input-home-search");
    // The panel opens for an engaged, focused, empty box — a tap, then focus.
    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    const chips = await screen.findByTestId("browse-chips");
    const order = [...chips.querySelectorAll('[data-testid^="browse-"]')].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["browse-people", "browse-notes", "browse-media", "browse-shop", "browse-apps", "browse-events", "browse-live", "browse-lists"]);
  });
});
