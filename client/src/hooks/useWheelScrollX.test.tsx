// @vitest-environment jsdom
/**
 * Horizontal strips (facet chips, the People strip) must scroll as easily
 * with a desktop mouse as a phone swipes: a vertical wheel becomes a
 * horizontal scroll — until the strip's end, where the wheel goes back to
 * the page so it never traps the reader.
 */
import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { useState } from "react";
import { useWheelScrollX } from "./useWheelScrollX";

function Strip() {
  const ref = useWheelScrollX();
  return <div ref={ref} data-testid="strip" />;
}

/** jsdom has no layout — give the strip a fake overflowing geometry. */
function fakeOverflow(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  let left = 0;
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", {
    get: () => left,
    set: (v: number) => {
      left = v;
    },
    configurable: true,
  });
}

const wheel = (deltaY: number) => new WheelEvent("wheel", { deltaY, cancelable: true, bubbles: true });

/** The People strip's real shape: the element appears only once results
 *  stream in — well after the component (and the hook) first mounted. */
function LateStrip() {
  const ref = useWheelScrollX();
  const [ready, setReady] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setReady(true)}>load</button>
      {ready && <div ref={ref} data-testid="strip" />}
    </>
  );
}

describe("useWheelScrollX", () => {
  it("still works when the strip mounts after the hook did", () => {
    const { getByTestId, getByText } = render(<LateStrip />);
    act(() => getByText("load").click());
    const el = getByTestId("strip");
    fakeOverflow(el, 1000, 300);
    const ev = wheel(120);
    el.dispatchEvent(ev);
    expect(el.scrollLeft).toBe(120);
  });

  it("turns a vertical wheel into horizontal scroll and claims the event", () => {
    const el = render(<Strip />).getByTestId("strip");
    fakeOverflow(el, 1000, 300);
    const ev = wheel(120);
    el.dispatchEvent(ev);
    expect(el.scrollLeft).toBe(120);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("hands the wheel back to the page at the strip's end", () => {
    const el = render(<Strip />).getByTestId("strip");
    fakeOverflow(el, 1000, 300);
    el.scrollLeft = 700; // fully scrolled right
    const ev = wheel(120);
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(el.scrollLeft).toBe(700);
  });

  it("leaves a strip that doesn't overflow alone", () => {
    const el = render(<Strip />).getByTestId("strip");
    fakeOverflow(el, 300, 300);
    const ev = wheel(120);
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
