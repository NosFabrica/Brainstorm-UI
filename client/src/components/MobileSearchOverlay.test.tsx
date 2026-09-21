// @vitest-environment jsdom
/** The mobile search sheet asks for suggestions once typing pauses, and cancels what it no longer needs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const searchMock = vi.fn<(...args: unknown[]) => Promise<{ results: unknown[]; total: number; timeMs: number }>>();
vi.mock("@/lib/profileSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/profileSearch")>()),
  searchByText: (...args: unknown[]) => searchMock(...args),
}));
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
