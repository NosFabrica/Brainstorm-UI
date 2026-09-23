/**
 * Search pages the reader in as they scroll (2026-09-09), so a long read
 * ends far from the box and the tabs. A "Back to top" pill appears once
 * they are deep — X, YouTube — and takes them back in one tap.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BackToTop } from "./BackToTop";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  fireEvent.scroll(window);
}

afterEach(() => {
  scrollTo(0);
  vi.restoreAllMocks();
});

describe("BackToTop", () => {
  it("stays out of the way near the top, appears once the reader is deep, and takes them back up", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    const jump = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<BackToTop />);
    expect(screen.queryByTestId("back-to-top")).toBeNull();
    scrollTo(900);
    expect(screen.queryByTestId("back-to-top")).toBeNull();
    scrollTo(1700);
    const pill = screen.getByTestId("back-to-top");
    expect(pill).toHaveAccessibleName(/back to top/i);
    fireEvent.click(pill);
    expect(jump).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
