/**
 * A render crash used to white-screen the app. Now it is the sorry page's
 * third scope — "Something went wrong" — and moving to another page clears
 * it (2026-09-09).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ live }: { live: boolean }) {
  if (live) throw new Error("kaboom");
  return <div data-testid="fine">fine</div>;
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("a page that throws becomes the sorry page, and a new location clears it", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Bomb live />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("sorry-app")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong.");
    rerender(
      <ErrorBoundary resetKey="/b">
        <Bomb live={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("fine")).toBeInTheDocument();
    expect(screen.queryByTestId("sorry-app")).toBeNull();
  });

  it("a dev build says what crashed, once, under the sorry page — a phone has no console to read it in", () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Bomb live />
      </ErrorBoundary>,
    );
    const details = screen.getByTestId("crash-details");
    expect(details).toHaveTextContent("Error: kaboom");
    expect(details.textContent!.split("kaboom")).toHaveLength(2);
    expect(details).toHaveTextContent("Bomb");
  });
});
