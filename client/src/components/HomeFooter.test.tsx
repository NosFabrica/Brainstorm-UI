// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeFooter } from "./HomeFooter";

const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", (to: string) => navigate(to)] }));

describe("HomeFooter", () => {
  beforeEach(() => navigate.mockClear());

  // The home page is where most people arrive, signed in or not, and its row
  // is the one footer they all pass — so the documents live there too.
  it("ends with Privacy and Terms, after the four links it always had", () => {
    render(<HomeFooter />);
    const labels = Array.from(screen.getByTestId("footer-home").querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["About", "How search works", "Developers", "Q&A", "Privacy", "Terms"]);

    fireEvent.click(screen.getByTestId("footer-home-privacy"));
    expect(navigate).toHaveBeenLastCalledWith("/privacy");
    fireEvent.click(screen.getByTestId("footer-home-terms"));
    expect(navigate).toHaveBeenLastCalledWith("/terms");
  });
});
