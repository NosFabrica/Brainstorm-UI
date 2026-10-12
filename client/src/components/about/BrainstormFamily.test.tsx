// @vitest-environment jsdom
/**
 * "The Brainstorm family" on /about: Search, Vendors and Music are live and open
 * their own vertical; Communities is last, still coming.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { BrainstormFamily } from "./BrainstormFamily";

describe("BrainstormFamily", () => {
  it("lists Search, Vendors and Music as live, and Communities last as coming soon", () => {
    render(<BrainstormFamily navigate={() => {}} />);
    const cards = screen.getAllByTestId(/^card-family-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "card-family-search",
      "card-family-vendors",
      "card-family-music",
      "card-family-communities",
    ]);
    for (const id of ["card-family-search", "card-family-vendors", "card-family-music"]) {
      expect(within(screen.getByTestId(id)).getByText("Live")).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("card-family-communities")).getByText("Coming soon")).toBeInTheDocument();
    expect(within(screen.getByTestId("card-family-communities")).queryByRole("button")).toBeNull();
  });

  it("a live card opens its vertical", () => {
    const navigate = vi.fn();
    render(<BrainstormFamily navigate={navigate} />);
    fireEvent.click(screen.getByTestId("card-family-vendors"));
    expect(navigate).toHaveBeenLastCalledWith("/?t=shop");
    fireEvent.click(screen.getByTestId("card-family-music"));
    expect(navigate).toHaveBeenLastCalledWith("/?t=music");
    fireEvent.click(screen.getByTestId("card-family-search"));
    expect(navigate).toHaveBeenLastCalledWith("/");
  });
});
