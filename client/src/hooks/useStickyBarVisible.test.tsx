import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useStickyBarVisible } from "./useStickyBarVisible";

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo(0);
});

describe("useStickyBarVisible", () => {
  it("steps aside while the reader scrolls down, and comes back on the way up", () => {
    const { result } = renderHook(() => useStickyBarVisible({ current: null }));
    expect(result.current).toBe(true);
    scrollTo(400);
    expect(result.current).toBe(false);
    scrollTo(396); // a jitter is not a direction
    expect(result.current).toBe(false);
    scrollTo(300);
    expect(result.current).toBe(true);
  });

  it("always shows near the top", () => {
    const { result } = renderHook(() => useStickyBarVisible({ current: null }));
    scrollTo(400);
    scrollTo(500);
    expect(result.current).toBe(false);
    scrollTo(40);
    expect(result.current).toBe(true);
  });

  it("steps aside while the in-page call to action is on screen", () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { result } = renderHook(() => useStickyBarVisible({ current: document.createElement("a") }));
    act(() => report([{ isIntersecting: true }]));
    expect(result.current).toBe(false);
    act(() => report([{ isIntersecting: false }]));
    expect(result.current).toBe(true);
  });
});
