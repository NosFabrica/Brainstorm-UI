// @vitest-environment jsdom
/**
 * The Brainstorm / My perspective control. One component, two seats: the
 * centered pill under the box on the pristine landing, and a compact version
 * in the results tab row (so results start two rows higher — Benjamin found
 * the stacked chrome "distracting").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PerspectiveToggle } from "./PerspectiveToggle";

beforeEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/?q=jack");
});

describe("PerspectiveToggle", () => {
  it("signed out: Brainstorm is the fixed view, My perspective is the door to sign-in", () => {
    render(<PerspectiveToggle pov="nosfabrica" user={null} hasMywot={false} isSearchObserver={false} onChange={() => {}} />);
    expect(screen.getByTestId("text-home-pov-label")).toHaveTextContent("Brainstorm");
    fireEvent.click(screen.getByTestId("toggle-home-pov-signin"));
    expect(window.location.pathname).toBe("/login");
  });

  it("signed in and permitted: the two segments switch the perspective", () => {
    const onChange = vi.fn();
    render(<PerspectiveToggle pov="nosfabrica" user={{ picture: null }} hasMywot isSearchObserver onChange={onChange} />);
    expect(screen.getByTestId("toggle-home-pov-nosfabrica").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("toggle-home-pov-mywot"));
    expect(onChange).toHaveBeenCalledWith("mywot");
  });

  // No graph yet → the segment is a door to calculating one, not a dead
  // disabled button; the full variant also spells it out.
  it("without a calculated graph, My perspective leads to Settings", () => {
    const onChange = vi.fn();
    render(<PerspectiveToggle pov="nosfabrica" user={{ picture: null }} hasMywot={false} isSearchObserver={false} onChange={onChange} />);
    expect(screen.getByTestId("link-home-calculate-yours")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("toggle-home-pov-mywot"));
    expect(onChange).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/settings");
  });

  it("with a graph but no observer permission, the segment is disabled and says why", () => {
    render(<PerspectiveToggle pov="nosfabrica" user={{ picture: null }} hasMywot isSearchObserver={false} onChange={() => {}} />);
    const mine = screen.getByTestId("toggle-home-pov-mywot");
    expect(mine).toBeDisabled();
    expect(mine.getAttribute("title")).toMatch(/isn't available/);
  });

  it("compact: same segments, 'What is this?' becomes an info icon, no Calculate-yours line", () => {
    render(<PerspectiveToggle compact pov="nosfabrica" user={{ picture: null }} hasMywot={false} isSearchObserver={false} onChange={() => {}} />);
    expect(screen.queryByTestId("link-home-calculate-yours")).toBeNull();
    const info = screen.getByTestId("link-home-learn-more");
    expect(info.getAttribute("aria-label")).toBe("What is this?");
    fireEvent.click(info);
    expect(window.location.pathname).toBe("/personalization");
  });
});
