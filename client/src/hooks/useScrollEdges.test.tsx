// @vitest-environment jsdom
/**
 * A scrolling strip says it scrolls: it fades at an edge it has more past, as it scrolls — measured
 * a frame after each change, never while rendering.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { edgeFade, useScrollEdges } from "./useScrollEdges";

let renders = 0;
function Strip() {
  renders++;
  const [ref, edges] = useScrollEdges();
  return (
    <div ref={ref} style={edgeFade(edges)} data-testid="strip" data-edges={`${edges.start}-${edges.end}`}>
      tabs
    </div>
  );
}

/** jsdom lays nothing out: the strip's sizes, as a browser would measure them. */
function sized(el: HTMLElement, { client, scroll }: { client: number; scroll: number | (() => number) }) {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    get: typeof scroll === "function" ? scroll : () => scroll,
  });
}
const scrollTo = (el: HTMLElement, left: number) =>
  act(() => {
    el.scrollLeft = left;
    fireEvent.scroll(el);
  });

describe("useScrollEdges", () => {
  it("fades the far edge while more lies past it, the near one once scrolled", async () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    expect(strip.dataset.edges).toBe("false-false");

    sized(strip, { client: 270, scroll: 380 });
    scrollTo(strip, 0);
    await waitFor(() => expect(strip.dataset.edges).toBe("false-true"));
    scrollTo(strip, 110);
    await waitFor(() => expect(strip.dataset.edges).toBe("true-false"));
    scrollTo(strip, 50);
    await waitFor(() => expect(strip.dataset.edges).toBe("true-true"));
  });

  it("a pixel over is no more past the edge", async () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    sized(strip, { client: 270, scroll: 271.5 });
    scrollTo(strip, 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(strip.dataset.edges).toBe("false-false");
  });

  it("a fade that shifts what the strip measures settles; it never loops", async () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    // More past the edge without the fade, none with it: measured in each render, this looped until
    // React gave up ("Maximum update depth exceeded", seen on Android, 2026-10-28).
    sized(strip, { client: 270, scroll: () => (strip.dataset.edges === "false-true" ? 270 : 300) });
    renders = 0;
    scrollTo(strip, 0);
    await waitFor(() => expect(strip.dataset.edges).toBe("false-true"));
    await new Promise((r) => setTimeout(r, 100));
    expect(strip.dataset.edges).toBe("false-true");
    expect(renders).toBeLessThan(4);
  });
});

describe("edgeFade", () => {
  it("is no mask when the strip fits, and a fade at each edge it has more past", () => {
    expect(edgeFade({ start: false, end: false })).toBeUndefined();
    expect(edgeFade({ start: false, end: true })?.maskImage).toBe(
      "linear-gradient(to right, black 0, black 0, black calc(100% - 1.5rem), transparent 100%)",
    );
    expect(edgeFade({ start: true, end: false })?.maskImage).toBe(
      "linear-gradient(to right, transparent 0, black 1.5rem, black calc(100% - 0px), black 100%)",
    );
  });
});
