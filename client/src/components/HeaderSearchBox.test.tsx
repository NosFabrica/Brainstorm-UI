// @vitest-environment jsdom
/**
 * The header box is the home page's box: it asks for suggestions once typing pauses, cancels
 * what it no longer needs, draws filters as pills, offers recents and Browse under an empty
 * box, and sends a search to the home results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// People the typeahead offers — `suggestProfileHits` wraps each in the kind-0 it arrived as.
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listingsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  suggestListings: (...args: unknown[]) => listingsMock(...args),
  suggestProfiles: (...args: unknown[]) => suggestMock(...args),
  suggestProfileHits: async (...args: unknown[]) =>
    ((await suggestMock(...args)) as { pubkey: string }[]).map((author) => ({
      event: { id: `k0-${author.pubkey}`, kind: 0, pubkey: author.pubkey, tags: [], content: "{}", created_at: 1, sig: "s" },
      author,
      rank: null,
    })),
}));
vi.mock("@/services/nostr", () => ({ fetchProfile: async () => null, fetchProfileMap: async () => new Map() }));
vi.mock("@/services/searchFaces", () => ({ fetchPillProfiles: async () => new Map() }));
vi.mock("@/services/api", () => ({ apiClient: new Proxy({}, { get: () => async () => null }) }));
const contentMock = vi.fn((_pks: string[]) => new Map<string, unknown>());
vi.mock("@/hooks/usePersonContent", () => ({ usePersonContent: (pks: string[]) => contentMock(pks) }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));

import { HeaderSearchBox } from "./HeaderSearchBox";
import { nip19 } from "nostr-tools";
import { scopedSearchHref } from "@/lib/searchSyntax";
import { clearRecentSearches, pushRecentQuery } from "@/lib/recentSearches";

const input = () => screen.getByTestId("input-home-search") as HTMLElement & { value: string };
const signalOf = (call: number) => (suggestMock.mock.calls[call][2] as { signal?: AbortSignal } | undefined)?.signal;
const dropdown = () => screen.queryByTestId("container-home-suggestions");

/** A keystroke, as the contenteditable field hears one. */
function type(value: string) {
  input().value = value;
  fireEvent.input(input());
}
function typeSlowly(word: string) {
  for (let i = 1; i <= word.length; i++) {
    type(word.slice(0, i));
    act(() => { vi.advanceTimersByTime(200); });
  }
}
const enter = () => fireEvent(input(), new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));

