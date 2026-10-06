import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useKeyboardViewport } from "./useKeyboardViewport";

/** A phone: a coarse pointer, and a visual viewport we can shrink like the keyboard does. */
function phone({ touch = true } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const vv = {
    offsetTop: 0,
    height: window.innerHeight,
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  };
  vi.stubGlobal("visualViewport", vv);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: touch && q === "(pointer: coarse)" }));
  const keyboard = (height: number, offsetTop: number) =>
    act(() => {
      vv.height = height;
      vv.offsetTop = offsetTop;
      listeners.get("resize")?.forEach((fn) => fn());
    });
  return { keyboard, listeners };
}

afterEach(() => vi.unstubAllGlobals());

describe("useKeyboardViewport", () => {
  it("leaves the page alone until a field has focus", () => {
    phone();
    const { result } = renderHook(() => useKeyboardViewport(false));
    expect(result.current).toBeUndefined();
  });

  it("pins the page to what is visible above the keyboard, wherever iOS scrolled the document", () => {
    const { keyboard } = phone();
    const { result } = renderHook(() => useKeyboardViewport(true));
    keyboard(400, 120);
    expect(result.current).toMatchObject({ position: "fixed", top: 120, height: 400 });
    // The keyboard covers the home indicator: the foot drops its safe-area padding.
    expect(result.current).toHaveProperty("--bs-bottom-inset", "0px");
  });

  it("keeps the safe-area padding while nothing covers the bottom edge", () => {
    phone();
    const { result } = renderHook(() => useKeyboardViewport(true));
    expect(result.current).not.toHaveProperty("--bs-bottom-inset");
  });

  it("does nothing with a mouse, and lets go of the viewport on blur", () => {
    phone({ touch: false });
    expect(renderHook(() => useKeyboardViewport(true)).result.current).toBeUndefined();

    const { listeners } = phone();
    const { result, rerender } = renderHook(({ on }) => useKeyboardViewport(on), { initialProps: { on: true } });
    expect(result.current).toBeDefined();
    rerender({ on: false });
    expect(result.current).toBeUndefined();
    expect(listeners.get("resize")?.size).toBe(0);
  });
});
