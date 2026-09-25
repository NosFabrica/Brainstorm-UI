// @vitest-environment jsdom
/** The header box asks for suggestions once typing pauses, and cancels what it no longer needs. */
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
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));

import { HeaderSearchBox } from "./HeaderSearchBox";

const input = () => screen.getByTestId("header-search-input");
const signalOf = (call: number) => searchMock.mock.calls[call][4] as AbortSignal | undefined;

function typeSlowly(word: string) {
  for (let i = 1; i <= word.length; i++) {
    fireEvent.change(input(), { target: { value: word.slice(0, i) } });
    act(() => { vi.advanceTimersByTime(200); });
  }
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

describe("typing in the header search", () => {
  it("asks for suggestions once, for the whole word, when typing pauses", () => {
    render(<HeaderSearchBox />);
    typeSlowly("vitor");
    act(() => { vi.advanceTimersByTime(400); });
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][0]).toBe("vitor");
  });

  it("asks nobody while a filter prefix is typed — `doi:` is not a name", () => {
    render(<HeaderSearchBox />);
    typeSlowly("doi:10.1000");
    typeSlowly("sort:rec");
    act(() => { vi.advanceTimersByTime(400); });
    expect(searchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("header-search-suggestions")).toBeNull();
  });

  it("cancels a request that's under way when the next key lands", () => {
    render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "vito" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(signalOf(0)?.aborted).toBe(false);
    fireEvent.change(input(), { target: { value: "vitor" } });
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the box goes away", () => {
    const { unmount } = render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "vitor" } });
    act(() => { vi.advanceTimersByTime(400); });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("sends nothing when the box is closed during the pause, and it stays closed", () => {
    render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "vitor" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(searchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("header-search-suggestions")).toBeNull();
  });

  it("cancels a request when the box closes, and it stays closed", async () => {
    render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "vitor" } });
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.keyDown(input(), { key: "Escape" });
    await act(async () => {});
    expect(signalOf(0)?.aborted).toBe(true);
    expect(screen.queryByTestId("header-search-suggestions")).toBeNull();
  });

  it("a product title under the people opens the listing itself", async () => {
    searchMock.mockResolvedValue({ results: [], total: 0, timeMs: 1 });
    listingsMock.mockResolvedValue([{
      event: { id: "t".repeat(64), kind: 30402, pubkey: "e".repeat(64), tags: [["d", "smiley"], ["title", "Satoshi Smiley T-shirt"], ["price", "21", "USD"]], content: "", created_at: 1, sig: "s" },
      author: null,
      rank: null,
    }]);
    render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "satoshi" } });
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    const row = screen.getByTestId("header-search-product-0");
    expect(row).toHaveTextContent("Satoshi Smiley T-shirt");
    expect(row).toHaveTextContent("$21");
    fireEvent.click(row);
    expect(window.location.pathname).toMatch(/^\/e\/(nevent1|t{64})/);
  });

  it("goes to the results right away on Enter", () => {
    render(<HeaderSearchBox />);
    fireEvent.change(input(), { target: { value: "vitor" } });
    fireEvent.submit(input().closest("form")!);
    expect(window.location.search).toBe("?q=vitor");
  });
});
