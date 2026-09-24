// @vitest-environment jsdom
/** The mobile search sheet asks for suggestions once typing pauses, and cancels what it no longer needs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const searchMock = vi.fn<(...args: unknown[]) => Promise<{ results: unknown[]; total: number; timeMs: number }>>();
vi.mock("@/lib/profileSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/profileSearch")>()),
  searchByText: (...args: unknown[]) => searchMock(...args),
}));
const listingsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock("@/services/search", () => ({ suggestListings: (...args: unknown[]) => listingsMock(...args) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));

import { MobileSearchOverlay, openMobileSearch } from "./MobileSearchOverlay";

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
  listingsMock.mockReset();
  listingsMock.mockResolvedValue([]);
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

  it("a product title under the people opens the listing itself", async () => {
    searchMock.mockResolvedValue({ results: [], total: 0, timeMs: 1 });
    listingsMock.mockResolvedValue([{
      event: { id: "t".repeat(64), kind: 30402, pubkey: "e".repeat(64), tags: [["d", "smiley"], ["title", "Satoshi Smiley T-shirt"], ["price", "21", "USD"]], content: "", created_at: 1, sig: "s" },
      author: null,
      rank: null,
    }]);
    renderOpen();
    fireEvent.change(input(), { target: { value: "satoshi" } });
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    const row = screen.getByTestId("mobile-search-product-0");
    expect(row).toHaveTextContent("Satoshi Smiley T-shirt");
    expect(row).toHaveTextContent("$21");
    fireEvent.click(row);
    expect(window.location.pathname).toMatch(/^\/e\/(nevent1|t{64})/);
  });

  it("goes to the results right away on Enter", () => {
    renderOpen();
    fireEvent.change(input(), { target: { value: "vitor" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.search).toBe("?q=vitor");
  });
});
