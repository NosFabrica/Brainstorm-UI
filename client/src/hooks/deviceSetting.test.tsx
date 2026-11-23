// @vitest-environment jsdom
/**
 * Every coin and ring on a page reads the display setting: one store holds it
 * for all of them, with one pair of window listeners, and still follows a
 * change made in this tab or another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { setScoreDisplayMode, useScoreDisplayMode } from "./useScoreDisplayMode";

function Reader({ i }: { i: number }) {
  const [mode] = useScoreDisplayMode();
  return <span data-testid={`r${i}`}>{mode}</span>;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a device setting's store", () => {
  it("holds one pair of window listeners for a page of readers", () => {
    const add = vi.spyOn(window, "addEventListener");
    render(
      <>
        {Array.from({ length: 50 }, (_, i) => (
          <Reader key={i} i={i} />
        ))}
      </>,
    );
    expect(add.mock.calls.filter(([type]) => type === "storage")).toHaveLength(1);
    expect(screen.getByTestId("r49")).toHaveTextContent("word");
  });

  it("follows a change from this tab and from another", () => {
    render(
      <>
        <Reader i={0} />
        <Reader i={1} />
      </>,
    );
    act(() => setScoreDisplayMode("number"));
    expect(screen.getByTestId("r1")).toHaveTextContent("number");

    act(() => {
      localStorage.setItem("brainstorm_score_display:anon", "off");
      window.dispatchEvent(new StorageEvent("storage", { key: "brainstorm_score_display:anon" }));
    });
    expect(screen.getByTestId("r0")).toHaveTextContent("off");
  });

  it("reads afresh for a page mounted after the setting changed with nobody listening", () => {
    render(<Reader i={0} />);
    expect(screen.getByTestId("r0")).toHaveTextContent("word");
    cleanup();
    localStorage.setItem("brainstorm_score_display:anon", "tier");
    render(<Reader i={0} />);
    expect(screen.getByTestId("r0")).toHaveTextContent("tier");
  });
});
