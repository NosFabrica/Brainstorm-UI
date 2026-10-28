// @vitest-environment jsdom
/**
 * A scrolling strip says it scrolls: it fades at an edge it has more past, as it scrolls.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { edgeFade, useScrollEdges } from "./useScrollEdges";

function Strip() {
  const [ref, edges] = useScrollEdges();
  return (
    <div ref={ref} style={edgeFade(edges)} data-testid="strip" data-edges={`${edges.start}-${edges.end}`}>
      tabs
    </div>
  );
}

/** jsdom lays nothing out: the strip's sizes, as a browser would measure them. */
function sized(el: HTMLElement, { client, scroll }: { client: number; scroll: number }) {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
}

describe("useScrollEdges", () => {
  it("fades the far edge while more lies past it, the near one once scrolled, neither when it fits", () => {
    const { rerender } = render(<Strip />);
    const strip = screen.getByTestId("strip");
    expect(strip.dataset.edges).toBe("false-false");

    sized(strip, { client: 270, scroll: 380 });
    rerender(<Strip />);
    expect(strip.dataset.edges).toBe("false-true");

    act(() => {
      strip.scrollLeft = 110;
      fireEvent.scroll(strip);
    });
    expect(strip.dataset.edges).toBe("true-false");

    act(() => {
      strip.scrollLeft = 50;
      fireEvent.scroll(strip);
    });
    expect(strip.dataset.edges).toBe("true-true");
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
