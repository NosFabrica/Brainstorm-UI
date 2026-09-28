// @vitest-environment jsdom
/**
 * The phone's search sheet is the home page's box laid out as a sheet: it asks for suggestions
 * once typing pauses, cancels what it no longer needs, shows recents and Browse as it opens,
 * and closes whenever it sends the reader somewhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

import { MobileSearchOverlay, openMobileSearch } from "./MobileSearchOverlay";
import { clearRecentSearches, pushRecentScoped } from "@/lib/recentSearches";
import { nip19 } from "nostr-tools";
import { scopedSearchHref } from "@/lib/searchSyntax";

const input = () => screen.getByTestId("input-home-search") as HTMLElement & { value: string };
const signalOf = (call: number) => (suggestMock.mock.calls[call][2] as { signal?: AbortSignal } | undefined)?.signal;
const sheetOpen = () => screen.queryByTestId("mobile-search-overlay") !== null;

/** A keystroke, as the contenteditable field hears one. */
function type(value: string) {
  input().value = value;
  fireEvent.input(input());
}

function renderOpen() {
  const view = render(<MobileSearchOverlay />);
  act(() => {
    openMobileSearch();
    vi.advanceTimersByTime(20);
  });
  return view;
}

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

describe("typing in the mobile search sheet", () => {
  it("asks for suggestions once, for the whole word, when typing pauses", () => {
    renderOpen();
    for (const prefix of ["v", "vi", "vit", "vito", "vitor"]) {
      type(prefix);
      act(() => { vi.advanceTimersByTime(200); });
    }
    act(() => { vi.advanceTimersByTime(400); });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(suggestMock.mock.calls[0][0]).toBe("vitor");
  });

  it("cancels a request that's under way when the next key lands", () => {
    renderOpen();
    type("vito");
    act(() => { vi.advanceTimersByTime(400); });
    expect(signalOf(0)?.aborted).toBe(false);
    type("vitor");
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the sheet closes", () => {
    renderOpen();
    type("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByTestId("mobile-search-close"));
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the sheet goes away", () => {
    const { unmount } = renderOpen();
    type("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("a product title under the people opens the listing itself", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([{
      event: { id: "t".repeat(64), kind: 30402, pubkey: "e".repeat(64), tags: [["d", "smiley"], ["title", "Satoshi Smiley T-shirt"], ["price", "21", "USD"]], content: "", created_at: 1, sig: "s" },
      author: null,
      rank: null,
    }]);
    renderOpen();
    type("satoshi");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    const row = screen.getByTestId("home-product-suggestion-0");
    expect(row).toHaveTextContent("Satoshi Smiley T-shirt");
    expect(row).toHaveTextContent("$21");
    fireEvent.click(row);
    expect(sheetOpen()).toBe(false);
    expect(window.location.pathname).toMatch(/^\/e\/(nevent1|t{64})/);
  });

  it("goes to the results right away on Enter, and closes", () => {
    renderOpen();
    type("vitor");
    fireEvent(input(), new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
    expect(window.location.search).toBe("?q=vitor");
    expect(sheetOpen()).toBe(false);
  });

  it("keeps \"See all\" up while there are words, even with no one suggested", async () => {
    suggestMock.mockResolvedValue([]);
    renderOpen();
    type("zzzz");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    fireEvent.mouseDown(screen.getByTestId("home-suggestion-see-all"));
    expect(window.location.search).toBe("?q=zzzz");
  });
});

describe("the sheet as it opens", () => {
  it("offers the Browse row at once, without waiting for a tap in the box", () => {
    renderOpen();
    fireEvent.click(screen.getByTestId("browse-music"));
    expect(sheetOpen()).toBe(false);
    expect(window.location.search).toBe("?t=music");
  });
});

