// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeFooter } from "./HomeFooter";

const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", (to: string) => navigate(to)] }));

describe("HomeFooter", () => {
  beforeEach(() => navigate.mockClear());

  // The search page stays quiet (Benjamin, 2026-09-10): Privacy and Terms
  // live in the site footer and at checkout, not under the search box.
  it("keeps to About · How search works · Developers · Q&A", () => {
    render(<HomeFooter />);
    const labels = Array.from(screen.getByTestId("footer-home").querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["About", "How search works", "Developers", "Q&A"]);

    fireEvent.click(screen.getByTestId("footer-home-about"));
    expect(navigate).toHaveBeenLastCalledWith("/about");
  });
});
