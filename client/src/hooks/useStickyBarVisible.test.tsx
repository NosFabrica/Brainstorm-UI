import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useStickyBarVisible } from "./useStickyBarVisible";

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

/** An IntersectionObserver the test drives: `report` says whether the watched element is on screen. */
function observer() {
  const watched: Element[] = [];
  let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof report) {
        report = cb;
      }
      observe(el: Element) {
        watched.push(el);
      }
      disconnect() {}
    },
  );
  return { watched, report: (on: boolean) => act(() => report([{ isIntersecting: on }])) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo(0);
});

describe("useStickyBarVisible", () => {
  it("steps aside while the reader scrolls down, and comes back on the way up", () => {
    const { result } = renderHook(() => useStickyBarVisible());
    expect(result.current.shown).toBe(true);
    scrollTo(400);
    expect(result.current.shown).toBe(false);
    scrollTo(396); // a jitter is not a direction
    expect(result.current.shown).toBe(false);
    scrollTo(300);
    expect(result.current.shown).toBe(true);
  });

  it("always shows near the top", () => {
    const { result } = renderHook(() => useStickyBarVisible());
    scrollTo(400);
    scrollTo(500);
    expect(result.current.shown).toBe(false);
    scrollTo(40);
    expect(result.current.shown).toBe(true);
  });

  it("steps aside while the in-page call to action is on screen — even one that mounts later", () => {
    const io = observer();
    const { result } = renderHook(() => useStickyBarVisible());
    expect(io.watched).toHaveLength(0); // nothing to watch yet: the profile is loading
    const link = document.createElement("a");
    act(() => result.current.inlineRef(link));
    expect(io.watched).toEqual([link]);
    io.report(true);
    expect(result.current.shown).toBe(false);
    io.report(false);
    expect(result.current.shown).toBe(true);
  });

  it("shows again once the in-page call to action goes away", () => {
    const io = observer();
    const { result } = renderHook(() => useStickyBarVisible());
    act(() => result.current.inlineRef(document.createElement("a")));
    io.report(true);
    expect(result.current.shown).toBe(false);
    act(() => result.current.inlineRef(null)); // signed in: the inline Join is gone
    expect(result.current.shown).toBe(true);
  });
});