beforeEach(() => {
  suggestMock.mockReset();
  suggestMock.mockImplementation(() => new Promise(() => {}));
  listingsMock.mockReset();
  listingsMock.mockResolvedValue([]);
  contentMock.mockReset();
  contentMock.mockImplementation(() => new Map());
  clearRecentSearches();
  window.history.replaceState({}, "", "/p/somebody");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("typing in the header search", () => {
  it("asks for suggestions once, for the whole word, when typing pauses", () => {
    render(<HeaderSearchBox />);
    typeSlowly("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(suggestMock.mock.calls[0][0]).toBe("vitor");
  });

  it("asks nobody while a filter prefix is typed — `doi:` is not a name", () => {
    render(<HeaderSearchBox />);
    typeSlowly("doi:10.1000");
    typeSlowly("sort:rec");
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("completes a `from:` name with people, and picking one writes the key", async () => {
    const JOE = "e".repeat(64);
    suggestMock.mockResolvedValue([{ pubkey: JOE, npub: nip19.npubEncode(JOE), name: "Joe" }]);
    render(<HeaderSearchBox />);
    type("from:jo");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("jo");
    fireEvent.click(screen.getByTestId("home-suggestion-0"));
    expect(input().value).toContain(`from:${nip19.npubEncode(JOE)}`);
    expect(window.location.pathname).toBe("/p/somebody");
  });

  it("cancels a request that's under way when the next key lands", () => {
    render(<HeaderSearchBox />);
    type("vito");
    act(() => { vi.advanceTimersByTime(400); });
    expect(signalOf(0)?.aborted).toBe(false);
    type("vitor");
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the box goes away", () => {
    const { unmount } = render(<HeaderSearchBox />);
    type("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("sends nothing when the box is closed during the pause, and it stays closed", () => {
    render(<HeaderSearchBox />);
    type("vitor");
    fireEvent.keyDown(input(), { key: "Escape" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("cancels a request when the box closes, and it stays closed", async () => {
    render(<HeaderSearchBox />);
    type("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.keyDown(input(), { key: "Escape" });
    await act(async () => {});
    expect(signalOf(0)?.aborted).toBe(true);
    expect(dropdown()).toBeNull();
  });

  it("a product title under the people opens the listing itself", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([{
      event: { id: "t".repeat(64), kind: 30402, pubkey: "e".repeat(64), tags: [["d", "smiley"], ["title", "Satoshi Smiley T-shirt"], ["price", "21", "USD"]], content: "", created_at: 1, sig: "s" },
      author: null,
      rank: null,
    }]);
    render(<HeaderSearchBox />);
    type("satoshi");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    const row = screen.getByTestId("home-product-suggestion-0");
    expect(row).toHaveTextContent("Satoshi Smiley T-shirt");
    expect(row).toHaveTextContent("$21");
    fireEvent.click(row);
    expect(window.location.pathname).toMatch(/^\/e\/(nevent1|t{64})/);
  });

  it("goes to the results right away on Enter", () => {
    render(<HeaderSearchBox />);
    type("vitor");
    enter();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?q=vitor");
  });

  it("draws a filter as a pill, and Enter searches the text as typed", () => {
    render(<HeaderSearchBox />);
    type("gm since:2026-01-02 ");
    const pill = input().querySelector("[data-token]") as HTMLElement | null;
    expect(pill?.dataset.token).toBe("since:2026-01-02");
    enter();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("gm since:2026-01-02");
  });
});

describe("the empty box", () => {
  const focusBox = () => {
    fireEvent.pointerDown(input());
    fireEvent.focus(input());
  };

  it("offers recent searches, and one re-runs on the results page", () => {
    pushRecentQuery("bitcoin meetups");
    render(<HeaderSearchBox />);
    focusBox();
    const row = screen.getByTestId("home-recent-0");
    expect(row).toHaveTextContent("bitcoin meetups");
    fireEvent.mouseDown(within(row).getByTestId("home-recent-run-0"));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("bitcoin meetups");
  });

  it("offers the Browse row, and a chip opens that vertical", () => {
    render(<HeaderSearchBox />);
    focusBox();
    fireEvent.mouseDown(screen.getByTestId("browse-shop"));
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?t=shop");
  });
});

describe("what a suggested person publishes", () => {
  const STACI = "5".repeat(64);
  const STACI_NPUB = nip19.npubEncode(STACI);
  const shop = { key: "shop", label: "Shop", tab: "shop", liveNow: false };
  beforeEach(() => {
    contentMock.mockImplementation((pks: string[]) => new Map(pks.map((pk) => [pk, pk === STACI ? { chips: [shop] } : undefined])));
    suggestMock.mockResolvedValue([{ pubkey: STACI, npub: STACI_NPUB, name: "Staci" }]);
  });

  it("a suggested person wears chips linking to their scoped search, on a row that is not a button", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    const row = screen.getByTestId("home-suggestion-0");
    expect(row.tagName).toBe("DIV");
    expect(row).toHaveAttribute("role", "option");
    const chip = screen.getByTestId("person-content-chip-shop");
    expect(chip.getAttribute("href")).toBe(scopedSearchHref(STACI, "shop"));
    expect(chip).toHaveAttribute("aria-label", "Staci's shop");
    expect(chip.closest("button")).toBeNull();
  });

  it("picking the person opens their profile", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    fireEvent.click(screen.getByTestId("home-suggestion-0"));
    expect(window.location.pathname).toBe(`/p/${STACI_NPUB}`);
  });

  it("\"staci shop\" looks Staci up and offers her shop first", async () => {
    render(<HeaderSearchBox />);
    type("staci shop");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("staci");
    const row = screen.getByTestId("home-intent-row");
    expect(row).toHaveTextContent("Staci's shop");
    fireEvent.click(row);
    expect(dropdown()).toBeNull();
    expect(window.location.search).toMatch(/&t=shop$/);
  });

  it("a chip tap closes the list and lands on the scoped tab", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    fireEvent.click(screen.getByTestId("person-content-chip-shop"));
    expect(dropdown()).toBeNull();
    expect(window.location.search).toMatch(/&t=shop$/);
  });
});