describe("closing the sheet", () => {
  it("Escape closes it", () => {
    renderOpen();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(sheetOpen()).toBe(false);
  });

  it("an Escape the field took — closing its date picker — leaves the sheet and the words", () => {
    renderOpen();
    input().value = "gm since:";
    const last = input().lastChild as Node;
    const range = document.createRange();
    range.setStart(last, last.nodeType === 3 ? (last.textContent ?? "").length : last.childNodes.length);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent.input(input());
    expect(screen.getByTestId("input-home-search-picker")).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByTestId("input-home-search-picker")).toBeNull();
    expect(sheetOpen()).toBe(true);
    expect(input().value).toBe("gm since:");
  });

  it("opens empty again after a search, never on the last query", () => {
    renderOpen();
    type("vitor");
    fireEvent(input(), new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
    expect(sheetOpen()).toBe(false);
    act(() => { openMobileSearch(); });
    expect(input().value).toBe("");
    expect(screen.queryByTestId("container-home-suggestions")).toBeNull();
  });
});

describe("what a result publishes", () => {
  const STACI = "5".repeat(64);
  const STACI_NPUB = nip19.npubEncode(STACI);
  const shop = { key: "shop", label: "Shop", tab: "shop", liveNow: false };
  beforeEach(() => {
    contentMock.mockImplementation((pks: string[]) => new Map(pks.map((pk) => [pk, pk === STACI ? { chips: [shop] } : undefined])));
    suggestMock.mockResolvedValue([{ pubkey: STACI, npub: STACI_NPUB, name: "Staci" }]);
  });
  const typeStaci = async () => {
    renderOpen();
    type("staci");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
  };

  it("a result wears chips, and a link never sits inside a button", async () => {
    await typeStaci();
    const row = screen.getByTestId("home-suggestion-0");
    expect(row).toHaveAttribute("role", "option");
    expect(row.tagName).not.toBe("BUTTON");
    const chip = screen.getByTestId("person-content-chip-shop");
    expect(chip.getAttribute("href")).toBe(scopedSearchHref(STACI, "shop"));
    expect(chip).toHaveAttribute("aria-label", "Staci's shop");
    expect(chip.closest("button")).toBeNull();
  });

  it("\"staci shop\" looks Staci up and offers her shop first", async () => {
    renderOpen();
    type("staci shop");
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("staci");
    const row = screen.getByTestId("home-intent-row");
    expect(row).toHaveTextContent("Staci's shop");
    fireEvent.click(row);
    expect(sheetOpen()).toBe(false);
    expect(window.location.search).toMatch(/&t=shop$/);
  });

  it("tapping the row opens the person, and closes the sheet", async () => {
    await typeStaci();
    fireEvent.click(screen.getByTestId("home-suggestion-0"));
    expect(sheetOpen()).toBe(false);
    expect(window.location.pathname).toBe(`/p/${STACI_NPUB}`);
  });

  it("a chip tap closes the sheet and opens the scoped search", async () => {
    await typeStaci();
    fireEvent.click(screen.getByTestId("person-content-chip-shop"));
    expect(sheetOpen()).toBe(false);
    expect(window.location.search).toMatch(/&t=shop$/);
  });
});

describe("a scoped search in the sheet's recents", () => {
  const VINNEY = "7".repeat(64);
  const VINNEY_NPUB = nip19.npubEncode(VINNEY);

  it("reads as the person and the tab, and re-runs the scoped search", () => {
    pushRecentScoped({ pubkey: VINNEY, npub: VINNEY_NPUB, label: "vinney…axkl", picture: "https://img/vinney.jpg", tab: "media" });
    renderOpen();
    const row = screen.getByTestId("home-recent-scoped-0");
    expect(row).toHaveTextContent("vinney…axkl");
    expect(screen.getByTestId("home-recent-scoped-what-0")).toHaveTextContent("Media");
    expect(row).not.toHaveTextContent("npub1");
    fireEvent.click(row);
    expect(sheetOpen()).toBe(false);
    expect(new URLSearchParams(window.location.search).get("t")).toBe("media");
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${VINNEY_NPUB}`);
  });
});
