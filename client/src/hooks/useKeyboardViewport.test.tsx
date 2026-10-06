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
  const keyboard = (height: number, offsetTop: number) => {
    vv.height = height;
    vv.offsetTop = offsetTop;
    listeners.get("resize")?.forEach((fn) => fn());
  };
  return { keyboard, listeners };
}

function page() {
  return { current: document.createElement("div") };
}

afterEach(() => vi.unstubAllGlobals());

describe("useKeyboardViewport", () => {
  it("leaves the page alone until a field has focus", () => {
    phone();
    const target = page();
    renderHook(() => useKeyboardViewport(false, target));
    expect(target.current.style.position).toBe("");
  });

  it("pins the page to what is visible above the keyboard, wherever iOS scrolled the document", () => {
    const { keyboard } = phone();
    const target = page();
    renderHook(() => useKeyboardViewport(true, target));
    keyboard(400, 120);
    expect(target.current.style).toMatchObject({ position: "fixed", top: "120px", height: "400px" });
    // The keyboard covers the home indicator: the foot drops its safe-area padding.
    expect(target.current.style.getPropertyValue("--bs-bottom-inset")).toBe("0px");
  });

  it("pins before the first frame, and follows the keyboard without re-rendering the page", () => {
    const { keyboard } = phone();
    const target = page();
    let renders = 0;
    renderHook(() => {
      renders++;
      useKeyboardViewport(true, target);
    });
    expect(target.current.style.position).toBe("fixed"); // set in the layout pass, before paint
    const before = renders;
    for (let h = 800; h > 400; h -= 20) keyboard(h, 0); // the keyboard sliding up
    expect(renders).toBe(before);
    expect(target.current.style.height).toBe("420px");
  });

  it("keeps the safe-area padding while nothing covers the bottom edge", () => {
    phone();
    const target = page();
    renderHook(() => useKeyboardViewport(true, target));
    expect(target.current.style.getPropertyValue("--bs-bottom-inset")).toBe("");
  });

  it("does nothing with a mouse, and lets go of the page — and the viewport — on blur", () => {
    phone({ touch: false });
    const desk = page();
    renderHook(() => useKeyboardViewport(true, desk));
    expect(desk.current.style.position).toBe("");

    const { listeners, keyboard } = phone();
    const target = page();
    const { rerender } = renderHook(({ on }) => useKeyboardViewport(on, target), { initialProps: { on: true } });
    keyboard(400, 50);
    expect(target.current.style.position).toBe("fixed");
    act(() => rerender({ on: false }));
    expect(target.current.getAttribute("style") ?? "").toBe("");
    expect(listeners.get("resize")?.size).toBe(0);
  });
});
