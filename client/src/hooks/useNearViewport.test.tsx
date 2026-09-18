// @vitest-environment jsdom
/** Whether an element has come near the screen — once it has, it stays "near". */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { __resetNearViewport, useNearViewport } from "./useNearViewport";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

let io: ReturnType<typeof stubControllableIntersectionObserver>;

function Probe({ id, margin = "200px" }: { id: string; margin?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const near = useNearViewport(ref, margin);
  return <span ref={ref} data-testid={id}>{near ? "near" : "far"}</span>;
}

beforeEach(() => {
  __resetNearViewport();
  io = stubControllableIntersectionObserver();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNearViewport", () => {
  it("is far until the element comes near, and stays near after it leaves", () => {
    render(<Probe id="a" />);
    const el = screen.getByTestId("a");
    expect(el).toHaveTextContent("far");
    io.observers[0].report(el, true);
    expect(el).toHaveTextContent("near");
    io.observers[0].report(el, false);
    expect(el).toHaveTextContent("near");
  });

  it("watches every element with the same margin through one observer", () => {
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
        <Probe id="c" margin="400px" />
      </>,
    );
    expect(io.observers.map((o) => o.options?.rootMargin)).toEqual(["200px", "400px"]);
    expect(io.observers[0].observed.size).toBe(2);
  });

  it("stops watching an element once it's near or gone", () => {
    const { unmount } = render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    );
    io.observers[0].report(screen.getByTestId("a"), true);
    expect(io.observers[0].observed.size).toBe(1);
    unmount();
    expect(io.observers[0].observed.size).toBe(0);
  });

  it("is near straight away where there's no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe id="a" />);
    expect(screen.getByTestId("a")).toHaveTextContent("near");
  });
});
