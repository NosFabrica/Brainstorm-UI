/**
 * The 404: a page ordinary people reach by clicking a link someone sent them
 * (tag pages route here when the tag doesn't exist, issue #41 B3). It wears
 * the house error page — the ostrich, the "Oops!", the site's links — but
 * keeps its own words and ways onward (Benjamin, 2026-09-11): a missing page
 * is not a server running behind, so nothing here offers to try again.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("shows the ostrich and Oops!, says the page isn't here, and offers home and tags — not Try again", () => {
    render(<NotFound />);

    expect(screen.getByTestId("sorry-art")).toHaveAttribute("src", "/brand/sorry-ostrich.png");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Oops!");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("This page isn't here.");
    expect(screen.getByText("The link might be out of date, or have a typo in it.")).toBeInTheDocument();
    expect(screen.getByTestId("notfound-home")).toHaveAttribute("href", "/");
    expect(screen.getByTestId("notfound-browse-tags")).toHaveAttribute("href", "/tags");
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    for (const label of ["About", "How search works", "Developers", "Q&A"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});
