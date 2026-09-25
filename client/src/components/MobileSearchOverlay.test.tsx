// @vitest-environment jsdom
/** The mobile search sheet asks for suggestions once typing pauses, and cancels what it no longer needs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const searchMock = vi.fn<(...args: unknown[]) => Promise<{ results: unknown[]; total: number; timeMs: number }>>();
vi.mock("@/lib/profileSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/profileSearch")>()),
  searchByText: (...args: unknown[]) => searchMock(...args),
}));
const contentMock = vi.fn((_pks: string[]) => new Map<string, unknown>());
vi.mock("@/hooks/usePersonContent", () => ({ usePersonContent: (pks: string[]) => contentMock(pks) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));

import { MobileSearchOverlay, openMobileSearch } from "./MobileSearchOverlay";
import { pushRecentScoped } from "@/lib/recentSearches";
import { nip19 } from "nostr-tools";
import { scopedSearchHref } from "@/lib/searchSyntax";

const input = () => screen.getByTestId("mobile-search-input");
const signalOf = (call: number) => searchMock.mock.calls[call][4] as AbortSignal | undefined;

function renderOpen() {
  const view = render(<MobileSearchOverlay />);
  act(() => {
    openMobileSearch();
    vi.advanceTimersByTime(20);
  });
  return view;
}

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockImplementation(() => new Promise(() => {}));
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
      fireEvent.change(input(), { target: { value: prefix } });
      act(() => { vi.advanceTimersByTime(200); });
    }
    act(() => { vi.advanceTimersByTime(400); });
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][0]).toBe("vitor");
  });

  it("cancels a request that's under way when the next key lands", () => {
    renderOpen();
    fireEvent.change(input(), { target: { value: "vito" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(signalOf(0)?.aborted).toBe(false);
    fireEvent.change(input(), { target: { value: "vitor" } });
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the sheet closes", () => {
    renderOpen();
    fireEvent.change(input(), { target: { value: "vitor" } });
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.click(screen.getByTestId("mobile-search-close"));
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the sheet goes away", () => {
    const { unmount } = renderOpen();
    fireEvent.change(input(), { target: { value: "vitor" } });
    act(() => { vi.advanceTimersByTime(400); });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("goes to the results right away on Enter", () => {
    renderOpen();
    fireEvent.change(input(), { target: { value: "vitor" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.search).toBe("?q=vitor");
  });
});

describe("what a result publishes", () => {
  const STACI = "5".repeat(64);
  const STACI_NPUB = nip19.npubEncode(STACI);
  const shop = { key: "shop", label: "Shop", tab: "shop", liveNow: false };
  beforeEach(() => {
    contentMock.mockReset();
    contentMock.mockImplementation((pks: string[]) => new Map(pks.map((pk) => [pk, pk === STACI ? { chips: [shop] } : undefined])));
    searchMock.mockResolvedValue({ results: [{ pubkey: STACI, npub: STACI_NPUB, name: "Staci" }], total: 1, timeMs: 1 });
  });
  const typeStaci = async () => {
    renderOpen();
    fireEvent.change(input(), { target: { value: "staci" } });
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
  };

  it("a result wears chips, and a link never sits inside a button", async () => {
    await typeStaci();
    const row = screen.getByTestId("mobile-search-result");
    expect(row).toHaveAttribute("role", "button");
    expect(row.tagName).not.toBe("BUTTON");
    const chip = screen.getByTestId("person-content-chip-shop");
    expect(chip.getAttribute("href")).toBe(scopedSearchHref(STACI, "shop"));
    expect(chip).toHaveAttribute("aria-label", "Staci's shop");
    expect(chip.closest("button")).toBeNull();
  });

  it("Enter on the row still opens the person", async () => {
    await typeStaci();
    fireEvent.keyDown(screen.getByTestId("mobile-search-result"), { key: "Enter" });
    expect(window.location.pathname).toBe(`/p/${STACI_NPUB}`);
  });

  it("a chip tap closes the sheet and opens the scoped search", async () => {
    await typeStaci();
    fireEvent.click(screen.getByTestId("person-content-chip-shop"));
    expect(screen.queryByTestId("mobile-search-input")).toBeNull();
    expect(window.location.search).toMatch(/&t=shop$/);
  });
});

describe("a scoped search in the sheet's recents", () => {
  const VINNEY = "7".repeat(64);
  const VINNEY_NPUB = nip19.npubEncode(VINNEY);

  it("reads as the person and the tab, and re-runs the scoped search", () => {
    pushRecentScoped({ pubkey: VINNEY, npub: VINNEY_NPUB, label: "vinney…axkl", picture: "https://img/vinney.jpg", tab: "media" });
    renderOpen();
    const row = screen.getByTestId("mobile-search-recent-scoped");
    expect(row).toHaveTextContent("vinney…axkl");
    expect(screen.getByTestId("mobile-search-recent-what")).toHaveTextContent("Media");
    expect(row).not.toHaveTextContent("npub1");
    fireEvent.click(row);
    expect(screen.queryByTestId("mobile-search-input")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("t")).toBe("media");
    expect(new URLSearchParams(window.location.search).get("q")).toBe(`from:${VINNEY_NPUB}`);
  });
});
