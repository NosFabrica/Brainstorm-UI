/**
 * The sorry page: what the app shows where the thing that is down would
 * have been — the mockup's "Oops!" over the house's quiet body, the brand's
 * wordmark, a Try again that keeps trying, and the site's links so nobody
 * is stranded (Benjamin, 2026-09-09; the Twitter fail whale as the
 * reference, the bare nginx 500 as the thing never to show).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SorryPage } from "./SorryPage";

describe("SorryPage", () => {
  it("search down: the wordmark, Oops!, the search line, the body, Try again, the countdown and the site's links", () => {
    const retry = vi.fn();
    render(<SorryPage scope="search" variant="page" onRetry={retry} nextTryInSec={12} />);
    expect(screen.getAllByRole("img", { name: /brainstorm/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Oops!");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Search is running behind.");
    expect(screen.getByText(/working hard to catch up/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sorry-countdown")).toHaveTextContent("Checking again in 12s");
    for (const label of ["About", "How search works", "Developers", "Q&A"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("api down offers the search as the way out; search down offers the dashboard only to someone signed in", () => {
    const { unmount } = render(<SorryPage scope="api" variant="page" onRetry={() => {}} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Brainstorm is running behind.");
    expect(screen.getByTestId("sorry-secondary")).toHaveAttribute("href", "/");
    unmount();
    const anon = render(<SorryPage scope="search" variant="inline" onRetry={() => {}} />);
    expect(screen.queryByTestId("sorry-secondary")).toBeNull();
    anon.unmount();
    render(<SorryPage scope="search" variant="inline" onRetry={() => {}} signedIn />);
    expect(screen.getByTestId("sorry-secondary")).toHaveAttribute("href", "/dashboard");
  });

  it("a crashed page says something went wrong, without Oops", () => {
    render(<SorryPage scope="app" variant="page" onRetry={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong.");
    expect(screen.queryByText("Oops!")).toBeNull();
  });

  it("while a check runs the button says so and the countdown pauses", () => {
    render(<SorryPage scope="api" variant="page" onRetry={() => {}} checking nextTryInSec={9} />);
    expect(screen.getByTestId("sorry-retry")).toHaveTextContent("Checking…");
    expect(screen.getByTestId("sorry-retry")).toBeDisabled();
    expect(screen.queryByTestId("sorry-countdown")).toBeNull();
  });

  // The illustration lands as a file, not a code change (Benjamin: wait for
  // the mockup's art); until then the slot leaves the layout.
  it("the art slot points at the brand file and leaves the layout when the file is not there", () => {
    render(<SorryPage scope="search" variant="page" onRetry={() => {}} />);
    const art = screen.getByTestId("sorry-art");
    expect(art).toHaveAttribute("src", "/brand/sorry-ostrich.png");
    fireEvent.error(art);
    expect(screen.queryByTestId("sorry-art")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Oops!");
  });
});
